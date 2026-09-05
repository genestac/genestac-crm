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
    """Fuzzy search inventory by brand/product name, returns best match.
    
    Strips common dose/variant suffixes so 'Mounjaro 2.5mg' finds 'Mounjaro (Tirzepatide)'.
    """
    import re
    try:
        # Strip dose info to get brand name: "Mounjaro 2.5mg" -> "Mounjaro"
        brand_query = re.split(r'\s+\d', query)[0].strip()  # everything before first digit
        # Try brand name first, then full query as fallback
        for search_term in [brand_query, query]:
            if not search_term:
                continue
            res = supabase.table("inventory").select(
                "id, name, price, compare_at_price, category, gst_percentage"
            ).ilike("name", f"%{search_term}%").limit(5).execute()
            items = res.data or []
            if items:
                # Prefer items with compare_at_price (MRP) set
                with_mrp = [i for i in items if i.get("compare_at_price")]
                return (with_mrp or items)[0]
        return None
    except Exception as e:
        print(f"[Agent] Inventory search error: {e}")
        return None


def _format_lead_data_for_prompt(lead: dict, metadata: dict) -> str:
    current_glp1 = metadata.get("current_glp1")
    glp1_str = "Yes" if current_glp1 is True else ("No" if current_glp1 is False else "Unknown")
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
        f"--- TRACK STATE ---",
        f"Service Type: {metadata.get('service_type', 'unknown')}",
        f"Interested Product: {metadata.get('interested_product') or 'Not specified'}",
        f"Currently on GLP-1: {glp1_str}",
        f"Injection Screen Step: {metadata.get('injection_screen_step', 0)} (0=not started, 1=Q1 done, 2=Q2 done, 3=all done)",
        f"Injection Screen Done: {metadata.get('injection_screen_done', False)}",
        f"Injection Screen Passed: {metadata.get('injection_screen_passed', False)}",
        f"Interested Plan: {metadata.get('interested_plan') or metadata.get('interested_plan_interest') or 'Not specified'}",
        f"No-Call Preference: {metadata.get('no_call_preference', False)}",
    ]
    return "\n".join(parts)


# ── Injection intent keywords ────────────────────────────────────────────────
INJECTION_KEYWORDS = [
    "glp", "glp-1", "glp1", "glp 1",
    "injection", "inject",
    "mounjaro", "wegovy", "ozempic", "obeda",
    "semaglutide", "tirzepatide", "sematrinity", "semafull",
    "2.5mg", "5mg", "7.5mg", "10mg", "12.5mg", "15mg",
    "0.25mg", "0.5mg", "1.7mg", "2.4mg",
]

NO_CALL_KEYWORDS = [
    "call nhi", "call nahi", "call mat", "call na karo", "call nahi karna",
    "call nhi karna", "no call", "don't call", "do not call",
    "call band", "call ki zarurat nahi", "call me later",
    "mujhe call nhi", "mujhe call nahi",
]


def _detect_injection_intent(message: str, chat_history: list) -> bool:
    """Return True if the current message or recent history contains injection-related keywords."""
    texts = [message.lower()]
    for m in chat_history[-8:]:
        texts.append((m.get("content") or "").lower())
    combined = " ".join(texts)
    return any(kw in combined for kw in INJECTION_KEYWORDS)


def _detect_no_call_preference(message: str) -> bool:
    """Return True if user's current message expresses they don't want a call."""
    msg_lower = message.lower()
    return any(kw in msg_lower for kw in NO_CALL_KEYWORDS)


