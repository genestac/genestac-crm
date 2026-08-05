import os
import json
import openai
from datetime import datetime, timedelta
from supabase import Client
from typing import Dict, Any, Tuple, Optional
from zoneinfo import ZoneInfo

# Initialize OpenAI client
oai_client = openai.OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

IST = ZoneInfo("Asia/Kolkata")

async def get_rag_context(query: str, supabase: Client) -> str:
    """Generates an embedding for the query and fetches relevant knowledge base items."""
    try:
        embed_res = oai_client.embeddings.create(
            model="text-embedding-3-small",
            input=query,
        )
        query_embedding = embed_res.data[0].embedding

        res = supabase.rpc(
            'match_knowledge_base',
            {'query_embedding': query_embedding, 'match_threshold': 0.5, 'match_count': 3}
        ).execute()

        if not res.data:
            return ""

        context_pieces = []
        for item in res.data:
            context_pieces.append(f"Title: {item.get('title')}\nContent: {item.get('content')}")
        
        return "\n\n".join(context_pieces)
    except Exception as e:
        print(f"[OpenAI Agent] Failed to fetch RAG context: {e}")
        return ""


ABUSE_WARNING_MSG = (
    "⚠️ We noticed your message was inappropriate. Please keep the conversation respectful. "
    "One more such message and our support team will take over."
)

ABUSE_FINAL_MSG = (
    "Our team will contact you shortly. This automated assistant has stopped responding to this conversation. 🙏"
)


async def is_abusive(text: str) -> bool:
    try:
        mod_res = oai_client.moderations.create(input=text)
        result = mod_res.results[0]
        cats = result.categories
        return any([
            cats.harassment,
            cats.harassment_threatening,
            cats.hate,
            cats.hate_threatening,
            cats.sexual,
            cats.sexual_minors,
            cats.violence,
            cats.violence_graphic,
            cats.self_harm,
            cats.self_harm_intent,
            cats.self_harm_instructions,
        ])
    except Exception as e:
        print(f"[Moderation] API error: {e}")
        return False


def _parse_preferred_datetime(preferred_date: str, preferred_time: str) -> Optional[datetime]:
    """Parse a natural date/time string into a datetime object (IST)."""
    try:
        now = datetime.now(IST)
        # Normalise date string
        date_lower = preferred_date.lower().strip() if preferred_date else ""
        if date_lower in ("today", "aaj", ""):
            target_date = now.date()
        elif date_lower in ("tomorrow", "kal", "kl"):
            target_date = (now + timedelta(days=1)).date()
        else:
            # Try ISO or common formats
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

        # Normalise time string
        time_lower = (preferred_time or "").lower().strip()
        hour, minute = 10, 0  # default morning
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
    """Fetch all doctors who allow scheduling."""
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
    """Find the nearest available slot across ALL schedulable doctors."""
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
            search_days=7
        )
        if slot:
            slot["doctor_id"] = doc["id"]
            slot["doctor_name"] = doc.get("full_name", "Doctor")
            return slot
    return None


def _get_lead_existing_appointment(lead_id: str, supabase: Client) -> Optional[dict]:
    """Return the most recent non-cancelled appointment for this lead."""
    try:
        res = supabase.table("appointments").select(
            "id, scheduled_at, status, doctor_id, staffs!appointments_doctor_id_fkey(full_name)"
        ).eq("patient_id", lead_id).not_.in_("status", ["cancelled", "rejected"]).order(
            "scheduled_at", desc=True
        ).limit(1).execute()
        if res.data:
            return res.data[0]
        return None
    except Exception as e:
        print(f"[Agent] Error fetching existing appointment: {e}")
        return None


