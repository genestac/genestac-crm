"""
openai_agent.py
WhatsApp AI agent — Aalya, GLP-1 Care Consultant for Genestac Therapeutics.

Key capabilities:
  1. GLP-1 intake form on first message
  2. Save all lead fields (name, gender, age, height, weight, medical_history, address, pincode)
  3. Sell Mounjaro/GLP-1 injections — recommend 2.5mg starter, show MRP with 10% discount
  4. Schedule WhatsApp follow-ups (talk later → 6h)
  5. Book Google Meet consultation — check doctor availability, create Meet, send confirmation
     to BOTH lead and doctor via WhatsApp
  6. Generate Proforma Invoice via Cart → CartItems → Razorpay
     Send BOTH the invoice details AND the payment link on WhatsApp
"""

import os
import json
import openai
import asyncio
from datetime import datetime, timedelta
from supabase import Client
from typing import Dict, Any, Tuple, Optional
from zoneinfo import ZoneInfo

# ── Initialise OpenAI ─────────────────────────────────────────────────────────
oai_client = openai.OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
IST = ZoneInfo("Asia/Kolkata")

# ── Intake form text (sent verbatim on first message) ─────────────────────────
INTAKE_FORM_TEXT = (
    "Thank you for your interest in Genestac Therapeutics! 🙏\n\n"
    "To assess your eligibility for our GLP-1 Weight Management Program, "
    "please fill in the details below and send your responses in the same format:\n\n"
    "• Full Name: _________\n"
    "• Age / Gender: _________\n"
    "• Height / Current Body Weight: __________\n"
    "• Relevant Medical History / Pre-existing Conditions: _____\n"
    "• Current Residential Address: _____________\n"
    "• Area Pincode: __________\n\n"
    "Once we receive your details, our medical team will review your profile "
    "and guide you on the next steps.\n\n"
    "Thank you.\n"
    "Genestac Therapeutics"
)

ABUSE_WARNING_MSG = (
    "⚠️ We noticed your message was inappropriate. Please keep the conversation respectful. "
    "One more such message and our support team will take over."
)
ABUSE_FINAL_MSG = (
    "Our team will contact you shortly. This automated assistant has stopped responding to this conversation. 🙏"
)


# ── Moderation ────────────────────────────────────────────────────────────────
async def is_abusive(text: str) -> bool:
    try:
        mod_res = oai_client.moderations.create(input=text)
        result = mod_res.results[0]
        cats = result.categories
        return any([
            cats.harassment, cats.harassment_threatening, cats.hate,
            cats.hate_threatening, cats.sexual, cats.sexual_minors,
            cats.violence, cats.violence_graphic, cats.self_harm,
            cats.self_harm_intent, cats.self_harm_instructions,
        ])
    except Exception as e:
        print(f"[Moderation] API error: {e}")
        return False


# ── RAG ───────────────────────────────────────────────────────────────────────
async def get_rag_context(query: str, supabase: Client) -> str:
    try:
        embed_res = oai_client.embeddings.create(
            model="text-embedding-3-small", input=query
        )
        query_embedding = embed_res.data[0].embedding
        res = supabase.rpc(
            "match_knowledge_base",
            {"query_embedding": query_embedding, "match_threshold": 0.5, "match_count": 3},
        ).execute()
        if not res.data:
            return ""
        return "\n\n".join(
            f"Title: {item.get('title')}\nContent: {item.get('content')}" for item in res.data
        )
    except Exception as e:
        print(f"[OpenAI Agent] RAG error: {e}")
        return ""


# ── Helpers ───────────────────────────────────────────────────────────────────
def _parse_preferred_datetime(preferred_date: str, preferred_time: str) -> Optional[datetime]:
    try:
        now = datetime.now(IST)
        date_lower = (preferred_date or "").lower().strip()
        if date_lower in ("today", "aaj", ""):
            target_date = now.date()
        elif date_lower in ("tomorrow", "kal", "kl"):
            target_date = (now + timedelta(days=1)).date()
        else:
            for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%B %d", "%b %d"):
                try:
                    parsed = datetime.strptime(preferred_date, fmt)
                    target_date = parsed.replace(year=now.year).date()
                    if target_date < now.date():
                        target_date = target_date.replace(year=now.year + 1)
                    break
                except ValueError:
                    continue
            else:
                target_date = (now + timedelta(days=1)).date()

        time_lower = (preferred_time or "").lower().strip()
        hour, minute = 10, 0
        if time_lower:
            for fmt in ("%I:%M %p", "%H:%M", "%I %p", "%I%p"):
                try:
                    parsed_t = datetime.strptime(time_lower, fmt)
                    hour, minute = parsed_t.hour, parsed_t.minute
                    break
                except ValueError:
                    continue

        return datetime(target_date.year, target_date.month, target_date.day, hour, minute, 0, tzinfo=IST)
    except Exception as e:
        print(f"[Agent] Could not parse datetime: {e}")
        return None