# Answer detection for screening questions (Hindi + English)
SCREENING_NO_KEYWORDS = [
    "nhi", "nahi", "nahin", "nai", "no ", "no,", "nope",
    "nhi hai", "nahi hai", "nhi hua", "nahi hua",
    "kisi ko nhi", "kisi ko nahi", "koi nhi", "koi nahi",
    "koi dikkat", "problem nhi", "history nhi", "history nahi",
    "kabhi nhi", "kabhi nahi", "bilkul nhi", "bilkul nahi",
    "nhi hoti", "nahi hoti", "nhi hota",
    "kisi ko bhi nhi", "family mein nhi",
]
SCREENING_YES_KEYWORDS = [
    "haan", "ha ", "ha,", "yes", "hua hai", "hua tha",
    "hoti hai", "hota hai", "thi", "tha", "hai",
]


def _detect_screening_answer(message: str) -> str:
    """
    Detect if the user answered Yes or No to a screening question.
    Returns 'no', 'yes', or '' (ambiguous).
    Always checks No first since most short Hindi negations are unambiguous.
    """
    msg = " " + message.lower().strip() + " "  # pad for word-boundary matching
    # Check No first (more common, unambiguous short replies like "nhi", "nahi")
    if any(kw in msg for kw in SCREENING_NO_KEYWORDS):
        return "no"
    if any(kw in msg for kw in SCREENING_YES_KEYWORDS):
        return "yes"
    return ""


async def _update_conversation_summary(
    lead_id: str,
    table: str,
    metadata: dict,
    supabase: Client,
    new_user_message: str,
    new_ai_response: str,
) -> None:
    """
    Generate a rolling ~150-word conversation summary via GPT-4o-mini and
    persist it to metadata.conversation_summary.
    Called as a fire-and-forget background task after every AI reply.
    """
    existing_summary = metadata.get("conversation_summary", "")
    service_type = metadata.get("service_type", "unknown")
    try:
        prompt = (
            "You are a conversation summarizer for Aalya, a WhatsApp healthcare sales AI "
            "(Genestac Therapeutics).\n\n"
            f"Current summary:\n{existing_summary or 'None — first turn.'}\n\n"
            f"Latest exchange:\n"
            f"User: {new_user_message}\n"
            f"Aalya: {new_ai_response}\n\n"
            f"Service track: {service_type}\n\n"
            "Update the summary. Max 150 words. Include:\n"
            "- Service track (injection purchase OR program enrollment)\n"
            "- What user shared (name, age, weight, height, medical history, goals)\n"
            "- Product/plan interest expressed\n"
            "- Questions already asked and answered (avoid repeating)\n"
            "- Current conversation state (e.g. 'Screening done. Recommended Mounjaro 2.5mg. Awaiting purchase decision.')\n"
            "- Strong preferences (e.g. 'User does NOT want phone calls')\n"
            "Return only the updated summary text, no preamble."
        )
        res = oai_client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=220,
            temperature=0.2,
        )
        new_summary = (res.choices[0].message.content or "").strip()
        updated_meta = {**metadata, "conversation_summary": new_summary}
        supabase.table(table).update({"metadata": updated_meta}).eq("id", lead_id).execute()
        print(f"[Agent] Conversation summary updated for lead {lead_id}")
    except Exception as e:
        print(f"[Agent] Summary update failed (non-fatal): {e}")