async def process_whatsapp_message(
    lead: dict,
    message: str,
    supabase: Client,
    is_first_message: bool = False
) -> Tuple[str, bool]:
    """
    Processes the incoming WhatsApp message using GPT-4o-mini and RAG context.
    Returns a tuple of (AI_Response_Text, Should_Trigger_Call).
    """
    metadata = lead.get("metadata", {}) or {}
    table = "users" if "phone" in lead else "leads"

    # ── Two-Strike Abuse Guard ───────────────────────────────────────────────
    if metadata.get("abuse_blocked"):
        print(f"[Abuse Guard] Lead {lead['id']} is hard-blocked. Ignoring message.")
        return "", False

    flagged = await is_abusive(message)
    if flagged:
        strikes = int(metadata.get("abuse_strikes", 0)) + 1
        metadata["abuse_strikes"] = strikes
        print(f"[Abuse Guard] Lead {lead['id']} — strike {strikes}")

        if strikes >= 2:
            metadata["bot_paused"] = True
            metadata["abuse_blocked"] = True
            supabase.table(table).update({"metadata": metadata}).eq("id", lead["id"]).execute()
            print(f"[Abuse Guard] Lead {lead['id']} — HARD BLOCKED after {strikes} strikes.")
            return ABUSE_FINAL_MSG, False
        else:
            supabase.table(table).update({"metadata": metadata}).eq("id", lead["id"]).execute()
            return ABUSE_WARNING_MSG, False
    # ─────────────────────────────────────────────────────────────────────────

    # 1. Fetch Chat History from Database
    lead_col = "user_id" if "phone" in lead else "lead_id"
    history_res = supabase.table("whatsapp_messages") \
        .select("sender_type, message_body") \
        .eq(lead_col, lead["id"]) \
        .order("created_at", desc=False) \
        .limit(20) \
        .execute()
        
    chat_history = []
    if history_res.data:
        for msg in history_res.data:
            role = "user" if msg["sender_type"] == "lead" else "assistant"
            chat_history.append({"role": role, "content": msg["message_body"]})
            
    # Remove the incoming message if it's already at the end of the history (webhook inserted it)
    if chat_history and chat_history[-1]["content"] == message:
        chat_history.pop()

    # 2. Fetch RAG Context
    rag_context = await get_rag_context(message, supabase)
    
    # 3. Fetch Dashboard AI Settings (Base Prompt)
    base_prompt = "You are a helpful, empathetic, and professional AI assistant for Genestac CRM (a clinic/medical center)."
    settings_res = supabase.table("global_settings").select("settings_value").eq("settings_key", "ai_call_settings").execute()
    if settings_res.data and "settings_value" in settings_res.data[0]:
        base_prompt = settings_res.data[0]["settings_value"].get("base_prompt", base_prompt)

    # 4. Build System Prompt
    first_message_instruction = ""
    if is_first_message:
        first_message_instruction = """
FIRST MESSAGE PRIORITY RULE (CRITICAL):
This is the VERY FIRST message from this lead. It may be a structured form submission containing personal details.
You MUST call save_lead_info IMMEDIATELY with ALL information you can extract from this message — name, age, weight, city, address, goals, medical condition, phone number, etc.
Do NOT skip any field present in the message. After saving, give a warm greeting and ask what they need help with.
"""

    system_prompt = f"""{base_prompt}

Your goal is to answer questions using the Knowledge Base and gently guide the lead toward booking a consultation.

Knowledge Base Context:
{rag_context if rag_context else "No specific context found."}

Lead Information:
- Name: {lead.get('name') or 'Not provided'}
- Medical Condition: {metadata.get('medical_condition') or 'Not provided'}
- City: {metadata.get('city') or 'Not provided'}
- Goals: {metadata.get('goals') or 'Not provided'}
{first_message_instruction}

STRICT RULES — follow these exactly:
1. NEVER use markdown: no *, **, •, -, #, or any bullet points or bold text. WhatsApp shows them as raw characters.
2. Keep every reply SHORT — maximum 2-3 sentences. If you need to share multiple points, pick the most important one only.
3. Write in a natural Hinglish mix (Hindi + English) — casual, warm, human. Not robotic or formal.
4. Do NOT repeat yourself or re-introduce yourself in every message.
5. If the user asks a question, answer it briefly using the Knowledge Base, then ask ONE follow-up.
6. If we don't have their name, ask for it naturally in one short sentence.
7. If we have their name but not their condition, ask what health issue they want help with.
8. If we have both, ask if they'd like to book a consultation with our doctor.
9. APPOINTMENT BOOKING: When a user wants to book an appointment, call book_appointment. If they already have one, tell them and ask if they want to update or cancel.
10. EXISTING APPOINTMENT: If a user wants to update their booking, call update_appointment. If they want to cancel, call cancel_appointment with their reason.
11. If the user says "yes" to a call, says "call me", or wants to speak to someone, call trigger_exotel_call immediately.
12. NEVER write long paragraphs. If your reply is more than 3 lines, it is too long — cut it down.
"""

    # 5. Construct Messages
    messages = [{"role": "system", "content": system_prompt}]
    
    # Add history (last 10 messages to keep context window small)
    for msg in chat_history[-10:]:
        messages.append(msg)
        
    messages.append({"role": "user", "content": message})

    # 6. Define Tools
    tools = [
        {
            "type": "function",
            "function": {
                "name": "trigger_exotel_call",
                "description": "Triggers an outbound phone call to the user immediately. Call this ONLY when the user explicitly agrees to or requests a phone call.",
                "parameters": {
                    "type": "object",
                    "properties": {},
                    "required": []
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "save_lead_info",
                "description": "Saves critical structured medical and personal information about the user. Call this anytime the user reveals new information about themselves, especially on the first message.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "name": {"type": "string", "description": "The user's full name."},
                        "age": {"type": "number", "description": "The user's age."},
                        "phone": {"type": "string", "description": "The user's phone number if mentioned."},
                        "city": {"type": "string", "description": "The user's city or location."},
                        "address": {"type": "string", "description": "The user's address if mentioned."},
                        "medical_condition": {"type": "string", "description": "The primary medical condition or disease they have (e.g. Diabetes, PCOS, Fatty Liver)."},
                        "weight": {"type": "string", "description": "The user's current weight."},
                        "weight_goal": {"type": "string", "description": "How much weight they want to lose or gain (e.g. '1-5 kg')."},
                        "budget": {"type": "string", "description": "The user's budget for treatment, if mentioned."},
                        "goals": {"type": "string", "description": "The user's health goals (e.g. weight loss, reversal, Lose Weight)."},
                        "other_critical_info": {"type": "string", "description": "Any other critical medical or personal information mentioned."}
                    },
                    "required": []
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "book_appointment",
                "description": "Book a doctor appointment for the user. Call this when the user wants to schedule a consultation. It will find the nearest available doctor slot. If no slots are available, it creates a waiting request.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "preferred_date": {
                            "type": "string",
                            "description": "Preferred date as a string (e.g. 'today', 'tomorrow', '2026-08-10'). Default to 'tomorrow' if not specified."
                        },
                        "preferred_time": {
                            "type": "string",
                            "description": "Preferred time as a string (e.g. '10:00 AM', '2 PM', '14:00'). Default to '10:00 AM' if not specified."
                        }
                    },
                    "required": []
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "update_appointment",
                "description": "Update/reschedule an existing appointment to a new time. If the new slot is not free, keep the old booking and inform the user.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "preferred_date": {
                            "type": "string",
                            "description": "New preferred date (e.g. 'tomorrow', '2026-08-12')."
                        },
                        "preferred_time": {
                            "type": "string",
                            "description": "New preferred time (e.g. '3:00 PM')."
                        }
                    },
                    "required": []
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "cancel_appointment",
                "description": "Cancel the user's existing appointment. Always ask for a reason before cancelling.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "reason": {
                            "type": "string",
                            "description": "The reason the user gave for cancellation."
                        }
                    },
                    "required": ["reason"]
                }
            }
        }
    ]

    try:
        response = oai_client.chat.completions.create(
            model="gpt-4o-mini",
            messages=messages,
            tools=tools,
            tool_choice="auto",
            temperature=0.7,
            max_tokens=200
        )

        response_message = response.choices[0].message
        ai_text = response_message.content or ""
        should_trigger_call = False
        tool_result_messages = []

        # Handle function calls
        if response_message.tool_calls:
            messages.append(response_message)

            for tool_call in response_message.tool_calls:
                func_name = tool_call.function.name
                tool_result = "Success"
                
                if func_name == "trigger_exotel_call":
                    should_trigger_call = True
                    tool_result = "Call initiated"
                    if not ai_text:
                        ai_text = "I've arranged for our team to call you right away. Please expect a call shortly!"

                elif func_name == "save_lead_info":
                    args = json.loads(tool_call.function.arguments)
                    update_data = {}

                    if "name" in args and args["name"]:
                        update_data["name"] = args["name"]
                        lead["name"] = args["name"]

                    # Metadata fields
                    metadata_fields = ["age", "medical_condition", "weight", "weight_goal", "budget", "goals", "city", "address", "phone", "other_critical_info"]
                    metadata_updated = False
                    for field in metadata_fields:
                        if field in args and args[field]:
                            metadata[field] = args[field]
                            metadata_updated = True

                    if metadata_updated:
                        update_data["metadata"] = metadata

                    # Also update top-level city/phone if the table supports it
                    if "city" in args and args["city"]:
                        try:
                            supabase.table(table).update({"city": args["city"]}).eq("id", lead["id"]).execute()
                        except Exception:
                            pass  # city column may not exist, it's in metadata anyway

                    if update_data:
                        supabase.table(table).update(update_data).eq("id", lead["id"]).execute()
                    tool_result = "Lead info saved"

                elif func_name == "book_appointment":
                    args = json.loads(tool_call.function.arguments)
                    preferred_date = args.get("preferred_date", "tomorrow")
                    preferred_time = args.get("preferred_time", "10:00 AM")

                    # Check if lead already has an active appointment
                    existing_appt = _get_lead_existing_appointment(lead["id"], supabase)
                    if existing_appt:
                        sched = existing_appt.get("scheduled_at", "")
                        doctor_name = (existing_appt.get("staffs") or {}).get("full_name", "a doctor")
                        try:
                            sched_display = datetime.fromisoformat(sched).astimezone(IST).strftime("%d %b %Y at %I:%M %p")
                        except Exception:
                            sched_display = sched
                        tool_result = f"ALREADY_BOOKED|{sched_display}|{doctor_name}"
                    else:
                        preferred_dt = _parse_preferred_datetime(preferred_date, preferred_time)
                        if not preferred_dt:
                            preferred_dt = datetime.now(IST) + timedelta(days=1)
                            preferred_dt = preferred_dt.replace(hour=10, minute=0, second=0)

                        slot = _find_best_slot(supabase, preferred_dt)

                        if slot:
                            # Create appointment
                            appt_data = {
                                "patient_id": lead["id"],
                                "doctor_id": slot["doctor_id"],
                                "scheduled_at": slot["start"],
                                "duration_minutes": slot["duration_minutes"],
                                "status": "pending",
                                "notes": f"Booked via WhatsApp by {lead.get('name', 'Unknown')}"
                            }
                            res = supabase.table("appointments").insert(appt_data).execute()
                            if res.data:
                                doctor_name = slot.get("doctor_name", "our doctor")
                                try:
                                    slot_display = datetime.fromisoformat(slot["start"]).astimezone(IST).strftime("%d %b %Y at %I:%M %p")
                                except Exception:
                                    slot_display = slot["start"]
                                tool_result = f"BOOKED|{slot_display}|{doctor_name}"
                                # Save appointment reference in metadata
                                metadata["last_appointment_id"] = res.data[0]["id"]
                                supabase.table(table).update({"metadata": metadata}).eq("id", lead["id"]).execute()
                            else:
                                tool_result = "BOOKING_FAILED"
                        else:
                            # No slots available — create waiting appointment
                            appt_data = {
                                "patient_id": lead["id"],
                                "doctor_id": None,
                                "scheduled_at": (datetime.now(IST) + timedelta(days=1)).isoformat(),
                                "duration_minutes": 30,
                                "status": "waiting_for_doctor",
                                "notes": f"WhatsApp booking request — no doctor available. Preferred: {preferred_date} {preferred_time}"
                            }
                            supabase.table("appointments").insert(appt_data).execute()
                            tool_result = "NO_SLOTS_AVAILABLE"

                elif func_name == "update_appointment":
                    args = json.loads(tool_call.function.arguments)
                    preferred_date = args.get("preferred_date", "tomorrow")
                    preferred_time = args.get("preferred_time", "10:00 AM")

                    existing_appt = _get_lead_existing_appointment(lead["id"], supabase)
                    if not existing_appt:
                        tool_result = "NO_EXISTING_APPOINTMENT"
                    else:
                        preferred_dt = _parse_preferred_datetime(preferred_date, preferred_time)
                        if not preferred_dt:
                            preferred_dt = datetime.now(IST) + timedelta(days=1)
                            preferred_dt = preferred_dt.replace(hour=10, minute=0, second=0)

                        slot = _find_best_slot(supabase, preferred_dt)

                        if slot:
                            # Update the existing appointment
                            supabase.table("appointments").update({
                                "doctor_id": slot["doctor_id"],
                                "scheduled_at": slot["start"],
                                "duration_minutes": slot["duration_minutes"],
                                "status": "pending",
                                "notes": f"Rescheduled via WhatsApp by {lead.get('name', 'Unknown')}"
                            }).eq("id", existing_appt["id"]).execute()

                            doctor_name = slot.get("doctor_name", "our doctor")
                            try:
                                slot_display = datetime.fromisoformat(slot["start"]).astimezone(IST).strftime("%d %b %Y at %I:%M %p")
                            except Exception:
                                slot_display = slot["start"]
                            tool_result = f"UPDATED|{slot_display}|{doctor_name}"
                        else:
                            # No free slot — keep old booking
                            try:
                                old_display = datetime.fromisoformat(existing_appt["scheduled_at"]).astimezone(IST).strftime("%d %b %Y at %I:%M %p")
                                old_doctor = (existing_appt.get("staffs") or {}).get("full_name", "your doctor")
                            except Exception:
                                old_display = existing_appt.get("scheduled_at", "")
                                old_doctor = "your doctor"
                            tool_result = f"NO_NEW_SLOT_KEEP_OLD|{old_display}|{old_doctor}"

                elif func_name == "cancel_appointment":
                    args = json.loads(tool_call.function.arguments)
                    reason = args.get("reason", "No reason provided")

                    existing_appt = _get_lead_existing_appointment(lead["id"], supabase)
                    if not existing_appt:
                        tool_result = "NO_EXISTING_APPOINTMENT"
                    else:
                        supabase.table("appointments").update({
                            "status": "cancelled",
                            "notes": f"Cancelled via WhatsApp. Reason: {reason}"
                        }).eq("id", existing_appt["id"]).execute()
                        tool_result = f"CANCELLED|{reason}"

                # Append tool result to messages for second pass
                tool_result_messages.append({
                    "role": "tool",
                    "tool_call_id": tool_call.id,
                    "content": tool_result
                })

            # Second pass — let the AI compose the reply based on tool results
            if not ai_text:
                for tr in tool_result_messages:
                    messages.append(tr)

                # Add human-readable context for tool results
                context_for_ai = []
                for tr in tool_result_messages:
                    r = tr["content"]
                    if r.startswith("BOOKED|"):
                        parts = r.split("|")
                        context_for_ai.append(f"Appointment successfully booked on {parts[1]} with {parts[2]}.")
                    elif r.startswith("ALREADY_BOOKED|"):
                        parts = r.split("|")
                        context_for_ai.append(f"This lead already has an appointment on {parts[1]} with {parts[2]}. Ask if they want to update or cancel it.")
                    elif r == "NO_SLOTS_AVAILABLE":
                        context_for_ai.append("No doctor slots are available right now. A waiting request has been created. Our team will call them to confirm a time.")
                    elif r.startswith("UPDATED|"):
                        parts = r.split("|")
                        context_for_ai.append(f"Appointment rescheduled to {parts[1]} with {parts[2]}.")
                    elif r.startswith("NO_NEW_SLOT_KEEP_OLD|"):
                        parts = r.split("|")
                        context_for_ai.append(f"No free slot found for the new time. Old appointment on {parts[1]} with {parts[2]} remains unchanged.")
                    elif r.startswith("CANCELLED|"):
                        parts = r.split("|")
                        context_for_ai.append(f"Appointment cancelled. Reason: {parts[1]}.")
                    elif r == "NO_EXISTING_APPOINTMENT":
                        context_for_ai.append("No existing appointment found for this lead.")
                    elif r == "Lead info saved":
                        context_for_ai.append("Lead information saved. Give a warm greeting acknowledging their details.")

                if context_for_ai:
                    messages.append({"role": "system", "content": " | ".join(context_for_ai)})

                second_response = oai_client.chat.completions.create(
                    model="gpt-4o-mini",
                    messages=messages,
                    temperature=0.7,
                    max_tokens=200
                )
                ai_text = second_response.choices[0].message.content or "Thank you!"

        return ai_text, should_trigger_call

    except Exception as e:
        print(f"[OpenAI Agent] Error generating response: {e}")
        import traceback
        traceback.print_exc()
        return "I apologize, but I am having trouble connecting right now. A member of our team will reach out to you shortly.", False
