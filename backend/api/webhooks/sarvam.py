"""
Sarvam AI Managed Mode — Webhook Handlers
==========================================

When Sarvam AI's managed voice agent (connected to Exotel) needs to execute
a "tool" (function call), it sends an HTTP POST to the URL you configured in
the Sarvam dashboard for that tool.

When the call ends, Sarvam sends a POST to the post-call webhook URL you set,
containing the full transcript, summary, call duration etc.

All the heavy CRM logic that previously lived inside the Pipecat pipeline
(doctor handoff, scheduling, lead scoring, memory vectorization) now lives
here as simple REST endpoints.

Endpoints registered under /api/webhooks/sarvam/:
  GET  /tool/fetch-lead        ← Sarvam calls this ON CALL START to get lead context
  POST /tool/connect-doctor    ← Sarvam calls this when user wants doctor
  POST /tool/schedule-call     ← Sarvam calls this when user wants appointment
  POST /tool/schedule-callback ← Sarvam calls this when user wants callback later
  POST /tool/search-kb         ← Sarvam calls this when user asks a question
  POST /post-call              ← Sarvam calls this when the call ends
  POST /initiate-call          ← Our CRM calls this to start an outbound AI call

Dashboard configuration (Sarvam AI → Your Agent → Tools):
  Tool "fetch_lead_details"    → GET  https://api.genestac.com/api/webhooks/sarvam/tool/fetch-lead?lead_id={{lead_id}}
  Tool "connect_to_doctor"     → POST https://api.genestac.com/api/webhooks/sarvam/tool/connect-doctor
  Tool "schedule_call"         → POST https://api.genestac.com/api/webhooks/sarvam/tool/schedule-call
  Tool "schedule_callback"     → POST https://api.genestac.com/api/webhooks/sarvam/tool/schedule-callback
  Tool "search_knowledge_base" → POST https://api.genestac.com/api/webhooks/sarvam/tool/search-kb
  Post-call webhook            → POST https://api.genestac.com/api/webhooks/sarvam/post-call
"""

import os
import re
import json
import logging
import asyncio
from datetime import datetime, timedelta
from typing import Any, Optional

import pytz
import openai
from fastapi import APIRouter, BackgroundTasks, Request
from pydantic import BaseModel

from db.supabase import get_supabase_client
from services.exotel_service import bridge_doctor_and_customer, _get_exotel_creds, initiate_ai_call

logger = logging.getLogger(__name__)

router = APIRouter()

IST = pytz.timezone("Asia/Kolkata")


# ─────────────────────────────────────────────────────────────────────────────
# Helpers shared across handlers
# ─────────────────────────────────────────────────────────────────────────────

def _is_doctor_available(doc: dict, current_time: datetime) -> bool:
    """Checks if a doctor is active and within their scheduled hours."""
    if not doc.get("allow_ai_calls", True):
        return False
    if not doc.get("is_active"):
        return False
    start_str = doc.get("start_time")
    end_str = doc.get("end_time")
    available_days = doc.get("available_days") or []
    if not start_str or not end_str or not available_days:
        return False
    if current_time.strftime("%A") not in available_days:
        return False
    for fmt in ("%H:%M:%S", "%H:%M"):
        try:
            start = datetime.strptime(start_str, fmt).time()
            end = datetime.strptime(end_str, fmt).time()
            return start <= current_time.time() <= end
        except ValueError:
            continue
    return False


import re as _re
_UUID_RE = _re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
    _re.IGNORECASE,
)


def _is_valid_uuid(val: str) -> bool:
    """Return True only if val looks like a real UUID (not a template literal)."""
    return bool(val and _UUID_RE.match(val.strip()))


def _get_lead_id_from_body(body: dict) -> str:
    """
    Sarvam passes the lead_id through the tool call parameters or the
    call metadata. Try several known keys in order of preference.
    Returns empty string for unresolved template literals like {{lead_id}}.
    """
    params = body.get("parameters", body.get("params", body.get("arguments", {})))
    if isinstance(params, str):
        try:
            params = json.loads(params)
        except Exception:
            params = {}

    lead_id = (
        params.get("lead_id")
        or body.get("lead_id")
        or body.get("custom_data", {}).get("lead_id")
        or body.get("metadata", {}).get("lead_id")
        or ""
    )
    lead_id = str(lead_id).strip()
    # Discard unresolved Sarvam template literals (e.g. "{{lead_id}}")
    if lead_id.startswith("{") or not _is_valid_uuid(lead_id):
        return ""
    return lead_id


def _get_customer_phone_from_body(body: dict) -> str:
    """Extract caller's phone from various Sarvam payload shapes."""
    return (
        body.get("caller_number")
        or body.get("from_number")
        or body.get("custom_data", {}).get("customer_phone")
        or body.get("metadata", {}).get("customer_phone")
        or ""
    )