def _build_injection_track_prompt(lead: dict, metadata: dict) -> str:
    """System prompt for users who want to purchase a GLP-1 injection directly."""
    screen_done = metadata.get("injection_screen_done", False)
    screen_passed = metadata.get("injection_screen_passed", False)
    current_glp1 = metadata.get("current_glp1")  # True / False / None
    no_call = metadata.get("no_call_preference", False)

    gender = (metadata.get("gender") or lead.get("gender") or "").lower().strip()
    is_male = gender in ("male", "m", "man", "ladka", "mard", "purush")

    if screen_done and screen_passed:
        if current_glp1:
            phase_instruction = (
                "CURRENT PHASE: ESCALATION DISCUSSION\n"
                "The user is already on a GLP-1. Ask their current dose, then guide on escalation.\n"
                "Always recommend doctor consultation for dose changes."
            )
        else:
            phase_instruction = (
                "CURRENT PHASE: PRODUCT RECOMMENDATION & PURCHASE\n"
                "Safety screening is complete and passed. User is GLP-1 naive.\n"
                "- Recommend Mounjaro 2.5mg as the safest starter dose for the first month.\n"
                "- Tirzepatide (Mounjaro) shows 20.2% avg weight loss vs 13.7% for Semaglutide — mention when comparing.\n"
                "- Price (only when asked): MRP Rs 8,000 → aapke liye Rs 7,200 (10% off).\n"
                "- PURCHASE TRIGGER: When user says any of these — 'khareedna hai', 'invoice do', "
                "'payment link', 'kar dijiye', 'kar do', 'haan', 'haa', 'ha', 'ok', 'send karo', "
                "'bhej do', 'proceed', 'theek hai', 'bilkul' — IMMEDIATELY call generate_proforma_invoice "
                "with product_name='Mounjaro'. Do NOT ask again what they want. Do NOT apologize first.\n"
                "- Secondary CTA (offer alongside): 'Ya pehle doctor se ek baar baat karein? FREE hai!'"
            )
    elif screen_done and not screen_passed:
        phase_instruction = (
            "CURRENT PHASE: CONTRAINDICATION FOUND\n"
            "The user has a contraindication. Do NOT proceed with injection sale.\n"
            "Warmly explain: this condition requires a doctor evaluation before starting.\n"
            "Offer: 'Kya main aapka FREE doctor consultation book kar du?' → call book_google_meet if they agree."
        )
    else:
        step = int(metadata.get("injection_screen_step") or 0)

        if is_male:
            # Males: skip pregnancy question entirely. Only 2 questions: Q1 (thyroid) + Q3 (pancreatitis).
            if step == 0:
                phase_instruction = (
                    "CURRENT PHASE: SAFETY SCREENING — QUESTION 1 of 2\n"
                    "Ask this casually and briefly:\n"
                    "  'Ek quick check — aapke family mein ya aapko kabhi thyroid cancer ki koi history hai?'\n\n"
                    "When user answers:\n"
                    "  - If NO → call save_lead_info(injection_screen_step=1). Then immediately ask the next question.\n"
                    "  - If YES → call save_lead_info(injection_screen_done=true, injection_screen_passed=false). "
                    "Explain warmly, offer FREE doctor consultation via book_google_meet."
                )
            elif step == 1:
                phase_instruction = (
                    "CURRENT PHASE: SAFETY SCREENING — QUESTION 2 of 2 (FINAL)\n"
                    "Q1 (thyroid) already answered: No.\n"
                    "Ask this only:\n"
                    "  'Aur ek baat — kabhi severe pancreatitis hua hai aapko?'\n\n"
                    "When user answers:\n"
                    "  - If NO → call save_lead_info(injection_screen_step=3, injection_screen_done=true, "
                    "injection_screen_passed=true). Then IMMEDIATELY recommend Mounjaro 2.5mg.\n"
                    "  - If YES → call save_lead_info(injection_screen_done=true, injection_screen_passed=false). "
                    "Explain warmly, offer FREE doctor consultation via book_google_meet."
                )
            else:
                phase_instruction = (
                    "All screening questions answered. "
                    "Call save_lead_info(injection_screen_done=true, injection_screen_passed=true) and recommend Mounjaro 2.5mg."
                )
        else:
            # Female / unknown gender: ask all 3 questions
            if step == 0:
                phase_instruction = (
                    "CURRENT PHASE: SAFETY SCREENING — QUESTION 1 of 3\n"
                    "Ask this casually and briefly:\n"
                    "  'Ek quick check — aapke family mein ya aapko kabhi thyroid cancer ki koi history hai?'\n\n"
                    "When user answers:\n"
                    "  - If NO → call save_lead_info(injection_screen_step=1). Then immediately ask next question.\n"
                    "  - If YES → call save_lead_info(injection_screen_done=true, injection_screen_passed=false). "
                    "Explain warmly, offer FREE doctor consultation via book_google_meet."
                )
            elif step == 1:
                phase_instruction = (
                    "CURRENT PHASE: SAFETY SCREENING — QUESTION 2 of 3\n"
                    "Q1 already answered: No.\n"
                    "Ask this only:\n"
                    "  'Aur ek baat — aap abhi pregnant hain ya pregnancy plan kar rahi hain?'\n\n"
                    "When user answers:\n"
                    "  - If NO → call save_lead_info(injection_screen_step=2). Then immediately ask last question.\n"
                    "  - If YES → call save_lead_info(injection_screen_done=true, injection_screen_passed=false). "
                    "Explain warmly, offer FREE doctor consultation via book_google_meet."
                )
            elif step == 2:
                phase_instruction = (
                    "CURRENT PHASE: SAFETY SCREENING — QUESTION 3 of 3 (FINAL)\n"
                    "Q1 and Q2 already answered: No, No.\n"
                    "Ask this only:\n"
                    "  'Last one — kabhi severe pancreatitis hua hai?'\n\n"
                    "When user answers:\n"
                    "  - If NO → call save_lead_info(injection_screen_step=3, injection_screen_done=true, "
                    "injection_screen_passed=true). Then IMMEDIATELY recommend Mounjaro 2.5mg.\n"
                    "  - If YES → call save_lead_info(injection_screen_done=true, injection_screen_passed=false). "
                    "Explain warmly, offer FREE doctor consultation via book_google_meet."
                )
            else:
                phase_instruction = (
                    "All screening questions answered. "
                    "Call save_lead_info(injection_screen_done=true, injection_screen_passed=true) and recommend Mounjaro 2.5mg."
                )

    no_call_rule = (
        "\nCRITICAL: This user said they do NOT want phone calls. "
        "NEVER call trigger_exotel_call under any circumstances.\n"
    ) if no_call else (
        "\nCALL RULE: ONLY call trigger_exotel_call if user explicitly says "
        "'mujhe call chahiye' or 'call karo'. Never proactively trigger a call.\n"
    )

    return f"""You are Aalya, an empathetic Care Consultant at Genestac Therapeutics, chatting on WhatsApp.

GENDER RULE: You are a woman. Use: "main bol rahi hu", "main batati hu". NEVER masculine.
LANGUAGE RULE: Match the user's language (Hindi / Hinglish / English).
FORMAT RULE: 1-2 short sentences per reply. NO markdown. Natural, warm tone. Do NOT re-introduce yourself.

================================================
    SERVICE TRACK: GLP-1 INJECTION PURCHASE
================================================
This user wants to buy a GLP-1 injection. Follow the current phase exactly.

{phase_instruction}
{no_call_rule}
INJECTION PRODUCT KNOWLEDGE:
- Tirzepatide (Mounjaro): GIP+GLP-1 dual agonist. 2.5→5→7.5→10→12.5→15mg weekly. 20.2% avg weight loss.
- Semaglutide (Wegovy/Ozempic/Obeda/Sematrinity/Semafull): GLP-1 agonist. 13.7% avg weight loss.
- All injections: self-administer OR use local clinic/hospital/pharmacy.
- Common side effects (if asked): Nausea, diarrhea, vomiting, constipation — mostly temporary.

ABOUT GENESTAC (mention when relevant):
- FREE weekly doctor consultation included with any injection purchase
- Personalized diet + exercise plan
- Mobile app tracking + dosage guidance

ABSOLUTE DON'T LIST:
DO NOT send the GLP-1 intake form.
DO NOT ask for address or pincode (not needed for injection purchase).
DO NOT repeat a screening question that was already asked — the step number in Lead Profile is the source of truth.
DO NOT ask the user's name/age/weight if already listed in Lead Profile.
DO NOT ask what product they want if they already mentioned Mounjaro or a GLP-1.
DO NOT apologize or reference previous errors — just move forward.
DO NOT generate invoice for a plan (Starter/Medical/Premium) — only for the injection product."""