def _get_all_active_doctors(supabase: Client) -> list:
    try:
        res = supabase.table("staffs").select("id, full_name, roles!inner(name)").eq("roles.name", "doctor").execute()
        doctors = res.data or []
        sched_res = supabase.table("doctor_schedules").select("*").eq("allow_scheduling", True).execute()
        schedulable_ids = {s["staff_id"] for s in (sched_res.data or [])}
        return [d for d in doctors if d["id"] in schedulable_ids]
    except Exception as e:
        print(f"[Agent] Error fetching doctors: {e}")
        return []


def _find_best_slot(supabase: Client, preferred_dt: datetime) -> Optional[dict]:
    from services.slot_service import find_nearest_available_slot
    doctors = _get_all_active_doctors(supabase)
    if not doctors:
        return None
    for doc in doctors:
        slot = find_nearest_available_slot(
            doctor_id=doc["id"],
            preferred_dt=preferred_dt,
            duration_minutes=30,
            supabase=supabase,
            search_days=7,
        )
        if slot:
            slot["doctor_id"] = doc["id"]
            slot["doctor_name"] = doc.get("full_name", "Doctor")
            return slot
    return None


def _get_lead_existing_appointment(lead_id: str, supabase: Client) -> Optional[dict]:
    try:
        res = supabase.table("appointments").select(
            "id, scheduled_at, status, doctor_id, meeting_link, staffs!appointments_doctor_id_fkey(full_name)"
        ).eq("patient_id", lead_id).not_.in_(
            "status", ["cancelled", "rejected"]
        ).order("scheduled_at", desc=True).limit(1).execute()
        return res.data[0] if res.data else None
    except Exception as e:
        print(f"[Agent] Error fetching existing appointment: {e}")
        return None


def _get_doctor_whatsapp_number(doctor_id: str, supabase: Client) -> Optional[str]:
    """Get doctor's WhatsApp number from staffs or doctor_schedules."""
    try:
        staff_res = supabase.table("staffs").select("phone").eq("id", doctor_id).execute()
        if staff_res.data and staff_res.data[0].get("phone"):
            return staff_res.data[0]["phone"]
        sched_res = supabase.table("doctor_schedules").select("exotel_number").eq("staff_id", doctor_id).execute()
        if sched_res.data and sched_res.data[0].get("exotel_number"):
            return sched_res.data[0]["exotel_number"]
    except Exception as e:
        print(f"[Agent] Error fetching doctor phone: {e}")
    return None


def _get_inventory_item_by_name(supabase: Client, query: str) -> Optional[dict]:
    """Fuzzy search inventory by name, returns best match."""
    try:
        res = supabase.table("inventory").select(
            "id, name, price, compare_at_price, \"Dosage/Strength\", category, gst_percentage"
        ).ilike("name", f"%{query}%").eq("stock_quantity", None).limit(1).execute()
        # stock_quantity eq None trick doesn't work — just fetch by name
        res = supabase.table("inventory").select(
            "id, name, price, compare_at_price, \"Dosage/Strength\", category, gst_percentage"
        ).ilike("name", f"%{query}%").limit(5).execute()

        items = res.data or []
        # Prefer items with compare_at_price set
        with_mrp = [i for i in items if i.get("compare_at_price")]
        return (with_mrp or items)[0] if (with_mrp or items) else None
    except Exception as e:
        print(f"[Agent] Inventory search error: {e}")
        return None


def _format_lead_data_for_prompt(lead: dict, metadata: dict) -> str:
    parts = [
        f"Name: {lead.get('name') or 'Not provided'}",
        f"Phone: {lead.get('phone_number') or lead.get('phone') or 'Not provided'}",
        f"Age: {metadata.get('age') or 'Not provided'}",
        f"Gender: {metadata.get('gender') or 'Not provided'}",
        f"Height: {metadata.get('height') or 'Not provided'}",
        f"Weight: {metadata.get('weight') or 'Not provided'}",
        f"Medical History: {metadata.get('medical_history') or metadata.get('medical_condition') or 'Not provided'}",
        f"Address: {lead.get('street_address') or metadata.get('address') or 'Not provided'}",
        f"Pincode: {lead.get('postal_code') or metadata.get('pincode') or 'Not provided'}",
        f"City: {lead.get('city') or metadata.get('city') or 'Not provided'}",
        f"Goals: {metadata.get('goals') or 'Not provided'}",
        f"Intake Form Sent: {lead.get('wa_intake_form_sent') or metadata.get('wa_intake_form_sent') or False}",
    ]
    return "\n".join(parts)