# ─────────────────────────────────────────────────────────────────────────────
# Tool: fetch_lead_details  (on-call-start GET — personalise the greeting)
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/tool/fetch-lead")
async def tool_fetch_lead(lead_id: str = ""):
    """
    Sarvam calls this AT CALL START (on-start tool) to fetch lead context.

    Dashboard config:
      Method : GET
      URL    : https://api.genestac.com/api/webhooks/sarvam/tool/fetch-lead
      Param  : lead_id  (query param, value = {{lead_id}} agent variable)

    Step 3 response fields to send to agent:
      Lead name: @lead_name | Source: @source | Last call: @last_call_summary
    """
    _DEFAULTS = {
        "lead_name": "ji",
        "source": "hamare website se",
        "status": "new",
        "last_call_summary": "",
    }

    # Guard: reject empty values, unresolved Sarvam template literals like {{lead_id}},
    # or anything that obviously isn't a UUID (prevents Supabase type errors during testing).
    import re
    _uuid_re = re.compile(
        r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.IGNORECASE
    )
    if not lead_id or not _uuid_re.match(lead_id.strip()):
        logger.warning(f"[Sarvam/fetch-lead] Skipping DB query — lead_id not a valid UUID: {lead_id!r}")
        return _DEFAULTS

    supabase = get_supabase_client()

    # Fetch from users (leads) table
    lead_name = "ji"
    source = "hamare website se"
    lead_status = "new"

    u = supabase.table("users").select("name, source, status").eq("id", lead_id).execute()
    if u.data:
        row = u.data[0]
        lead_name = row.get("name") or "ji"
        source = row.get("source") or "hamare website se"
        lead_status = row.get("status") or "new"
    else:
        l = supabase.table("leads").select("name, source, status").eq("id", lead_id).execute()
        if l.data:
            row = l.data[0]
            lead_name = row.get("name") or "ji"
            source = row.get("source") or "hamare website se"
            lead_status = row.get("status") or "new"

    # Fetch last call memory for context
    last_call_summary = ""
    try:
        mem = (
            supabase.table("lead_context_memory")
            .select("memory_text")
            .eq("lead_id", lead_id)
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        if mem.data:
            last_call_summary = mem.data[0].get("memory_text", "")[:400]
    except Exception:
        pass

    logger.warning(
        f"[Sarvam/fetch-lead] lead_id={lead_id!r} name={lead_name!r} "
        f"status={lead_status!r} memory_len={len(last_call_summary)}"
    )

    return {
        "lead_name": lead_name,
        "source": source,
        "status": lead_status,
        "last_call_summary": last_call_summary,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Tool: connect_to_doctor
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/tool/connect-doctor")
async def tool_connect_to_doctor(request: Request, background_tasks: BackgroundTasks):
    """
    Sarvam calls this when the user explicitly asks to speak with a doctor.
    
    Expected body (Sarvam tool call format):
    {
        "parameters": {
            "lead_id": "<uuid>",
            "user_explicitly_confirmed": true,
            "reason": "user said doctor se baat karni hai"
        },
        "caller_number": "08312345678",
        "call_id": "<sarvam-call-id>"
    }
    
    Response tells Sarvam what message to speak to the user.
    """
    body: dict = await request.json()
    logger.warning(f"[Sarvam/connect-doctor] Received: {json.dumps(body)[:500]}")

    params = body.get("parameters", body.get("params", body.get("arguments", {})))
    if isinstance(params, str):
        try:
            params = json.loads(params)
        except Exception:
            params = {}

    lead_id = _get_lead_id_from_body(body)
    # Dashboard test guard — {{lead_id}} is not a real UUID
    if not lead_id:
        return {"response": "[TEST] connect_to_doctor tool reached successfully. In a real call, this will bridge the user to an available doctor."}
    customer_phone = _get_customer_phone_from_body(body)
    user_confirmed = params.get("user_explicitly_confirmed", False)
    reason = params.get("reason", "doctor connect requested")

    logger.warning(
        f"[Sarvam/connect-doctor] lead_id={lead_id!r}, confirmed={user_confirmed}, reason={reason!r}"
    )

    # Guard: LLM must have confirmed the user explicitly asked
    if not user_confirmed:
        return {
            "response": (
                "Pehle user se confirm karo: 'Kya aap abhi kisi doctor se baat karna chahenge?' "
                "Wait for a clear yes before connecting."
            )
        }

    supabase = get_supabase_client()

    # Find an available doctor
    try:
        doc_res = (
            supabase.table("doctor_schedules")
            .select("*, staffs(full_name)")
            .not_.is_("exotel_number", "null")
            .execute()
        )
        current_dt_ist = datetime.now(IST)
        available_docs = [
            d for d in (doc_res.data or [])
            if _is_doctor_available(d, current_dt_ist)
        ]
    except Exception as db_err:
        logger.error(f"[Sarvam/connect-doctor] DB error: {db_err}")
        available_docs = []

    if not available_docs:
        logger.warning("[Sarvam/connect-doctor] No active doctors found.")
        return {
            "response": (
                "Abhi koi doctor available nahi hai. "
                "Kya main aapke liye ek future appointment book kar sakti hu, "
                "ya phir aapko callback schedule kar sakti hu?"
            )
        }

    doctor = available_docs[0]
    doctor_phone = doctor["exotel_number"]
    doctor_name = (
        doctor.get("staffs", {}).get("full_name", "our doctor")
        if isinstance(doctor.get("staffs"), dict)
        else "our doctor"
    )

    logger.warning(
        f"[Sarvam/connect-doctor] Connecting lead {lead_id} with {doctor_name} ({doctor_phone})"
    )

    # Update lead status in CRM
    if lead_id:
        try:
            supabase.table("leads").update({"status": "CONSULTATION_SCHEDULED"}).eq("id", lead_id).execute()
            supabase.table("users").update({"status": "CONSULTATION_SCHEDULED"}).eq("id", lead_id).execute()
        except Exception as e:
            logger.error(f"[Sarvam/connect-doctor] Failed to update lead status: {e}")

    # Schedule the bridge call in the background (give Sarvam time to speak the message first)
    async def _do_bridge():
        await asyncio.sleep(5)  # Let Sarvam speak the announcement first
        if not customer_phone:
            logger.error("[Sarvam/connect-doctor] customer_phone empty — cannot bridge!")
            return
        result = bridge_doctor_and_customer(
            doctor_phone=doctor_phone,
            customer_phone=customer_phone,
        )
        if result and result.get("success"):
            logger.warning(f"[Sarvam/connect-doctor] ✅ Bridge initiated: {doctor_phone} ⇔ {customer_phone}")
        else:
            logger.error(f"[Sarvam/connect-doctor] ❌ Bridge failed: {result}")

    background_tasks.add_task(_do_bridge)

    return {
        "response": (
            f"Bilkul! Main abhi Dr. {doctor_name} ko connect kar rahi hu. "
            f"Aapko hamare number se ek aur call aayegi. "
            f"Is call ko aap band kar sakte hain. Thank you!"
        )
    }


def _find_lead_active_appointment(supabase, lead_id: str, patient_phone: Optional[str] = None) -> Optional[dict]:
    """
    Finds the most recent active/pending/scheduled appointment for a lead/patient.
    Returns appointment dict with doctor name if found, else None.
    """
    if not lead_id and not patient_phone:
        return None
    try:
        if lead_id:
            res = (
                supabase.table("appointments")
                .select("id, scheduled_at, status, doctor_id, duration_minutes, title, notes, staffs!doctor_id(full_name)")
                .eq("patient_id", lead_id)
                .in_("status", ["pending", "confirmed", "scheduled", "in_progress"])
                .order("scheduled_at", desc=True)
                .limit(1)
                .execute()
            )
            if res.data:
                appt = res.data[0]
                doc_info = appt.get("staffs")
                doc_name = doc_info.get("full_name", "our doctor") if isinstance(doc_info, dict) else "our doctor"
                appt["doctor_name"] = doc_name
                return appt
    except Exception as e:
        logger.error(f"[Sarvam] Error querying active appointment by lead_id: {e}")

    # Fallback search by patient phone if available
    if patient_phone:
        try:
            res = (
                supabase.table("appointments")
                .select("id, scheduled_at, status, doctor_id, duration_minutes, title, notes, staffs!doctor_id(full_name)")
                .in_("status", ["pending", "confirmed", "scheduled", "in_progress"])
                .ilike("notes", f"%{patient_phone}%")
                .order("scheduled_at", desc=True)
                .limit(1)
                .execute()
            )
            if res.data:
                appt = res.data[0]
                doc_info = appt.get("staffs")
                doc_name = doc_info.get("full_name", "our doctor") if isinstance(doc_info, dict) else "our doctor"
                appt["doctor_name"] = doc_name
                return appt
        except Exception as e:
            logger.error(f"[Sarvam] Error querying active appointment by phone: {e}")

    return None


# ─────────────────────────────────────────────────────────────────────────────
# Tool: check_consultation  (check if user already has an active appointment)
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/tool/check-consultation")
@router.post("/tool/check-consultation")
async def tool_check_consultation(request: Request, lead_id: Optional[str] = None):
    """
    Sarvam calls this to check if the caller already has a consultation booked.
    Works for both GET (query param lead_id) and POST (body parameters).
    """
    resolved_lead_id = ""
    phone = ""

    if request.method == "POST":
        try:
            body: dict = await request.json()
            resolved_lead_id = _get_lead_id_from_body(body)
            phone = _get_customer_phone_from_body(body)
        except Exception:
            body = {}

    if not resolved_lead_id and lead_id:
        if _is_valid_uuid(lead_id.strip()):
            resolved_lead_id = lead_id.strip()

    if not resolved_lead_id and not phone:
        return {
            "has_booked_consultation": False,
            "response": "[TEST] check_consultation tool reached successfully. In a real call, this checks existing consultations."
        }

    supabase = get_supabase_client()
    existing_appt = _find_lead_active_appointment(supabase, resolved_lead_id, phone)

    if existing_appt:
        scheduled_at = existing_appt.get("scheduled_at", "")
        doc_name = existing_appt.get("doctor_name", "our doctor")
        try:
            friendly_time = datetime.fromisoformat(scheduled_at).astimezone(IST).strftime("%d %B %Y at %I:%M %p IST")
        except Exception:
            friendly_time = scheduled_at

        return {
            "has_booked_consultation": True,
            "appointment_id": existing_appt.get("id"),
            "doctor_name": doc_name,
            "scheduled_at": scheduled_at,
            "friendly_time": friendly_time,
            "status": existing_appt.get("status", "pending"),
            "response": (
                f"Aapka consultation already booked hai Dr. {doc_name} ke saath {friendly_time} ke liye. "
                f"Kya aap is appointment ka time change ya reschedule karna chahte hain?"
            )
        }

    return {
        "has_booked_consultation": False,
        "response": (
            "Aapka koi active consultation abhi book nahi hai. "
            "Kya aap hamare expert doctor ke saath consultation book karna chahenge?"
        )
    }


def _parse_user_time_preference(time_str: str) -> datetime:
    """
    Parses ISO strings, natural language ("today 5 pm", "tomorrow 11:30 am"),
    and Hinglish ("aaj sham 5 baje", "kal subah 10 baje") into a timezone-aware (IST) datetime.
    """
    ist = pytz.timezone("Asia/Kolkata")
    now = datetime.now(ist)

    if not time_str or not isinstance(time_str, str):
        return now.replace(hour=10, minute=0, second=0, microsecond=0) + timedelta(days=1)

    s = time_str.strip().lower()

    # 1. Direct ISO parsing
    try:
        dt = datetime.fromisoformat(time_str.strip())
        if dt.tzinfo is None:
            dt = ist.localize(dt)
        else:
            dt = dt.astimezone(ist)
        # If year or date is in past, adjust to today or future
        if dt.date() < now.date():
            dt = dt.replace(year=now.year, month=now.month, day=now.day)
            if dt < now:
                dt += timedelta(days=1)
        return dt
    except Exception:
        pass

    # 2. Relative day
    target_date = now.date()
    if any(k in s for k in ["tomorrow", "kal", "next day"]):
        target_date = now.date() + timedelta(days=1)
    elif any(k in s for k in ["day after tomorrow", "parso", "parson"]):
        target_date = now.date() + timedelta(days=2)
    elif any(k in s for k in ["today", "aaj", "tonight", "this evening", "this afternoon"]):
        target_date = now.date()
    else:
        weekdays = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
        for idx, day_name in enumerate(weekdays):
            if day_name in s:
                days_ahead = (idx - now.weekday() + 7) % 7
                if days_ahead == 0 and now.hour >= 18:
                    days_ahead = 7
                target_date = now.date() + timedelta(days=days_ahead)
                break

    # 3. Time extraction (12-hr with am/pm)
    hour = 17  # Default to 5 PM if evening is requested
    minute = 0

    m_12 = re.search(r"(\b\d{1,2})(?::(\d{2}))?\s*(am|pm)\b", s)
    if m_12:
        h = int(m_12.group(1))
        m = int(m_12.group(2) or 0)
        ampm = m_12.group(3).lower()
        if ampm == "pm" and h < 12:
            h += 12
        elif ampm == "am" and h == 12:
            h = 0
        hour = h
        minute = m
    else:
        # 24-hr format (e.g. "17:00", "17:30")
        m_24 = re.search(r"\b(\d{1,2}):(\d{2})\b", s)
        if m_24:
            hour = int(m_24.group(1))
            minute = int(m_24.group(2))
        else:
            # Match number like "5", "5 baje", "5 o'clock"
            m_num = re.search(r"\b(\d{1,2})\s*(?:baje|o'clock|clock)?\b", s)
            if m_num:
                h = int(m_num.group(1))
                is_evening_hint = any(k in s for k in ["sham", "shaam", "evening", "dopahar", "afternoon", "night", "raat", "pm"])
                if (is_evening_hint or (1 <= h <= 7)) and h < 12:
                    h += 12
                hour = h
                minute = 0

    target_dt = ist.localize(datetime(
        target_date.year, target_date.month, target_date.day,
        hour, minute, 0
    ))

    # If requested time today has already passed, advance to tomorrow
    if target_date == now.date() and target_dt < now:
        target_dt += timedelta(days=1)

    return target_dt


# ─────────────────────────────────────────────────────────────────────────────
# Tool: schedule_call  (book or reschedule a doctor appointment)
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/tool/schedule-call")
async def tool_schedule_call(request: Request):
    """
    Sarvam calls this when the user asks to book or reschedule a doctor consultation.
    If an active consultation already exists, it updates/reschedules it to avoid duplicates.

    Expected body:
    {
        "parameters": {
            "lead_id": "<uuid>",
            "time_preference": "2026-07-31T15:00:00+05:30",
            "reason": "weight loss consultation"
        }
    }
    """
    body: dict = await request.json()
    logger.warning(f"[Sarvam/schedule-call] Received: {json.dumps(body)[:500]}")

    params = body.get("parameters", body.get("params", body.get("arguments", {})))
    if isinstance(params, str):
        try:
            params = json.loads(params)
        except Exception:
            params = {}

    lead_id = _get_lead_id_from_body(body)
    # Dashboard test guard — {{lead_id}} is not a real UUID
    if not lead_id:
        return {"response": "[TEST] schedule_call tool reached successfully. In a real call, this will book or update a doctor consultation appointment."}
    time_preference = params.get("time_preference", "")
    reason = params.get("reason", "Consultation")

    logger.warning(f"[Sarvam/schedule-call] lead_id={lead_id!r}, time={time_preference!r}, reason={reason!r}")

    supabase = get_supabase_client()

    # ── Parse time robustly ──────────────────────────────────────────────────
    ist = pytz.timezone("Asia/Kolkata")
    preferred_dt = _parse_user_time_preference(time_preference)
    logger.warning(f"[Sarvam/schedule-call] Parsed '{time_preference}' -> {preferred_dt.isoformat()}")

    # ── Find lead details ───────────────────────────────────────────────────
    sales_rep_id = None
    patient_id = None
    patient_phone_fallback = None
    lead_name = "the customer"

    user_res = supabase.table("users").select("id, assigned_sales_rep_id, phone, name").eq("id", lead_id).execute()
    if user_res.data:
        user = user_res.data[0]
        patient_id = user["id"]
        sales_rep_id = user.get("assigned_sales_rep_id")
        patient_phone_fallback = user.get("phone")
        lead_name = user.get("name") or "the customer"

    if not sales_rep_id:
        lead_res = supabase.table("leads").select("id, assigned_sales_rep_id, phone_number, name").eq("id", lead_id).execute()
        if lead_res.data:
            lead = lead_res.data[0]
            sales_rep_id = lead.get("assigned_sales_rep_id")
            patient_phone_fallback = lead.get("phone_number")
            lead_name = lead.get("name") or lead_name

    if not sales_rep_id:
        admin_res = supabase.table("staffs").select("id").limit(1).execute()
        if admin_res.data:
            sales_rep_id = admin_res.data[0]["id"]

    # ── Check for existing active appointment (avoid creating 2 or 3 consultations) ──
    existing_appt = _find_lead_active_appointment(supabase, lead_id, patient_phone_fallback)

    # ── Find a doctor with available slot ───────────────────────────────────
    doc_res = supabase.table("doctor_schedules").select("staff_id, staffs(full_name), allow_scheduling").eq("allow_scheduling", True).execute()

    if not doc_res.data:
        return {"response": "Main appointment schedule nahi kar saki. Humari team aapse contact karegi jald hi."}

    from services.slot_service import find_nearest_available_slot
    best_slot = None
    best_doctor_id = None
    best_doctor_name = "our doctor"

    for doc in doc_res.data:
        did = doc["staff_id"]
        slot = find_nearest_available_slot(
            doctor_id=did,
            preferred_dt=preferred_dt,
            duration_minutes=10,
            supabase=supabase,
            search_days=7,
        )
        if slot:
            slot_start = datetime.fromisoformat(slot["start"])
            if slot_start.tzinfo and not preferred_dt.tzinfo:
                preferred_dt = ist.localize(preferred_dt)
            dist = abs((slot_start - preferred_dt).total_seconds())
            if best_slot is None or dist < best_slot.get("_dist", float("inf")):
                slot["_dist"] = dist
                best_slot = slot
                best_doctor_id = did
                staff_info = doc.get("staffs")
                if isinstance(staff_info, dict):
                    best_doctor_name = staff_info.get("full_name", "our doctor")

    if not best_slot:
        return {
            "response": (
                "Mujhe agle 7 dino mein koi available slot nahi mili. "
                "Humari team aapse personally contact karegi."
            )
        }

    actual_scheduled_at = best_slot["start"]

    # Friendly time string
    try:
        friendly_time = datetime.fromisoformat(actual_scheduled_at).astimezone(IST).strftime("%d %B %Y at %I:%M %p IST")
    except Exception:
        friendly_time = time_preference

    # ── Update existing appointment OR Insert new appointment ────────────────
    if existing_appt:
        appt_id = existing_appt["id"]
        appt_update_payload = {
            "doctor_id": best_doctor_id,
            "sales_rep_id": sales_rep_id,
            "scheduled_at": actual_scheduled_at,
            "status": "pending",
            "notes": (
                f"Rescheduled via Sarvam AI Voice Agent. Patient requested: {time_preference}. Reason: {reason}"
                + (f"\n[PHONE: {patient_phone_fallback}]" if patient_phone_fallback else "")
            ),
            "title": f"AI-Booked: Consultation with {lead_name}",
            "duration_minutes": 10,
        }
        supabase.table("appointments").update(appt_update_payload).eq("id", appt_id).execute()
        logger.warning(f"[Sarvam/schedule-call] Existing appointment {appt_id} rescheduled to {actual_scheduled_at} for lead {lead_id}")

        # Update lead status
        supabase.table("leads").update({"status": "CONSULTATION_SCHEDULED"}).eq("id", lead_id).execute()
        supabase.table("users").update({"status": "CONSULTATION_SCHEDULED"}).eq("id", lead_id).execute()

        # Notify doctor
        try:
            supabase.table("system_notifications").insert({
                "target_role": "doctor",
                "target_id": best_doctor_id,
                "notification_type": "in_app",
                "title": "Appointment Rescheduled via Sarvam AI Agent",
                "message": f"{lead_name} rescheduled consultation to: {friendly_time}. Reason: {reason}. Appointment ID: {appt_id}"
            }).execute()
        except Exception as notif_err:
            logger.error(f"[Sarvam/schedule-call] Failed to notify doctor: {notif_err}")

        return {
            "response": (
                f"Aapka pehle se booked appointment Dr. {best_doctor_name} ke saath reschedule ho gaya hai {friendly_time} ke liye. "
                f"Aapko confirmation bheja jayega. Kya main aur kuch help kar sakti hu?"
            )
        }
    else:
        appt_payload = {
            "patient_id": patient_id,
            "doctor_id": best_doctor_id,
            "sales_rep_id": sales_rep_id,
            "scheduled_at": actual_scheduled_at,
            "status": "pending",
            "notes": (
                f"Booked via Sarvam AI Voice Agent. Patient requested: {time_preference}. Reason: {reason}"
                + (f"\n[PHONE: {patient_phone_fallback}]" if patient_phone_fallback else "")
            ),
            "title": f"AI-Booked: Consultation with {lead_name}",
            "type": "consultation",
            "duration_minutes": 10,
        }
        appt_res = supabase.table("appointments").insert(appt_payload).execute()
        appt_id = appt_res.data[0]["id"] if appt_res.data else None
        logger.warning(f"[Sarvam/schedule-call] Appointment {appt_id} created for lead {lead_id}")

        # Update lead status
        supabase.table("leads").update({"status": "CONSULTATION_SCHEDULED"}).eq("id", lead_id).execute()
        supabase.table("users").update({"status": "CONSULTATION_SCHEDULED"}).eq("id", lead_id).execute()

        # Notify doctor
        try:
            supabase.table("system_notifications").insert({
                "target_role": "doctor",
                "target_id": best_doctor_id,
                "notification_type": "in_app",
                "title": "New Appointment via Sarvam AI Agent",
                "message": f"{lead_name} requested a consultation: {time_preference}. Reason: {reason}. Appointment ID: {appt_id}"
            }).execute()
        except Exception as notif_err:
            logger.error(f"[Sarvam/schedule-call] Failed to notify doctor: {notif_err}")

        return {
            "response": (
                f"Aapka appointment Dr. {best_doctor_name} ke saath {friendly_time} ke liye book ho gaya hai. "
                f"Aapko confirmation bheja jayega. Kya main aur kuch help kar sakti hu?"
            )
        }



# ─────────────────────────────────────────────────────────────────────────────
# Tool: schedule_callback  (user wants to be called back later)
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/tool/schedule-callback")
async def tool_schedule_callback(request: Request):
    """
    Sarvam calls this when the user says they're busy and want a callback later.

    Expected body:
    {
        "parameters": {
            "lead_id": "<uuid>",
            "callback_datetime": "2026-07-31T18:00:00+05:30"
        }
    }
    """
    body: dict = await request.json()
    logger.warning(f"[Sarvam/schedule-callback] Received: {json.dumps(body)[:500]}")

    params = body.get("parameters", body.get("params", body.get("arguments", {})))
    if isinstance(params, str):
        try:
            params = json.loads(params)
        except Exception:
            params = {}

    lead_id = _get_lead_id_from_body(body)
    # Dashboard test guard — {{lead_id}} is not a real UUID
    if not lead_id:
        return {"response": "[TEST] schedule_callback tool reached successfully. In a real call, this will schedule a callback for the lead."}
    callback_time = params.get("callback_datetime", "")

    logger.warning(f"[Sarvam/schedule-callback] lead_id={lead_id!r}, time={callback_time!r}")

    if lead_id:
        try:
            supabase = get_supabase_client()
            supabase.table("leads").update({
                "ai_callback_time": callback_time,
                "status": "CALLBACK_SCHEDULED"
            }).eq("id", lead_id).execute()
            supabase.table("users").update({
                "ai_callback_time": callback_time,
                "status": "CALLBACK_SCHEDULED"
            }).eq("id", lead_id).execute()
            logger.warning(f"[Sarvam/schedule-callback] Lead {lead_id} callback set to {callback_time}")
        except Exception as e:
            logger.error(f"[Sarvam/schedule-callback] DB update failed: {e}")

    # Friendly time
    friendly_time = callback_time
    try:
        parsed = datetime.fromisoformat(callback_time).astimezone(IST)
        friendly_time = parsed.strftime("%d %B %Y at %I:%M %p IST")
    except Exception:
        pass

    return {
        "response": (
            f"Bilkul, main note kar leti hu. "
            f"Humari team aapko {friendly_time} par call karegi. "
            f"Thank you aapke samay ke liye!"
        )
    }


# ─────────────────────────────────────────────────────────────────────────────
# Tool: search_knowledge_base  (RAG search)
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/tool/search-kb")
async def tool_search_knowledge_base(request: Request):
    """
    Sarvam calls this when the user asks about pricing, program details, etc.

    Expected body:
    {
        "parameters": {
            "lead_id": "<uuid>",
            "query": "What is the price of the medical program?"
        }
    }
    """
    body: dict = await request.json()
    logger.warning(f"[Sarvam/search-kb] Received: {json.dumps(body)[:500]}")

    params = body.get("parameters", body.get("params", body.get("arguments", {})))
    if isinstance(params, str):
        try:
            params = json.loads(params)
        except Exception:
            params = {}

    query = params.get("query", "")
    logger.warning(f"[Sarvam/search-kb] Searching for: '{query}'")

    if not query:
        return {"response": "Mujhe aapka sawaal clearly samajh nahi aaya. Kya aap dobara pooch sakte hain?"}

    try:
        oai_client = openai.AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        embed_res = await oai_client.embeddings.create(
            model="text-embedding-3-small",
            input=query,
        )
        query_vector = embed_res.data[0].embedding

        supabase = get_supabase_client()
        search_res = supabase.rpc("match_knowledge_base", {
            "query_embedding": query_vector,
            "match_threshold": 0.5,
            "match_count": 3
        }).execute()

        results = search_res.data or []
        if results:
            formatted = "\n\n".join([f"{r['title']}: {r['content']}" for r in results])
            logger.warning(f"[Sarvam/search-kb] Found {len(results)} matches.")
            return {"response": formatted}
        else:
            logger.warning("[Sarvam/search-kb] No matches found.")
            return {
                "response": (
                    "Mujhe is sawaal ka exact jawab abhi nahi mila. "
                    "Kya aap doctor se baat karna chahenge ya callback schedule karein?"
                )
            }
    except Exception as e:
        logger.error(f"[Sarvam/search-kb] Error: {e}")
        return {"response": "Abhi knowledge base search mein dikkat aa rahi hai. Kripya thodi der baad try karein."}


# ─────────────────────────────────────────────────────────────────────────────
# Post-call webhook  (Sarvam sends transcript + metadata when call ends)
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/post-call")
async def sarvam_post_call(request: Request, background_tasks: BackgroundTasks):
    body: dict = await request.json()

    # DIAGNOSTIC: use print() so it always appears in docker logs stdout
    import json as _json
    try:
        body_preview = _json.dumps(body, ensure_ascii=False, indent=2)
    except Exception:
        body_preview = str(body)

    print("=" * 60)
    print("[Sarvam/post-call] RAW PAYLOAD RECEIVED")
    print(f"Keys: {list(body.keys())}")
    print(f"lead_id (custom_data): {(body.get('custom_data') or {}).get('lead_id')!r}")
    print(f"lead_id (metadata):    {(body.get('metadata') or {}).get('lead_id')!r}")
    print(f"lead_id (agent_vars):  {(body.get('agent_variables') or {}).get('lead_id')!r}")
    print(f"lead_id (top-level):   {body.get('lead_id')!r}")
    print(f"transcript present:    {bool(body.get('transcript'))}")
    print(f"transcript length:     {len(body.get('transcript') or '')}")
    print(f"Full body:\n{body_preview[:3000]}")
    print("=" * 60)

    background_tasks.add_task(_process_post_call, body)
    return {"status": "received"}



async def _process_post_call(body: dict):
    """
    Background task: score lead, save transcript, vectorize memory.

    Sarvam actual payload shape (confirmed from diagnostics 2026-08-06):
    {
      "attempt_id": "...",
      "status": "connected",
      "duration": 44.6,
      "final_agent_variables": {
          "lead_id": "...",       <- lead_id lives HERE
          "call_summary": "...",
          ...
      },
      "webhook_config": {
          "metadata": {"lead_id": "..."}  <- backup
      },
      "interaction_transcript": [        <- list of turns, NOT a string
          {"role": "agent", "en_text": "..."},
          {"role": "user",  "en_text": "..."},
      ]
    }
    """
    # ── Extract fields from Sarvam's actual payload ────────────────────────
    call_id          = body.get("attempt_id") or body.get("call_id", "")
    duration_seconds = body.get("duration") or body.get("duration_seconds", 0)
    recording_url    = body.get("recording_url", "")

    # lead_id is in final_agent_variables (Sarvam echoes back all agent_variables)
    final_vars = body.get("final_agent_variables") or {}
    lead_id = (
        final_vars.get("lead_id")
        or (body.get("webhook_config") or {}).get("metadata", {}).get("lead_id")
        or (body.get("custom_data") or {}).get("lead_id")
        or (body.get("metadata") or {}).get("lead_id")
        or body.get("lead_id")
        or ""
    )
    lead_id = str(lead_id).strip()

    # transcript: Sarvam sends interaction_transcript as a list of turn objects
    raw_transcript = body.get("interaction_transcript") or body.get("transcript") or []
    if isinstance(raw_transcript, list):
        lines = []
        for turn in raw_transcript:
            role    = (turn.get("role") or "unknown").capitalize()
            en_text = (turn.get("en_text") or "").strip()
            if en_text:
                lines.append(f"{role}: {en_text}")
        transcript = "\n".join(lines)
    else:
        transcript = str(raw_transcript)

    print(f"[Sarvam/post-call] Processing: call_id={call_id!r}, lead_id={lead_id!r}, transcript_lines={len(transcript.splitlines())}")

    if not transcript or not lead_id:
        print(
            f"[Sarvam/post-call] Skipping — "
            f"transcript_empty={not transcript}, lead_id_missing={not lead_id}. "
            f"Body keys: {list(body.keys())}"
        )
        return

    supabase = get_supabase_client()

    # Get lead name for context
    lead_name = "the customer"
    try:
        lr = supabase.table("leads").select("name").eq("id", lead_id).execute()
        if lr.data:
            lead_name = lr.data[0].get("name") or lead_name
        else:
            ur = supabase.table("users").select("name").eq("id", lead_id).execute()
            if ur.data:
                lead_name = ur.data[0].get("name") or lead_name
    except Exception:
        pass

    # ── Lead scoring + structured analysis via GPT-4o-mini ──────────────────
    summary = f"AI Call (Sarvam) with {lead_name}."
    lead_score: Optional[int] = None
    score_label: Optional[str] = None
    score_reason: Optional[str] = None
    is_not_interested = False
    is_spam = False
    callback_requested = False
    appointment_booked = False

    try:
        oai_client = openai.OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        summary_prompt = f"""You are a CRM analyst reviewing an AI sales call for a healthcare company (Genestac — weight loss programs).

Analyze the transcript and return a JSON object with ALL of the following fields.

Call transcript:
{transcript}

Return ONLY a valid JSON object:
{{
  "summary": "3-4 bullet point summary using • character",
  "is_not_interested": true or false,
  "is_spam": true or false,
  "callback_requested": true or false,
  "appointment_booked": true or false,
  "lead_score": integer 0-100,
  "score_label": "Cold" or "Warm" or "Hot",
  "score_reason": "1-2 sentence explanation",
  "wrong_person": true or false,
  "caller_name": "name of whoever actually spoke, if they introduced themselves, else null",
  "patient_name": "actual patient name if different from lead, else null",
  "relation_to_patient": "e.g. wife, brother, son — if a relative answered, else null",
  "weight_goal": "their weight loss goal if mentioned, else null",
  "current_weight": "their current weight if mentioned, else null",
  "interested_plan": "Starter or Medical or Premium or Initial Assessment — whichever they expressed most interest in, else null",
  "health_concerns": "any health issues they mentioned, else null"
}}
Rules:
- `is_not_interested`: true if lead said 'not interested', 'mujhe interest nahi', 'mat call karo', 'remove my number'.
- `is_spam`: true if the caller used abusive language, threats, harassment, or clearly spam behaviour (gaaliyan, abuses, threats, sexual remarks). Set lead_score to 0 if spam.
- `callback_requested`: true if lead asked to be called back later.
- `appointment_booked`: true if a doctor consultation was explicitly scheduled.
- `wrong_person`: true if the person who answered was NOT the original lead.
- `lead_score`: must be an integer 0-100, never null. Set to 0 if is_spam is true.
- `score_label`: Cold (0-39), Warm (40-69), Hot (70-100).
- All other fields: null if not mentioned in the transcript."""

        resp = oai_client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": summary_prompt}],
            max_tokens=400,
            response_format={"type": "json_object"}
        )

        response_text = resp.choices[0].message.content.strip()
        parsed = json.loads(response_text)

        summary = parsed.get("summary", summary)
        is_not_interested = parsed.get("is_not_interested", False)
        is_spam = parsed.get("is_spam", False)
        callback_requested = parsed.get("callback_requested", False)
        appointment_booked = parsed.get("appointment_booked", False)
        lead_score = parsed.get("lead_score")
        score_label = parsed.get("score_label")
        score_reason = parsed.get("score_reason")

        # Structured data extracted from the call
        wrong_person = parsed.get("wrong_person", False)
        caller_name = parsed.get("caller_name")
        patient_name = parsed.get("patient_name")
        relation = parsed.get("relation_to_patient")
        weight_goal = parsed.get("weight_goal")
        current_weight = parsed.get("current_weight")
        interested_plan = parsed.get("interested_plan")
        health_concerns = parsed.get("health_concerns")

        # Merge structured data into lead metadata
        meta_update = {}
        if weight_goal: meta_update["weight_goal"] = weight_goal
        if current_weight: meta_update["current_weight"] = current_weight
        if interested_plan: meta_update["interested_plan_interest"] = interested_plan
        if health_concerns: meta_update["health_concerns"] = health_concerns
        if wrong_person and caller_name: meta_update["caller_name"] = caller_name
        if wrong_person and relation: meta_update["relation_to_patient"] = relation
        if wrong_person and patient_name: meta_update["actual_patient_name"] = patient_name
        if is_spam: meta_update["is_spam"] = True

        if meta_update:
            try:
                existing_meta_res = supabase.table("leads").select("metadata").eq("id", lead_id).execute()
                existing_meta = (existing_meta_res.data[0].get("metadata") or {}) if existing_meta_res.data else {}
                merged = {**existing_meta, **meta_update}
                supabase.table("leads").update({"metadata": merged}).eq("id", lead_id).execute()
                supabase.table("users").update({"metadata": merged}).eq("id", lead_id).execute()
                logger.warning(f"[Sarvam/post-call] Updated lead metadata: {meta_update}")
            except Exception as me:
                logger.error(f"[Sarvam/post-call] Metadata update failed: {me}")

        # Timeline note
        note_parts = ["🤖 AI Call Summary (Sarvam)"]
        if is_spam:
            note_parts.append("🚫 SPAM / ABUSIVE CALLER — Do not call again.")
        if wrong_person:
            note_parts.append(f"⚠️ Wrong person answered. Caller: {caller_name or 'Unknown'} ({relation or 'relative'}). Actual patient: {patient_name or lead_name}.")
        if weight_goal: note_parts.append(f"🎯 Weight Goal: {weight_goal}")
        if current_weight: note_parts.append(f"⚖️ Current Weight: {current_weight}")
        if interested_plan: note_parts.append(f"💳 Interested Plan: {interested_plan}")
        if health_concerns: note_parts.append(f"🏥 Health Concerns: {health_concerns}")
        if callback_requested: note_parts.append("📞 Callback Requested by lead.")
        note_parts.append(f"\n{summary}")
        if recording_url:
            note_parts.append(f"\n[▶️ Listen to Recording]({recording_url})")
        timeline_note = "\n".join(note_parts)

        try:
            supabase.table("interactions").insert({
                "lead_id": lead_id,
                "type": "AI_CALL_NOTE",
                "note": timeline_note,
                "created_by": "sarvam_ai_agent"
            }).execute()
            logger.warning(f"[Sarvam/post-call] Timeline note saved for lead {lead_id}")
        except Exception as note_err:
            try:
                supabase.table("user_notes").insert({
                    "user_id": lead_id,
                    "note": timeline_note,
                    "created_by": "sarvam_ai_agent"
                }).execute()
            except Exception as note_err2:
                logger.error(f"[Sarvam/post-call] Failed to save timeline note: {note_err2}")

        logger.warning(
            f"[Sarvam/post-call] lead={lead_id} score={lead_score} ({score_label}) | "
            f"not_interested={is_not_interested} spam={is_spam} callback={callback_requested} appt={appointment_booked}"
        )

        # ── CRM status update ──────────────────────────────────────────────
        # Priority: SPAM > CONSULTATION_SCHEDULED > NOT_INTERESTED >
        #           CALLBACK_SCHEDULED > QUALIFIED > CONTACTED
        new_status = None
        if is_spam:
            new_status = "SPAM"
        elif appointment_booked:
            new_status = "CONSULTATION_SCHEDULED"
        elif is_not_interested:
            new_status = "NOT_INTERESTED"
        elif callback_requested:
            new_status = "CALLBACK_SCHEDULED"
        elif interested_plan:
            new_status = "QUALIFIED"
        else:
            new_status = "CONTACTED"

        if new_status:
            supabase.table("leads").update({"status": new_status}).eq("id", lead_id).execute()
            supabase.table("users").update({"status": new_status}).eq("id", lead_id).execute()
            logger.warning(f"[Sarvam/post-call] ✅ Lead {lead_id} status → {new_status}")

        # ── Hot lead alert ─────────────────────────────────────────────────
        if lead_score is not None and lead_score >= 70:
            try:
                rep_id = None
                rep_res = supabase.table("users").select("assigned_sales_rep_id").eq("id", lead_id).execute()
                if rep_res.data and rep_res.data[0].get("assigned_sales_rep_id"):
                    rep_id = rep_res.data[0]["assigned_sales_rep_id"]
                else:
                    rep_res2 = supabase.table("leads").select("assigned_sales_rep_id").eq("id", lead_id).execute()
                    if rep_res2.data and rep_res2.data[0].get("assigned_sales_rep_id"):
                        rep_id = rep_res2.data[0]["assigned_sales_rep_id"]

                if rep_id:
                    supabase.table("system_notifications").insert({
                        "target_role": "sales",
                        "target_id": rep_id,
                        "notification_type": "in_app",
                        "title": f"🔥 Hot Lead: {lead_name} ({lead_score}/100)",
                        "message": (
                            f"{lead_name} scored {lead_score}/100 ({score_label}). "
                            f"{score_reason or ''} Call them now before they go cold!"
                        ),
                    }).execute()
                    logger.warning(f"[Sarvam/post-call] 🔥 Hot lead alert sent to sales rep {rep_id}")
            except Exception as notif_err:
                logger.error(f"[Sarvam/post-call] Hot lead alert failed: {notif_err}")

    except Exception as score_err:
        logger.error(f"[Sarvam/post-call] Lead scoring failed: {score_err}", exc_info=True)

    # ── Save call log ──────────────────────────────────────────────────────
    log_payload: dict[str, Any] = {
        "transcript": transcript,
        "summary": summary,
        "status": "completed",
        "provider": "sarvam",
    }
    if lead_score is not None: log_payload["lead_score"] = lead_score
    if score_label is not None: log_payload["score_label"] = score_label
    if score_reason is not None: log_payload["score_reason"] = score_reason
    if recording_url: log_payload["recording_url"] = recording_url

    try:
        log_res = supabase.table("ai_call_logs").select("id").eq("lead_id", lead_id).order("created_at", desc=True).limit(1).execute()
        if log_res.data:
            supabase.table("ai_call_logs").update(log_payload).eq("id", log_res.data[0]["id"]).execute()
            log_id = log_res.data[0]["id"]
            logger.warning(f"[Sarvam/post-call] Updated call log {log_id}")
        else:
            new_log = supabase.table("ai_call_logs").insert({"lead_id": lead_id, **log_payload}).execute()
            log_id = new_log.data[0]["id"] if new_log.data else None
            logger.warning(f"[Sarvam/post-call] Created new call log {log_id}")
    except Exception as log_err:
        logger.error(f"[Sarvam/post-call] Failed to save call log: {log_err}")
        log_id = None




# Initiate outbound call  (called by our CRM frontend/backend)
# ─────────────────────────────────────────────────────────────────────────────

class InitiateCallRequest(BaseModel):
    lead_id: str
    to_number: str
    from_number: Optional[str] = None  # Defaults to Exotel virtual number from DB settings
    initial_state_name: Optional[str] = None  # Override agent entry state if needed


@router.post("/initiate-call")
async def initiate_call(payload: InitiateCallRequest):
    """
    Triggers an outbound AI call using Sarvam AI's Outbound Call API (v3).

    Sarvam dials the lead via its configured Exotel connection and runs the
    AI agent conversation entirely on their managed platform.

    v3 agent_variables:
      - lead_id, lead_name, lead_source_phrase  (existing)
      - call_disposition    ← lead's current CRM status
      - call_summary        ← last call memory / context
      - company_name        ← "Genestac"
      - gender              ← from lead profile if available
    """
    supabase = get_supabase_client()

    # ── Sarvam config from env ───────────────────────────────────────────────
    api_key       = os.getenv("SARVAM_API_KEY", "")
    org_id        = os.getenv("SARVAM_ORG_ID", "")
    workspace_id  = os.getenv("SARVAM_WORKSPACE_ID", "")
    app_id        = os.getenv("SARVAM_APP_ID", "")
    app_version   = int(os.getenv("SARVAM_APP_VERSION", "3"))
    connection_id = os.getenv("SARVAM_CONNECTION_ID", "")
    agent_phone   = os.getenv("SARVAM_AGENT_PHONE_NUMBER", "")
    backend_url   = os.getenv("BACKEND_PUBLIC_URL", "")

    if not all([api_key, org_id, workspace_id, app_id, connection_id, agent_phone]):
        return {"success": False, "error": "Sarvam config incomplete. Check .env SARVAM_* variables."}

    # ── Lead details ─────────────────────────────────────────────────────────
    lead_name          = "ji"
    lead_source_phrase = "humari website pe"
    call_disposition   = "NEW"
    gender             = ""
    src                = ""

    u = supabase.table("users").select("name, source, status, gender").eq("id", payload.lead_id).execute()
    if u.data:
        row = u.data[0]
        lead_name        = row.get("name") or "ji"
        src              = (row.get("source") or "").lower()
        call_disposition = row.get("status") or "NEW"
        gender           = row.get("gender") or ""
    else:
        l = supabase.table("leads").select("name, source, status, gender").eq("id", payload.lead_id).execute()
        if l.data:
            row = l.data[0]
            lead_name        = row.get("name") or "ji"
            src              = (row.get("source") or "").lower()
            call_disposition = row.get("status") or "NEW"
            gender           = row.get("gender") or ""

    source_map = {
        "facebook":  "Facebook pe", "instagram": "Instagram pe",
        "google":    "Google pe",   "website":   "hamare website pe",
        "whatsapp":  "WhatsApp pe", "referral":  "apne ek jaankaar se",
    }
    for key, phrase in source_map.items():
        if key in src:
            lead_source_phrase = phrase
            break

    # ── Fetch last call summary for context ──────────────────────────────────
    call_summary = ""
    try:
        mem = (
            supabase.table("lead_context_memory")
            .select("memory_text")
            .eq("lead_id", payload.lead_id)
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        if mem.data:
            call_summary = (mem.data[0].get("memory_text") or "")[:500]
    except Exception:
        pass

    # ── Build personalised opening line ──────────────────────────────────────
    first_name = lead_name.split()[0] if lead_name != "ji" else "ji"
    if call_summary:
        initial_bot_message = (
            f"Namaste {first_name} ji! Main Genestac se bol rahi hu. "
            f"Aapne pehle humse weight loss ke baare mein baat ki thi — "
            f"kya aap abhi thoda time de sakte hain?"
        )
    else:
        initial_bot_message = (
            f"Namaste {first_name} ji! Main Genestac se bol rahi hu. "
            f"Aapne {lead_source_phrase} hamara weight loss program dekha tha — "
            f"kya aap abhi thoda time de sakte hain?"
        )

    # ── Normalise phone to E.164 ─────────────────────────────────────────────
    to_number = payload.to_number.strip()
    if not to_number.startswith("+"):
        to_number = "+91" + to_number.lstrip("0")

    # ── Sarvam v3 Outbound API payload ───────────────────────────────────────
    sarvam_payload = {
        "app_config": {
            "app_id": app_id,
            "app_version": app_version,
            "app_type": "agent",
            "connection_config": {
                "connection_id": connection_id,
                "agent_phone_number": agent_phone,
            },
            "agent_variables": {
                "lead_id":           payload.lead_id,
                "lead_name":         lead_name,
                "lead_source_phrase": lead_source_phrase,
                "call_disposition":  call_disposition,
                "call_summary":      call_summary,
                "company_name":      "Genestac",
                "gender":            gender,
            },
            # NOTE: app_overrides only sent when initial_state_name is explicitly provided.
            # Sending initial_bot_message without a valid initial_state_name drops the call.
            # To use: pass initial_state_name matching your Sarvam agent's state name.
            **({
                "app_overrides": {
                    "initial_bot_message": initial_bot_message,
                    "initial_state_name": payload.initial_state_name,
                }
            } if payload.initial_state_name else {}),
        },
        "user_config": {"user_phone_number": to_number},
    }
    if backend_url:
        sarvam_payload["webhook_config"] = {
            "url": f"{backend_url}/api/webhooks/sarvam/post-call",
            "metadata": {"lead_id": payload.lead_id},
        }

    logger.warning(
        f"[Sarvam/initiate-call] Firing v{app_version} call: "
        f"lead={payload.lead_id} name={lead_name!r} disposition={call_disposition!r} "
        f"has_summary={bool(call_summary)} to={to_number}"
    )

    # ── POST to Sarvam ───────────────────────────────────────────────────────
    import urllib.request as _ur
    import urllib.error as _ue
    api_url = (
        f"https://apps.sarvam.ai/api/outbounds/v1/orgs/{org_id}"
        f"/workspaces/{workspace_id}/outbounds"
    )
    req = _ur.Request(
        api_url,
        data=json.dumps(sarvam_payload).encode(),
        headers={"Content-Type": "application/json", "X-API-Key": api_key},
        method="POST",
    )
    try:
        with _ur.urlopen(req, timeout=15) as resp:
            result = json.loads(resp.read().decode())
            logger.info(f"[Sarvam/initiate-call] ✅ Call queued: lead={payload.lead_id}, to={to_number}")
            return {"success": True, "data": result}
    except _ue.HTTPError as e:
        err = e.read().decode()
        logger.error(f"[Sarvam/initiate-call] ❌ HTTP {e.code}: {err}")
        return {"success": False, "error": f"Sarvam API {e.code}: {err}"}
    except Exception as e:
        logger.error(f"[Sarvam/initiate-call] ❌ {e}")
        return {"success": False, "error": str(e)}