def _build_program_track_prompt(lead: dict, metadata: dict, is_first_message: bool) -> str:
    """System prompt for users interested in the Genestac weight loss program enrollment."""
    intake_sent = lead.get("wa_intake_form_sent") or metadata.get("wa_intake_form_sent") or False
    no_call = metadata.get("no_call_preference", False)

    if is_first_message and not intake_sent:
        first_msg_rule = (
            "\nCRITICAL FIRST MESSAGE:\n"
            "This is the FIRST message. Call send_intake_form immediately. "
            "Give a very short warm greeting and send the form. Nothing else yet."
        )
    elif is_first_message and intake_sent:
        first_msg_rule = (
            "\nFIRST REPLY AFTER INTAKE FORM:\n"
            "The lead has filled the form. Call save_lead_info with ALL fields: "
            "name, age, gender, height, weight, medical_history, address, pincode. Then give a warm acknowledgment."
        )
    else:
        first_msg_rule = ""

    no_call_rule = (
        "\nCRITICAL: This user said they do NOT want phone calls. "
        "NEVER call trigger_exotel_call.\n"
    ) if no_call else (
        "\nCALL RULE: ONLY call trigger_exotel_call if user explicitly says "
        "'mujhe call chahiye' or 'call karo'.\n"
    )

    return f"""You are Aalya, an empathetic Care Consultant at Genestac Therapeutics, chatting on WhatsApp.

GENDER RULE: You are a woman. Use: "main bol rahi hu", "main batati hu". NEVER masculine.
LANGUAGE RULE: Match the user's language (Hindi / Hinglish / English).
FORMAT RULE: 1-2 short sentences per reply. NO markdown. Natural, warm tone. Do NOT re-introduce yourself.
{no_call_rule}
================================================
    SERVICE TRACK: PROGRAM ENROLLMENT
================================================
This user is exploring Genestac's weight loss program.

CONVERSATIONAL FLOW:
Step 1 — INTAKE: Send intake form on first message (if not sent).
Step 2 — DISCOVERY: After form → save info → validate → "Kab se ye problem hai?"
Step 3 — MEDICAL BRIDGE: "Zyadatar log sirf khana kam karte hain lekin biology koi nahi dekhta. Genestac mein hum aapke metabolism aur hormones ko samajhkar protocol banate hain."
Step 4 — CTA: "Hamara FREE Initial Assessment abhi available hai (normally Rs 1,499). Kya main book kar du?"
Step 5 — OBJECTION HANDLING: Validate, then: "Unlike diets, hum biological root cause treat karte hain."
{first_msg_rule}
WHAT WE OFFER:
- FREE initial medical assessment (normally Rs 1,499)
- Weekly doctor consultation included in all plans
- Personalized diet + exercise plan | Mobile app | Dosage guidance
- Plans: Starter (Rs 4,999/mo) | Medical (Rs 12,999/mo) | Premium (Rs 29,999/mo)

GLP-1 CONTEXT (if topic arises):
- Mounjaro (Tirzepatide): 20.2% avg weight loss. Starter dose: 2.5mg.
- Wegovy (Semaglutide): 13.7% avg weight loss.
- For naive users: recommend Mounjaro 2.5mg.

TOOL RULES:
- TALK LATER: "baad mein" / "busy hoon" → call schedule_followup.
- DOCTOR: User wants to speak to doctor → call book_google_meet.
- PURCHASE PLAN: User wants to buy a plan → call generate_proforma_invoice with plan_name.
- PRICING: Only share when user explicitly asks."""