# ── SYSTEM PROMPT ─────────────────────────────────────────────────────────────
def _build_system_prompt(
    base_prompt: str,
    lead: dict,
    metadata: dict,
    rag_context: str,
    is_first_message: bool,
) -> str:
    lead_info = _format_lead_data_for_prompt(lead, metadata)
    intake_sent = lead.get("wa_intake_form_sent") or metadata.get("wa_intake_form_sent") or False

    first_msg_rule = ""
    if is_first_message and not intake_sent:
        first_msg_rule = (
            "\n\nCRITICAL FIRST MESSAGE RULE:\n"
            "This is the VERY FIRST message from this lead. Your ONLY job right now is:\n"
            "1. Call send_intake_form tool immediately — this sends the GLP-1 eligibility form.\n"
            "2. Do NOT ask any other questions yet.\n"
            "3. Do NOT greet extensively — just a very short warm greeting + the form."
        )
    elif is_first_message and intake_sent:
        first_msg_rule = (
            "\n\nFIRST REPLY AFTER INTAKE FORM:\n"
            "The lead has replied to our intake form. Call save_lead_info immediately with ALL fields you can extract: "
            "name, age, gender, height, weight, medical_history, address, pincode. Then give a warm acknowledgment."
        )

    return f"""You are Aalya, an empathetic, confident, and persuasive Care Consultant for Genestac Therapeutics. You are chatting on WhatsApp.

{base_prompt}

CRITICAL — YOU ARE A WOMAN:
Always use feminine Hindi verb forms: "main bol rahi hu", "main batati hu", "main samjhati hu". NEVER masculine.

LANGUAGE RULE:
Start in Hindi/Hinglish. After first turn, match the user's language.

RESPONSE FORMAT — STRICT:
- NO markdown: no *, **, #, bullets, or dashes. WhatsApp shows them raw.
- Keep replies SHORT — max 3 sentences. Pick the most important thing only.
- Natural, warm, human tone — like a knowledgeable friend.
- Do NOT re-introduce yourself every message.

YOUR GOALS (in priority order):
1. Send intake form on first message (if not already sent)
2. Save all lead info as soon as they share it
3. Understand their health situation
4. Recommend Mounjaro 2.5mg as starter (for GLP-1 naive patients)
5. Show pricing: MRP with 10% discount applied
6. Offer FREE Google Meet consultation with our doctor
7. Generate Proforma Invoice + send payment link when they want to buy

WHAT WE OFFER (mention naturally when relevant):
- FREE initial medical assessment (normally Rs 1,499)
- Weekly doctor consultation included in all plans
- Personalized diet plan and exercise plan
- Mobile app for tracking
- Dosage guidance throughout program
- Plans: Starter (Rs 4,999/mo), Medical (Rs 12,999/mo), Premium (Rs 29,999/mo)

GLP-1 PRODUCT KNOWLEDGE:
Tirzepatide (Mounjaro): GIP + GLP-1 dual agonist. Doses: 2.5mg, 5mg, 7.5mg, 10mg, 12.5mg, 15mg weekly.
SURMOUNT-5 trial: 20.2% avg weight loss in 72 weeks. RECOMMEND FOR STARTERS: 2.5mg first month.
Semaglutide (Wegovy/Ozempic/Obeda/Sematrinity/Semafull): GLP-1 agonist. 13.7% avg weight loss.
All injections: self-administer or at local clinic/hospital/pharmacy.

PRICING RULE: Show MRP first, then 10% discount. Never reveal cost price.
Example: "Mounjaro 2.5mg — MRP Rs 8,000, aapke liye Rs 7,200 (10% off)"

CONTRAINDICATIONS (screen when booking):
- Personal/family history of MTC or MEN2 syndrome → contraindicated
- Pregnancy/breastfeeding/planning pregnancy → not suitable
- History of pancreatitis → needs physician assessment
- Severe gastroparesis → avoid Mounjaro

TALK LATER RULE: If user says "baad mein baat karte hain / call me later / busy hoon", call schedule_followup tool.

APPOINTMENT BOOKING RULE: If user wants to speak to doctor / see doctor / book consultation, call book_google_meet.

INVOICE RULE: If user wants to buy / proceed with purchase, call generate_proforma_invoice. Always send both the invoice details AND the payment link.

Knowledge Base Context:
{rag_context if rag_context else "No specific context found."}

Lead Information:
{lead_info}
{first_msg_rule}"""