# ── SYSTEM PROMPT ROUTER ──────────────────────────────────────────────────────
def _build_system_prompt(
    base_prompt: str,
    lead: dict,
    metadata: dict,
    rag_context: str,
    is_first_message: bool,
) -> str:
    lead_info = _format_lead_data_for_prompt(lead, metadata)
    service_type = metadata.get("service_type", "unknown")
    conversation_summary = metadata.get("conversation_summary", "")
    lead_name = lead.get("name") or "ji"

    if service_type == "injection":
        core_prompt = _build_injection_track_prompt(lead, metadata)
    else:
        core_prompt = _build_program_track_prompt(lead, metadata, is_first_message)

    # Only include DB-configured base_prompt if it has meaningful content beyond default
    admin_note = ""
    if base_prompt and "helpful, empathetic AI" not in base_prompt:
        admin_note = f"\nADMIN ADDITIONAL INSTRUCTIONS:\n{base_prompt}\n"

    # Pending invoice override — GPT MUST call the tool, not generate text
    pending_override = ""
    if metadata.get("pending_invoice") and metadata.get("injection_screen_passed"):
        pending_override = (
            "\n⚠️ IMMEDIATE ACTION REQUIRED ⚠️\n"
            "The user has confirmed they want to purchase Mounjaro. "
            "Your ONLY job this turn is to call generate_proforma_invoice(product_name='Mounjaro'). "
            "Do NOT generate any text response before calling the tool. "
            "After the tool returns, give a brief confirmation (1 sentence max).\n"
        )

    return f"""{core_prompt}
{admin_note}{pending_override}
NAME ANCHOR: You are speaking to {lead_name}. NEVER reference any other name in your response.

CURRENT LEAD PROFILE (do NOT re-ask anything already listed here):
{lead_info}

CONVERSATION MEMORY (do NOT repeat topics already covered — this is your long-term context):
{conversation_summary if conversation_summary else "No prior context — conversation just started."}

KNOWLEDGE BASE:
{rag_context if rag_context else "No specific KB context found."}"""


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
                    "service_type": {"type": "string", "enum": ["injection", "program"], "description": "Set to 'injection' if user wants to buy a GLP-1 injection directly. Set to 'program' for weight-loss program enrollment."},
                    "current_glp1": {"type": "boolean", "description": "True if user is already on a GLP-1 medication; False if GLP-1 naive."},
                    "injection_screen_step": {"type": "integer", "description": "Screening progress: call with 1 after Q1 answered No, 2 after Q2 answered No, 3 after Q3 answered No."},
                    "injection_screen_done": {"type": "boolean", "description": "Set to true once all 3 safety screening questions have been asked and answered."},
                    "injection_screen_passed": {"type": "boolean", "description": "Set to true if user passed all safety screening. Set to false if any contraindication found."},
                    "no_call_preference": {"type": "boolean", "description": "Set to true if user explicitly says they do NOT want a phone call."},
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
        .limit(40)  # Fetch more; only last 6 raw turns go to GPT — the rest is in conversation_summary
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

    # ── Injection intent detection (keyword scan on current message + recent history) ──
    if not metadata.get("service_type"):
        if _detect_injection_intent(message, chat_history):
            metadata["service_type"] = "injection"
            try:
                supabase.table(table).update(
                    {"metadata": {**metadata}}
                ).eq("id", lead_id).execute()
                print(f"[Agent] Injection intent detected — service_type='injection' set for lead {lead_id}")
            except Exception as _ie:
                print(f"[Agent] service_type save failed (non-fatal): {_ie}")

    # ── No-call preference detection (keyword scan on current message) — synchronous ──
    if not metadata.get("no_call_preference") and _detect_no_call_preference(message):
        metadata["no_call_preference"] = True
        try:
            supabase.table(table).update(
                {"metadata": {**metadata}}
            ).eq("id", lead_id).execute()
            print(f"[Agent] No-call preference detected and saved for lead {lead_id}")
        except Exception as _nce:
            print(f"[Agent] no_call_preference save failed (non-fatal): {_nce}")

    # ── Injection screening auto-advance (Python-driven, NOT GPT tool-driven) ────────────
    # GPT is unreliable at calling save_lead_info for short Hindi answers like "Nhi".
    # We detect the answer here and advance the state BEFORE building the system prompt,
    # so GPT always sees the already-updated step and just writes the next question.
    if metadata.get("service_type") == "injection" and not metadata.get("injection_screen_done"):
        _step = int(metadata.get("injection_screen_step") or 0)
        _gender = (metadata.get("gender") or lead.get("gender") or "").lower().strip()
        _is_male = _gender in ("male", "m", "man", "ladka", "mard", "purush")
        _max_steps = 2 if _is_male else 3

        if _step < _max_steps:
            _answer = _detect_screening_answer(message)
            if _answer == "no":
                _new_step = _step + 1
                if _new_step >= _max_steps:
                    # All screening questions answered No — passed
                    metadata["injection_screen_step"] = _max_steps
                    metadata["injection_screen_done"] = True
                    metadata["injection_screen_passed"] = True
                    print(f"[Agent] Injection screening PASSED for lead {lead_id} (step {_step} → done)")
                else:
                    metadata["injection_screen_step"] = _new_step
                    print(f"[Agent] Injection screening step {_step} → {_new_step} for lead {lead_id}")
                try:
                    supabase.table(table).update({"metadata": {**metadata}}).eq("id", lead_id).execute()
                except Exception as _se:
                    print(f"[Agent] Screening step DB update failed (non-fatal): {_se}")
            elif _answer == "yes":
                # Contraindication found
                metadata["injection_screen_done"] = True
                metadata["injection_screen_passed"] = False
                print(f"[Agent] Contraindication found at step {_step} for lead {lead_id}")
                try:
                    supabase.table(table).update({"metadata": {**metadata}}).eq("id", lead_id).execute()
                except Exception as _se:
                    print(f"[Agent] Contraindication DB update failed (non-fatal): {_se}")
            # else: ambiguous answer — GPT handles it, step stays the same


    # ── Injection purchase intent detection (Python-driven) ───────────────────────────────
    # When screening is done and user expresses purchase intent, set pending_invoice=True.
    # The system prompt then gives GPT an OVERRIDE instruction to call generate_proforma_invoice NOW.
    _PURCHASE_KEYWORDS = [
        "payment link", "link bhej", "link send", "link share", "link do",
        "invoice", "bill send", "proforma",
        "khareed", "buy ", "purchase",
        "pay kar", "abhi le",
    ]
    _AFFIRM_KEYWORDS = [
        "haa", "haan", "ha ", "ha,", " yes", "ok ", "ok,", "theek hai",
        "bilkul", "proceed", "kar do", "kar dijiye", "bhej do", "send karo",
    ]
    _msg_pad = " " + message.lower().strip() + " "
    _inj_track = metadata.get("service_type") == "injection"
    _wants_purchase = any(kw in _msg_pad for kw in _PURCHASE_KEYWORDS)

    # ── Payment bypass: skip screening if user explicitly asks for payment/invoice ──
    # If someone says "payment link do" or "invoice bhejo" at ANY point in the injection
    # flow (even mid-screening), skip all remaining questions and generate the invoice.
    if _inj_track and _wants_purchase and not metadata.get("injection_screen_done"):
        metadata["injection_screen_done"] = True
        metadata["injection_screen_passed"] = True
        metadata["injection_screen_step"] = 3
        metadata["pending_invoice"] = True
        print(f"[Agent] Payment bypass: skipping screening for lead {lead_id}")
        try:
            supabase.table(table).update({"metadata": {**metadata}}).eq("id", lead_id).execute()
        except Exception as _pe:
            print(f"[Agent] Payment bypass DB save failed (non-fatal): {_pe}")

    _inj_ready = (
        _inj_track and
        metadata.get("injection_screen_done") and
        metadata.get("injection_screen_passed")
    )
    if _inj_ready:
        _is_affirm = any(kw in _msg_pad for kw in _AFFIRM_KEYWORDS)
        if _wants_purchase or (metadata.get("pending_invoice") and _is_affirm) or _is_affirm:
            metadata["pending_invoice"] = True

    # ── Stale conversation_summary guard ───────────────────────────────────────────────
    # If summary contains names completely unrelated to lead name, clear it to avoid hallucination.
    _lead_name = (lead.get("name") or "").strip().lower()
    _summary = metadata.get("conversation_summary", "")
    if _summary and _lead_name and len(_lead_name) > 2:
        # If the summary is very long and doesn't mention the lead's name at all,
        # it's likely stale data from another lead — wipe it.
        _summary_lower = _summary.lower()
        if _lead_name not in _summary_lower and len(_summary) > 100:
            metadata["conversation_summary"] = ""
            print(f"[Agent] Cleared stale conversation_summary for lead {lead_id} (name mismatch)")

    base_prompt = "You are a helpful, empathetic AI assistant for Genestac Therapeutics."
    settings_res = supabase.table("global_settings").select("settings_value").eq(
        "settings_key", "ai_call_settings"
    ).execute()
    if settings_res.data:
        bp = settings_res.data[0]["settings_value"].get("whatsapp_prompt") or \
             settings_res.data[0]["settings_value"].get("base_prompt", "")
        if bp:
            base_prompt = bp

    # ── Build messages (summarization approach: summary in system prompt + last 6 raw turns) ──
    system_prompt = _build_system_prompt(base_prompt, lead, metadata, rag_context, is_first_message)
    messages = [{"role": "system", "content": system_prompt}]
    messages.extend(chat_history[-6:])  # Only last 6 raw turns; older context lives in conversation_summary
    messages.append({"role": "user", "content": message})

    # ── First call to GPT ────────────────────────────────────────────────────
    try:
        response = oai_client.chat.completions.create(
            model="gpt-4o-mini",
            messages=messages,
            tools=TOOLS,
            tool_choice="auto",
            # Lower temperature for injection state machine to avoid Q-loop hallucinations
            temperature=0.3 if metadata.get("service_type") == "injection" else 0.7,
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
                        # Track-state fields (string / numeric)
                        "service_type",
                    ]
                    # Boolean / integer fields — use `is not None` so False and 0 are saved correctly
                    bool_int_fields = [
                        "current_glp1", "injection_screen_done", "injection_screen_passed",
                        "no_call_preference", "injection_screen_step",
                    ]
                    for field in meta_fields:
                        if args.get(field):
                            metadata[field] = args[field]
                    for field in bool_int_fields:
                        if args.get(field) is not None:
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
                            f"Payment link and invoice already sent. Give a brief positive confirmation (1 sentence max)."
                        )
                        # Clear pending_invoice flag so it doesn't re-trigger
                        metadata["pending_invoice"] = False
                        try:
                            supabase.table(table).update({"metadata": {**metadata}}).eq("id", lead_id).execute()
                        except Exception:
                            pass

                    except Exception as e:
                        print(f"[Agent] generate_proforma_invoice error: {e}")
                        import traceback
                        traceback.print_exc()
                        tool_result_str = f"PI_ERROR|{str(e)}"
                        tool_results_for_ai.append(
                            "Invoice generation failed. Tell user: 'Ek second — main aapka payment link abhi bhejti hu.' "
                            "Do NOT say team will follow up."
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

        # ── Update conversation summary asynchronously (fire-and-forget) ────────
        if ai_text:
            asyncio.create_task(
                _update_conversation_summary(
                    lead_id=lead_id,
                    table=table,
                    metadata=metadata,
                    supabase=supabase,
                    new_user_message=message,
                    new_ai_response=ai_text,
                )
            )

        return ai_text, should_trigger_call

    except Exception as e:
        print(f"[OpenAI Agent] Error: {e}")
        import traceback
        traceback.print_exc()
        return (
            "Abhi thodi technical problem aa rahi hai. Hamari team jald hi aapko contact karegi. 🙏",
            False,
        )