# ── TOOL DEFINITIONS ─────────────────────────────────────────────────────────
TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "send_intake_form",
            "description": "Sends the GLP-1 eligibility intake form to the lead. Call this on the FIRST message if the form has not been sent yet.",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "save_lead_info",
            "description": "Saves all personal and medical information shared by the user. Call whenever the user reveals any personal details.",
            "parameters": {
                "type": "object",
                "properties": {
                    "name": {"type": "string", "description": "Full name"},
                    "age": {"type": "number", "description": "Age in years"},
                    "gender": {"type": "string", "description": "Gender (Male/Female/Other)"},
                    "height": {"type": "string", "description": "Height (e.g. '5 feet 6 inches' or '168 cm')"},
                    "weight": {"type": "string", "description": "Current body weight (e.g. '85 kg')"},
                    "medical_history": {"type": "string", "description": "Medical history, conditions, pre-existing diseases"},
                    "address": {"type": "string", "description": "Residential address"},
                    "pincode": {"type": "string", "description": "Area pincode"},
                    "city": {"type": "string", "description": "City"},
                    "phone": {"type": "string", "description": "Phone number if mentioned"},
                    "goals": {"type": "string", "description": "Health goals (e.g. weight loss, diabetes control)"},
                    "weight_goal": {"type": "string", "description": "Target weight or amount to lose"},
                    "interested_product": {"type": "string", "description": "Product they showed interest in (e.g. Mounjaro 2.5mg)"},
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "trigger_exotel_call",
            "description": "Triggers an outbound phone call to the user immediately. Call ONLY when the user explicitly agrees to or requests a phone call.",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "schedule_followup",
            "description": "Schedules a WhatsApp follow-up message to be sent after 6 hours. Use when user says 'baad mein', 'talk later', 'busy hoon', 'call me later', etc.",
            "parameters": {
                "type": "object",
                "properties": {
                    "hours": {
                        "type": "number",
                        "description": "Hours to wait before follow-up (default 6)",
                    }
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "book_google_meet",
            "description": "Books a Google Meet consultation with our doctor. Checks availability, creates Meet link, sends confirmation to both the lead and doctor on WhatsApp. Use when user wants to speak to doctor or book consultation.",
            "parameters": {
                "type": "object",
                "properties": {
                    "preferred_date": {
                        "type": "string",
                        "description": "Preferred date ('today', 'tomorrow', '2026-08-15'). Leave empty to book immediately.",
                    },
                    "preferred_time": {
                        "type": "string",
                        "description": "Preferred time ('3 PM', '10:00 AM'). Leave empty to book soonest available.",
                    },
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "generate_proforma_invoice",
            "description": "Generates a Proforma Invoice with Razorpay payment link for a product or plan. Creates a cart, adds the item, computes totals with 10% discount on MRP, and sends BOTH invoice details and payment link on WhatsApp.",
            "parameters": {
                "type": "object",
                "properties": {
                    "product_name": {
                        "type": "string",
                        "description": "Name of the product to invoice (e.g. 'Mounjaro 2.5mg', 'Mounjaro'). Used to search inventory.",
                    },
                    "plan_name": {
                        "type": "string",
                        "description": "Name of the plan if invoicing a plan (e.g. 'Starter Plan', 'Medical Plan', 'Premium Plan').",
                    },
                    "quantity": {
                        "type": "integer",
                        "description": "Quantity of the product (default 1).",
                    },
                    "discount_percentage": {
                        "type": "number",
                        "description": "Discount percentage to apply (default 10 for 10% off MRP).",
                    },
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "book_appointment",
            "description": "Books a doctor appointment (without Google Meet, just a scheduled slot). Fallback if Google Meet is not configured.",
            "parameters": {
                "type": "object",
                "properties": {
                    "preferred_date": {"type": "string", "description": "Preferred date"},
                    "preferred_time": {"type": "string", "description": "Preferred time"},
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "update_appointment",
            "description": "Reschedule an existing appointment to a new time.",
            "parameters": {
                "type": "object",
                "properties": {
                    "preferred_date": {"type": "string", "description": "New preferred date"},
                    "preferred_time": {"type": "string", "description": "New preferred time"},
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "cancel_appointment",
            "description": "Cancel the user's existing appointment. Always ask for a reason first.",
            "parameters": {
                "type": "object",
                "properties": {
                    "reason": {"type": "string", "description": "Reason for cancellation"},
                },
                "required": ["reason"],
            },
        },
    },
]


# ── MAIN ENTRY POINT ──────────────────────────────────────────────────────────
async def process_whatsapp_message(
    lead: dict,
    message: str,
    supabase: Client,
    is_first_message: bool = False,
) -> Tuple[str, bool]:
    """
    Processes an incoming WhatsApp message and returns (AI_response_text, should_trigger_call).
    Side effects: may send additional WhatsApp messages (doctor notification, PI link, Meet link).
    """
    metadata = lead.get("metadata", {}) or {}
    table = "users" if "phone" in lead and "phone_number" not in lead else "leads"
    lead_id = lead["id"]
    lead_phone = lead.get("phone_number") or lead.get("phone") or ""

    # ── Abuse guard ──────────────────────────────────────────────────────────
    if metadata.get("abuse_blocked"):
        return "", False

    flagged = await is_abusive(message)
    if flagged:
        strikes = int(metadata.get("abuse_strikes", 0)) + 1
        metadata["abuse_strikes"] = strikes
        if strikes >= 2:
            metadata["bot_paused"] = True
            metadata["abuse_blocked"] = True
            supabase.table(table).update({"metadata": metadata}).eq("id", lead_id).execute()
            return ABUSE_FINAL_MSG, False
        supabase.table(table).update({"metadata": metadata}).eq("id", lead_id).execute()
        return ABUSE_WARNING_MSG, False

    # ── Fetch chat history ───────────────────────────────────────────────────
    lead_col = "user_id" if table == "users" else "lead_id"
    history_res = (
        supabase.table("whatsapp_messages")
        .select("sender_type, message_body")
        .eq(lead_col, lead_id)
        .order("created_at", desc=False)
        .limit(20)
        .execute()
    )
    chat_history = []
    for msg in history_res.data or []:
        role = "user" if msg["sender_type"] == "lead" else "assistant"
        chat_history.append({"role": role, "content": msg["message_body"]})
    # Remove the current message if already at tail
    if chat_history and chat_history[-1]["content"] == message:
        chat_history.pop()

    # ── RAG context ──────────────────────────────────────────────────────────
    rag_context = await get_rag_context(message, supabase)

    # ── Base prompt from global_settings ────────────────────────────────────
    base_prompt = "You are a helpful, empathetic AI assistant for Genestac Therapeutics."
    settings_res = supabase.table("global_settings").select("settings_value").eq(
        "settings_key", "ai_call_settings"
    ).execute()
    if settings_res.data:
        bp = settings_res.data[0]["settings_value"].get("whatsapp_prompt") or \
             settings_res.data[0]["settings_value"].get("base_prompt", "")
        if bp:
            base_prompt = bp

    # ── Build messages ───────────────────────────────────────────────────────
    system_prompt = _build_system_prompt(base_prompt, lead, metadata, rag_context, is_first_message)
    messages = [{"role": "system", "content": system_prompt}]
    messages.extend(chat_history[-10:])
    messages.append({"role": "user", "content": message})

    # ── First call to GPT ────────────────────────────────────────────────────
    try:
        response = oai_client.chat.completions.create(
            model="gpt-4o-mini",
            messages=messages,
            tools=TOOLS,
            tool_choice="auto",
            temperature=0.7,
            max_tokens=300,
        )

        response_message = response.choices[0].message
        ai_text = response_message.content or ""
        should_trigger_call = False
        tool_results_for_ai = []  # human-readable results for second pass
        extra_wa_messages = []    # additional WA messages to send (doctor notif, PI, etc.)

        # ── Tool execution ────────────────────────────────────────────────────
        if response_message.tool_calls:
            messages.append(response_message)

            for tool_call in response_message.tool_calls:
                func_name = tool_call.function.name
                args = {}
                try:
                    args = json.loads(tool_call.function.arguments or "{}")
                except Exception:
                    pass

                tool_result_str = "done"

                # ── 1. send_intake_form ──────────────────────────────────────
                if func_name == "send_intake_form":
                    extra_wa_messages.append(INTAKE_FORM_TEXT)
                    # Mark form as sent
                    meta_update = {**metadata, "wa_intake_form_sent": True}
                    col_update = {"wa_intake_form_sent": True, "metadata": meta_update}
                    try:
                        supabase.table(table).update(col_update).eq("id", lead_id).execute()
                    except Exception:
                        supabase.table(table).update({"metadata": meta_update}).eq("id", lead_id).execute()
                    metadata["wa_intake_form_sent"] = True
                    tool_result_str = "INTAKE_FORM_SENT"
                    tool_results_for_ai.append("Intake form sent. Wait for user to fill it in.")

                # ── 2. save_lead_info ────────────────────────────────────────
                elif func_name == "save_lead_info":
                    update_data = {}
                    meta_fields = [
                        "age", "gender", "height", "weight", "medical_history",
                        "medical_condition", "address", "pincode", "city", "phone",
                        "goals", "weight_goal", "interested_product", "other_critical_info",
                    ]
                    for field in meta_fields:
                        if args.get(field):
                            metadata[field] = args[field]
                    update_data["metadata"] = metadata

                    if args.get("name"):
                        update_data["name"] = args["name"]
                        lead["name"] = args["name"]

                    # Promote to top-level columns where they exist
                    if args.get("city"):
                        try:
                            supabase.table(table).update({"city": args["city"]}).eq("id", lead_id).execute()
                        except Exception:
                            pass
                    if args.get("address"):
                        try:
                            supabase.table(table).update({"street_address": args["address"]}).eq("id", lead_id).execute()
                        except Exception:
                            pass
                    if args.get("pincode"):
                        try:
                            supabase.table(table).update({"postal_code": args["pincode"]}).eq("id", lead_id).execute()
                        except Exception:
                            pass

                    supabase.table(table).update(update_data).eq("id", lead_id).execute()
                    tool_result_str = "Lead info saved"
                    tool_results_for_ai.append(
                        "Lead information saved. Give a warm acknowledgment of their details and move forward."
                    )

                # ── 3. trigger_exotel_call ────────────────────────────────────
                elif func_name == "trigger_exotel_call":
                    should_trigger_call = True
                    tool_result_str = "Call initiated"
                    if not ai_text:
                        ai_text = "Zaroor! Main abhi aapko call arrange kar rahi hu. Thoda wait karein 📞"
                    tool_results_for_ai.append("Exotel call triggered. Inform user call is coming.")

                # ── 4. schedule_followup ──────────────────────────────────────
                elif func_name == "schedule_followup":
                    hours = float(args.get("hours") or 6)
                    followup_at = datetime.now(IST) + timedelta(hours=hours)
                    try:
                        supabase.table("leads").update(
                            {"whatsapp_followup_at": followup_at.isoformat()}
                        ).eq("id", lead_id).execute()
                        tool_result_str = f"FOLLOWUP_SCHEDULED|{followup_at.strftime('%-d %b %Y at %-I:%M %p IST')}"
                        tool_results_for_ai.append(
                            f"Follow-up scheduled in {hours} hours. Tell user you'll reach back out."
                        )
                    except Exception as e:
                        print(f"[Agent] schedule_followup error: {e}")
                        tool_result_str = "FOLLOWUP_ERROR"
                        tool_results_for_ai.append("Follow-up scheduling failed. Tell user you'll check back soon.")

                # ── 5. book_google_meet ───────────────────────────────────────
                elif func_name == "book_google_meet":
                    from services.google_meet_service import (
                        book_google_meet_appointment,
                        format_meet_confirmation_whatsapp,
                    )
                    preferred_date = args.get("preferred_date", "")
                    preferred_time = args.get("preferred_time", "")

                    # If specific time given, use it; else try immediately
                    prefer_now = not (preferred_date or preferred_time)
                    if preferred_date or preferred_time:
                        # Parse and use for next slot finder
                        prefer_now = False

                    lead_name = lead.get("name") or "Patient"
                    lead_email = metadata.get("email") or lead.get("email")

                    meet_result = book_google_meet_appointment(
                        supabase=supabase,
                        lead_id=lead_id,
                        lead_name=lead_name,
                        lead_email=lead_email,
                        lead_phone=lead_phone,
                        preferred_now=prefer_now,
                        duration_minutes=30,
                    )

                    lead_msg, doctor_msg = format_meet_confirmation_whatsapp(meet_result, lead_name)

                    if meet_result["booked"]:
                        # Add confirmation as extra WA message (sent separately, not as AI reply)
                        extra_wa_messages.append(lead_msg)

                        # Notify doctor on WhatsApp
                        if doctor_msg and meet_result.get("appointment_id"):
                            doctor_wa_phone = _get_doctor_whatsapp_number(
                                meet_result.get("doctor_id") or "", supabase
                            ) if meet_result.get("doctor_id") else None
                            if doctor_wa_phone:
                                extra_wa_messages.append(f"__DOCTOR__{doctor_wa_phone}__{doctor_msg}")

                        tool_result_str = (
                            f"MEET_BOOKED|{meet_result['scheduled_at_display']}|"
                            f"{meet_result['doctor_name']}|{meet_result.get('meeting_link') or 'no_link'}"
                        )
                        tool_results_for_ai.append(
                            f"Consultation booked with Dr. {meet_result['doctor_name']} on "
                            f"{meet_result['scheduled_at_display']}. "
                            f"{'Google Meet link sent.' if meet_result.get('meeting_link') else 'No Meet link yet.'} "
                            "Confirmation already sent to lead. Give a short positive acknowledgment only."
                        )
                    else:
                        # Find next slot to offer
                        from services.google_meet_service import get_next_free_slot
                        next_slot = get_next_free_slot(supabase)
                        if next_slot:
                            slot_dt, slot_doc = next_slot
                            next_display = slot_dt.strftime("%-d %b %Y at %-I:%M %p IST")
                            tool_result_str = f"MEET_NO_IMMEDIATE_SLOT|{next_display}|{slot_doc['doctor_name']}"
                            tool_results_for_ai.append(
                                f"All doctors are in consultations right now. "
                                f"Next available slot: {next_display} with Dr. {slot_doc['doctor_name']}. "
                                "Ask user if they want to book that slot."
                            )
                        else:
                            tool_result_str = "MEET_NO_SLOTS"
                            tool_results_for_ai.append(
                                "No doctor slots available in next 7 days. Tell user team will call them to schedule."
                            )

                # ── 6. generate_proforma_invoice ──────────────────────────────
                elif func_name == "generate_proforma_invoice":
                    from services.cart_service import (
                        get_or_create_active_cart,
                        add_inventory_to_cart,
                        add_plan_to_cart,
                        create_pi_from_cart,
                        format_pi_whatsapp_message,
                        clear_cart_items,
                    )

                    product_name = args.get("product_name") or ""
                    plan_name = args.get("plan_name") or ""
                    quantity = int(args.get("quantity") or 1)
                    discount_pct = float(args.get("discount_percentage") or 10.0)

                    try:
                        cart_id = get_or_create_active_cart(
                            supabase=supabase,
                            lead_id=lead_id,
                            source="whatsapp_bot",
                        )
                        # Clear old items if re-generating
                        clear_cart_items(supabase, cart_id)

                        if product_name:
                            # Search inventory
                            inv_item = _get_inventory_item_by_name(supabase, product_name)
                            if inv_item:
                                add_inventory_to_cart(
                                    supabase=supabase,
                                    cart_id=cart_id,
                                    inventory_id=inv_item["id"],
                                    quantity=quantity,
                                    discount_pct=discount_pct,
                                )
                            else:
                                tool_result_str = f"PI_ERROR|Product '{product_name}' not found in inventory"
                                tool_results_for_ai.append(
                                    f"Could not find '{product_name}' in inventory. "
                                    "Ask user to confirm the product name or tell team will assist."
                                )
                                messages.append({"role": "tool", "tool_call_id": tool_call.id, "content": tool_result_str})
                                continue

                        elif plan_name:
                            # Search plans
                            plan_res = supabase.table("plans").select("id, name").ilike(
                                "name", f"%{plan_name}%"
                            ).limit(1).execute()
                            if plan_res.data:
                                add_plan_to_cart(
                                    supabase=supabase,
                                    cart_id=cart_id,
                                    plan_id=plan_res.data[0]["id"],
                                    discount_pct=0,  # Plans don't get discount by default
                                )
                            else:
                                tool_result_str = f"PI_ERROR|Plan '{plan_name}' not found"
                                tool_results_for_ai.append(
                                    f"Plan '{plan_name}' not found. Tell user our plans are Starter, Medical, and Premium."
                                )
                                messages.append({"role": "tool", "tool_call_id": tool_call.id, "content": tool_result_str})
                                continue
                        else:
                            tool_result_str = "PI_ERROR|No product or plan specified"
                            tool_results_for_ai.append("Cannot generate invoice — no product or plan specified. Ask user what they want to purchase.")
                            messages.append({"role": "tool", "tool_call_id": tool_call.id, "content": tool_result_str})
                            continue

                        # Create PI + Razorpay link
                        pi = create_pi_from_cart(
                            supabase=supabase,
                            cart_id=cart_id,
                            lead_id=lead_id,
                            source="whatsapp_bot",
                        )

                        # Format and queue the WhatsApp message
                        pi_message = format_pi_whatsapp_message(pi)
                        extra_wa_messages.append(pi_message)

                        tool_result_str = (
                            f"PI_CREATED|{pi['invoice_number']}|₹{pi['total_amount']:,.2f}"
                            f"|{pi.get('razorpay_url') or 'no_link'}"
                        )
                        tool_results_for_ai.append(
                            f"Proforma Invoice {pi['invoice_number']} created for ₹{pi['total_amount']:,.2f}. "
                            f"Payment link and invoice already sent. Give a brief positive acknowledgment only."
                        )

                    except Exception as e:
                        print(f"[Agent] generate_proforma_invoice error: {e}")
                        import traceback
                        traceback.print_exc()
                        tool_result_str = f"PI_ERROR|{str(e)}"
                        tool_results_for_ai.append(
                            "Invoice generation failed. Apologize briefly and say team will follow up."
                        )

                # ── 7. book_appointment (fallback) ────────────────────────────
                elif func_name == "book_appointment":
                    preferred_date = args.get("preferred_date", "tomorrow")
                    preferred_time = args.get("preferred_time", "10:00 AM")
                    existing_appt = _get_lead_existing_appointment(lead_id, supabase)
                    if existing_appt:
                        sched = existing_appt.get("scheduled_at", "")
                        doctor_name = (existing_appt.get("staffs") or {}).get("full_name", "our doctor")
                        try:
                            sched_display = datetime.fromisoformat(sched).astimezone(IST).strftime("%d %b %Y at %I:%M %p")
                        except Exception:
                            sched_display = sched
                        tool_result_str = f"ALREADY_BOOKED|{sched_display}|{doctor_name}"
                        tool_results_for_ai.append(
                            f"Lead already has an appointment on {sched_display} with {doctor_name}. "
                            "Ask if they want to update or cancel."
                        )
                    else:
                        preferred_dt = _parse_preferred_datetime(preferred_date, preferred_time)
                        if not preferred_dt:
                            preferred_dt = datetime.now(IST) + timedelta(days=1)
                            preferred_dt = preferred_dt.replace(hour=10, minute=0, second=0)
                        slot = _find_best_slot(supabase, preferred_dt)
                        if slot:
                            appt_data = {
                                "patient_id": lead_id,
                                "doctor_id": slot["doctor_id"],
                                "scheduled_at": slot["start"],
                                "duration_minutes": slot["duration_minutes"],
                                "status": "pending",
                                "notes": f"Booked via WhatsApp by {lead.get('name', 'Unknown')}",
                            }
                            res = supabase.table("appointments").insert(appt_data).execute()
                            if res.data:
                                doctor_name = slot.get("doctor_name", "our doctor")
                                try:
                                    slot_display = datetime.fromisoformat(slot["start"]).astimezone(IST).strftime("%d %b %Y at %I:%M %p")
                                except Exception:
                                    slot_display = slot["start"]
                                tool_result_str = f"BOOKED|{slot_display}|{doctor_name}"
                                metadata["last_appointment_id"] = res.data[0]["id"]
                                supabase.table(table).update({"metadata": metadata}).eq("id", lead_id).execute()
                                tool_results_for_ai.append(
                                    f"Appointment booked on {slot_display} with {doctor_name}."
                                )
                            else:
                                tool_result_str = "BOOKING_FAILED"
                                tool_results_for_ai.append("Appointment booking failed. Apologize and say team will follow up.")
                        else:
                            appt_data = {
                                "patient_id": lead_id,
                                "doctor_id": None,
                                "scheduled_at": (datetime.now(IST) + timedelta(days=1)).isoformat(),
                                "duration_minutes": 30,
                                "status": "waiting_for_doctor",
                                "notes": f"WhatsApp request — no slot. Preferred: {preferred_date} {preferred_time}",
                            }
                            supabase.table("appointments").insert(appt_data).execute()
                            tool_result_str = "NO_SLOTS_AVAILABLE"
                            tool_results_for_ai.append(
                                "No slots available. Waiting request created. Tell user team will call to confirm."
                            )

                # ── 8. update_appointment ─────────────────────────────────────
                elif func_name == "update_appointment":
                    preferred_date = args.get("preferred_date", "tomorrow")
                    preferred_time = args.get("preferred_time", "10:00 AM")
                    existing_appt = _get_lead_existing_appointment(lead_id, supabase)
                    if not existing_appt:
                        tool_result_str = "NO_EXISTING_APPOINTMENT"
                        tool_results_for_ai.append("No existing appointment found.")
                    else:
                        preferred_dt = _parse_preferred_datetime(preferred_date, preferred_time)
                        if not preferred_dt:
                            preferred_dt = datetime.now(IST) + timedelta(days=1)
                            preferred_dt = preferred_dt.replace(hour=10, minute=0, second=0)
                        slot = _find_best_slot(supabase, preferred_dt)
                        if slot:
                            supabase.table("appointments").update({
                                "doctor_id": slot["doctor_id"],
                                "scheduled_at": slot["start"],
                                "duration_minutes": slot["duration_minutes"],
                                "status": "pending",
                                "notes": f"Rescheduled via WhatsApp by {lead.get('name', 'Unknown')}",
                            }).eq("id", existing_appt["id"]).execute()
                            doctor_name = slot.get("doctor_name", "our doctor")
                            try:
                                slot_display = datetime.fromisoformat(slot["start"]).astimezone(IST).strftime("%d %b %Y at %I:%M %p")
                            except Exception:
                                slot_display = slot["start"]
                            tool_result_str = f"UPDATED|{slot_display}|{doctor_name}"
                            tool_results_for_ai.append(f"Appointment rescheduled to {slot_display} with {doctor_name}.")
                        else:
                            try:
                                old_display = datetime.fromisoformat(existing_appt["scheduled_at"]).astimezone(IST).strftime("%d %b %Y at %I:%M %p")
                                old_doctor = (existing_appt.get("staffs") or {}).get("full_name", "your doctor")
                            except Exception:
                                old_display = existing_appt.get("scheduled_at", "")
                                old_doctor = "your doctor"
                            tool_result_str = f"NO_NEW_SLOT_KEEP_OLD|{old_display}|{old_doctor}"
                            tool_results_for_ai.append(
                                f"No new slot found. Old appointment {old_display} with {old_doctor} kept."
                            )

                # ── 9. cancel_appointment ─────────────────────────────────────
                elif func_name == "cancel_appointment":
                    reason = args.get("reason", "No reason provided")
                    existing_appt = _get_lead_existing_appointment(lead_id, supabase)
                    if not existing_appt:
                        tool_result_str = "NO_EXISTING_APPOINTMENT"
                        tool_results_for_ai.append("No existing appointment found.")
                    else:
                        supabase.table("appointments").update({
                            "status": "cancelled",
                            "notes": f"Cancelled via WhatsApp. Reason: {reason}",
                        }).eq("id", existing_appt["id"]).execute()
                        tool_result_str = f"CANCELLED|{reason}"
                        tool_results_for_ai.append(f"Appointment cancelled. Reason: {reason}.")

                messages.append({
                    "role": "tool",
                    "tool_call_id": tool_call.id,
                    "content": tool_result_str,
                })

            # ── Second pass — AI composes final reply ────────────────────────
            if not ai_text and tool_results_for_ai:
                context_summary = " | ".join(tool_results_for_ai)
                messages.append({"role": "system", "content": context_summary})
                second_response = oai_client.chat.completions.create(
                    model="gpt-4o-mini",
                    messages=messages,
                    temperature=0.7,
                    max_tokens=200,
                )
                ai_text = second_response.choices[0].message.content or "Shukriya! 🙏"

        # ── Send extra WA messages (PI, Meet link, doctor notification) ──────
        if extra_wa_messages:
            from services.whatsapp_service import send_whatsapp_text as _send_wa
            clean_lead_phone = "".join(filter(str.isdigit, lead_phone))
            for msg in extra_wa_messages:
                if msg.startswith("__DOCTOR__"):
                    # Doctor notification: format is __DOCTOR__{phone}__{message}
                    parts = msg.split("__", 3)
                    if len(parts) == 4:
                        doc_phone = "".join(filter(str.isdigit, parts[2]))
                        doc_msg = parts[3]
                        try:
                            await _send_wa(doc_phone, doc_msg)
                            print(f"[Agent] Doctor WA notification sent to {doc_phone}")
                        except Exception as e:
                            print(f"[Agent] Doctor WA notification failed: {e}")
                else:
                    if clean_lead_phone:
                        try:
                            await _send_wa(clean_lead_phone, msg)
                        except Exception as e:
                            print(f"[Agent] Extra WA message failed: {e}")

        return ai_text, should_trigger_call

    except Exception as e:
        print(f"[OpenAI Agent] Error: {e}")
        import traceback
        traceback.print_exc()
        return (
            "Abhi thodi technical problem aa rahi hai. Hamari team jald hi aapko contact karegi. 🙏",
            False,
        )
