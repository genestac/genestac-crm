"""
video_meet_service.py
Handles appointment booking with Jitsi Meet video links.

Jitsi Meet is free, open-source, and requires zero credentials.
Every appointment gets a unique room: https://meet.jit.si/genestac-<short-id>
Both doctor and patient click the same link to join.

Flow:
  1. AI checks if lead already has a pending/confirmed appointment
  2. If yes → inform patient, offer to reschedule
  3. If no → book with status="pending" (awaiting doctor approval)
  4. Doctor approves/rejects/suggests new time from dashboard
  5. On approval, WhatsApp confirmation sent to patient with Jitsi link
  6. 10 min before: WhatsApp reminder sent to both
"""

import re
import uuid
import string
import random
from datetime import datetime, timedelta
from typing import Optional
from supabase import Client
from zoneinfo import ZoneInfo

IST = ZoneInfo("Asia/Kolkata")

SALES_BOT_ID = "c842f1fd-66ec-4e95-bf08-3a3f76d0f0a7"


# ── Jitsi Meet link generator ─────────────────────────────────────────────────

def _generate_jitsi_link(appointment_id: str) -> str:
    short_id = appointment_id.replace("-", "")[:8]
    suffix = "".join(random.choices(string.ascii_lowercase + string.digits, k=6))
    room = f"genestac-{short_id}-{suffix}"
    return f"https://meet.jit.si/{room}"


# ── Doctor availability ───────────────────────────────────────────────────────

def _is_within_schedule(schedule: dict, check_dt: datetime) -> bool:
    try:
        day_name = check_dt.strftime("%A")
        available_days = schedule.get("available_days") or []
        if day_name not in available_days:
            return False
        start_str = str(schedule.get("start_time", "09:00"))
        end_str = str(schedule.get("end_time", "18:00"))
        sh, sm = int(start_str[:2]), int(start_str[3:5])
        eh, em = int(end_str[:2]), int(end_str[3:5])
        slot_start_minutes = check_dt.hour * 60 + check_dt.minute
        return (sh * 60 + sm) <= slot_start_minutes < (eh * 60 + em)
    except Exception as e:
        print(f"[Meeting] Schedule parse error: {e}")
        return False


def _has_appointment_conflict(supabase: Client, doctor_id: str, start_dt: datetime, duration_minutes: int = 30) -> bool:
    try:
        end_dt = start_dt + timedelta(minutes=duration_minutes)
        window_start = (start_dt - timedelta(minutes=duration_minutes)).isoformat()
        window_end = end_dt.isoformat()
        res = supabase.table("appointments").select("id").eq(
            "doctor_id", doctor_id
        ).not_.in_("status", ["cancelled", "rejected"]).gte(
            "scheduled_at", window_start
        ).lte("scheduled_at", window_end).execute()
        return bool(res.data)
    except Exception as e:
        print(f"[Meeting] Conflict check error: {e}")
        return False


def check_existing_appointment(supabase: Client, lead_id: str) -> Optional[dict]:
    """
    Returns existing pending/confirmed appointment for this lead (if any).
    Used to prevent duplicate bookings and to inform the AI.
    """
    try:
        # Check by LEAD_ID in notes (since patient_id may be null)
        res = supabase.table("appointments").select(
            "id, scheduled_at, status, doctor_id, meeting_link, title"
        ).in_("status", ["pending", "confirmed"]).execute()

        for appt in (res.data or []):
            notes = appt.get("notes", "") or ""
            if f"[LEAD_ID: {lead_id}]" in notes:
                return appt

        return None
    except Exception as e:
        print(f"[Meeting] check_existing_appointment error: {e}")
        return None


def get_next_available_doctor(supabase: Client, now: Optional[datetime] = None) -> Optional[dict]:
    if now is None:
        now = datetime.now(IST)
    try:
        sched_res = supabase.table("doctor_schedules").select(
            "staff_id, available_days, start_time, end_time, allow_scheduling, exotel_number"
        ).eq("allow_scheduling", True).eq("is_active", True).execute()
        schedules = sched_res.data or []
        if not schedules:
            return None
        doctor_ids = [s["staff_id"] for s in schedules]
        staff_res = supabase.table("staffs").select("id, full_name, email").in_("id", doctor_ids).execute()
        staff_map = {s["id"]: s for s in (staff_res.data or [])}
        for sched in schedules:
            doc_id = sched["staff_id"]
            if not _is_within_schedule(sched, now):
                continue
            if _has_appointment_conflict(supabase, doc_id, now, duration_minutes=30):
                continue
            staff = staff_map.get(doc_id, {})
            return {
                "doctor_id": doc_id,
                "doctor_name": staff.get("full_name", "Doctor"),
                "doctor_email": staff.get("email"),
                "exotel_number": sched.get("exotel_number"),
            }
        return None
    except Exception as e:
        print(f"[Meeting] get_next_available_doctor error: {e}")
        return None


def get_next_free_slot(supabase: Client, duration_minutes: int = 30, search_from: Optional[datetime] = None) -> Optional[tuple]:
    try:
        from services.slot_service import find_nearest_available_slot
        sched_res = supabase.table("doctor_schedules").select(
            "staff_id, allow_scheduling, exotel_number"
        ).eq("allow_scheduling", True).eq("is_active", True).execute()
        schedules = sched_res.data or []
        if not schedules:
            return None
        doctor_ids = [s["staff_id"] for s in schedules]
        staff_res = supabase.table("staffs").select("id, full_name, email").in_("id", doctor_ids).execute()
        staff_map = {s["id"]: s for s in (staff_res.data or [])}
        sched_map = {s["staff_id"]: s for s in schedules}
        now = datetime.now(IST)
        preferred_dt = search_from or (now + timedelta(minutes=15))
        if preferred_dt.tzinfo is None:
            preferred_dt = preferred_dt.replace(tzinfo=IST)
        best_start = None
        best_doctor = None
        for doc_id in doctor_ids:
            slot = find_nearest_available_slot(
                doctor_id=doc_id,
                preferred_dt=preferred_dt,
                duration_minutes=duration_minutes,
                supabase=supabase,
                search_days=7,
            )
            if slot:
                try:
                    slot_dt = datetime.fromisoformat(slot["start"])
                    if slot_dt.tzinfo is None:
                        slot_dt = slot_dt.replace(tzinfo=IST)
                    if best_start is None or slot_dt < best_start:
                        best_start = slot_dt
                        sched = sched_map.get(doc_id, {})
                        staff = staff_map.get(doc_id, {})
                        best_doctor = {
                            "doctor_id": doc_id,
                            "doctor_name": staff.get("full_name", "Doctor"),
                            "doctor_email": staff.get("email"),
                            "exotel_number": sched.get("exotel_number"),
                        }
                except Exception:
                    continue
        if best_start and best_doctor:
            return best_start, best_doctor
        return None
    except Exception as e:
        print(f"[Meeting] get_next_free_slot error: {e}")
        return None


# ── Full appointment booking ──────────────────────────────────────────────────

def book_google_meet_appointment(
    supabase: Client,
    lead_id: str,
    lead_name: str,
    lead_email: Optional[str] = None,
    lead_phone: Optional[str] = None,
    preferred_now: bool = True,
    preferred_date: str = "",
    preferred_time: str = "",
    duration_minutes: int = 30,
) -> dict:
    now = datetime.now(IST)
    doctor = None
    scheduled_at = None
    is_immediate = False

    # ── Parse preferred date+time ────────────────────────────────────────────
    requested_dt = None
    if preferred_date or preferred_time:
        try:
            if not preferred_date or preferred_date.lower() in ("today", "aaj"):
                base_date = now.date()
            elif preferred_date.lower() in ("tomorrow", "kal", "agle din"):
                base_date = (now + timedelta(days=1)).date()
            else:
                for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%d %b %Y"):
                    try:
                        base_date = datetime.strptime(preferred_date.strip(), fmt).date()
                        break
                    except ValueError:
                        continue
                else:
                    base_date = now.date()
            if preferred_time:
                t = preferred_time.strip().upper().replace(".", ":")
                m = re.match(r"(\d{1,2})[:.]?(\d{0,2})\s*(AM|PM)?", t)
                if m:
                    h = int(m.group(1))
                    mi = int(m.group(2)) if m.group(2) else 0
                    ampm = m.group(3)
                    if ampm == "PM" and h != 12:
                        h += 12
                    elif ampm == "AM" and h == 12:
                        h = 0
                    requested_dt = datetime(base_date.year, base_date.month, base_date.day,
                                            h, mi, 0, tzinfo=IST)
            else:
                requested_dt = datetime(base_date.year, base_date.month, base_date.day,
                                        9, 0, 0, tzinfo=IST)
        except Exception as _pe:
            print(f"[Meeting] Date/time parse error: {_pe}")

    existing = check_existing_appointment(supabase, lead_id)
    if existing and not requested_dt:
        existing_dt_str = existing.get("scheduled_at", "")
        try:
            existing_dt = datetime.fromisoformat(existing_dt_str)
            if existing_dt.tzinfo is None:
                existing_dt = existing_dt.replace(tzinfo=IST)
            display = existing_dt.strftime("%-d %b %Y at %-I:%M %p IST")
        except Exception:
            display = existing_dt_str
        return {
            "booked": False,
            "already_exists": True,
            "existing_status": existing.get("status"),
            "meeting_link": existing.get("meeting_link"),
            "appointment_id": existing.get("id"),
            "doctor_name": "",
            "scheduled_at_display": display,
            "scheduled_at_iso": existing_dt_str,
            "is_immediate": False,
        }

    if preferred_now and not requested_dt:
        doctor = get_next_available_doctor(supabase, now)
        if doctor:
            scheduled_at = now + timedelta(minutes=2)
            is_immediate = True

    if doctor is None:
        search_from = requested_dt or (now + timedelta(minutes=15))
        result = get_next_free_slot(supabase, duration_minutes=duration_minutes, search_from=search_from)
        if result:
            scheduled_at, doctor = result
        else:
            return {
                "booked": False,
                "already_exists": False,
                "meeting_link": None,
                "appointment_id": None,
                "doctor_name": "our medical team",
                "scheduled_at_display": "",
                "scheduled_at_iso": "",
                "is_immediate": False,
            }

    if scheduled_at.tzinfo is None:
        scheduled_at = scheduled_at.replace(tzinfo=IST)

    # ── Update if existing, otherwise insert ─────────────────────────────────
    if existing:
        appt_id = existing["id"]
        supabase.table("appointments").update({
            "scheduled_at": scheduled_at.isoformat(),
            "status": "pending",
            "doctor_id": doctor["doctor_id"]
        }).eq("id", appt_id).execute()
        meeting_link = existing.get("meeting_link")
        appointment_id = appt_id
    else:
        appointment_id = str(uuid.uuid4())
        meeting_link = _generate_jitsi_link(appointment_id)

        sales_rep_id = SALES_BOT_ID
        try:
            rep_res = supabase.table("staffs").select("id, full_name").eq("is_active", True).execute()
            for s in (rep_res.data or []):
                if "Sales Bot" in (s.get("full_name") or ""):
                    sales_rep_id = s["id"]
                    break
        except Exception:
            pass

        patient_id = None
        try:
            if lead_phone:
                clean_phone = lead_phone.lstrip("+")
                for phone_fmt in [clean_phone, "+" + clean_phone, lead_phone]:
                    u_res = supabase.table("users").select("id").eq("phone", phone_fmt).limit(1).execute()
                    if u_res.data:
                        patient_id = u_res.data[0]["id"]
                        break
        except Exception:
            pass

        MAX_RETRIES = 3
        for attempt in range(MAX_RETRIES):
            appointment_id = str(uuid.uuid4())
            meeting_link = _generate_jitsi_link(appointment_id)
            appt_payload = {
                "id": appointment_id,
                "doctor_id": doctor["doctor_id"],
                "sales_rep_id": sales_rep_id,
                "scheduled_at": scheduled_at.isoformat(),
                "duration_minutes": duration_minutes,
                "status": "pending",
                "type": "consultation",
                "title": f"Free Consultation – {lead_name}",
                "meeting_link": meeting_link,
                "notes": (
                    f"Booked via WhatsApp AI. Lead: {lead_name}"
                    + f" [LEAD_ID: {lead_id}]"
                    + (f" [PHONE: {lead_phone}]" if lead_phone else "")
                ),
            }
            if patient_id:
                appt_payload["patient_id"] = patient_id

            try:
                supabase.table("appointments").insert(appt_payload).execute()
                break
            except Exception as insert_err:
                err_str = str(insert_err).lower()
                is_conflict = any(k in err_str for k in ["unique", "duplicate", "23505", "conflict"])
                if is_conflict and attempt < MAX_RETRIES - 1:
                    result = get_next_free_slot(
                        supabase,
                        duration_minutes=duration_minutes,
                        search_from=scheduled_at + timedelta(minutes=30),
                    )
                    if result:
                        scheduled_at, doctor = result
                        if scheduled_at.tzinfo is None:
                            scheduled_at = scheduled_at.replace(tzinfo=IST)
                        continue
                raise

    try:
        supabase.table("leads").update({"status": "CONSULTATION_SCHEDULED"}).eq("id", lead_id).execute()
    except Exception:
        pass

    scheduled_at_display = scheduled_at.strftime("%-d %b %Y at %-I:%M %p IST")

    # ── Notify doctor via WhatsApp trigger ────────────────────────────────────
    try:
        import asyncio
        from services.whatsapp_service import send_trigger

        doc_res = supabase.table("staffs").select("full_name, whatsapp_number").eq(
            "id", doctor["doctor_id"]
        ).single().execute()
        doc_data = doc_res.data or {}
        doc_wa_number = doc_data.get("whatsapp_number")

        if doc_wa_number:
            raw_name = doc_data.get("full_name", "Doctor")
            doc_display = raw_name.lstrip().removeprefix("Dr.").strip()

            context = {
                "doctor_name":  doc_display,
                "patient_name": lead_name,
                "scheduled_at": scheduled_at_display,
                "jitsi_link":   meeting_link,
            }
            try:
                loop = asyncio.get_event_loop()
                if loop.is_running():
                    asyncio.create_task(send_trigger("appointment_new_request", context, doc_wa_number, supabase))
                else:
                    loop.run_until_complete(send_trigger("appointment_new_request", context, doc_wa_number, supabase))
            except RuntimeError:
                asyncio.run(send_trigger("appointment_new_request", context, doc_wa_number, supabase))
        else:
            print(f"[Meeting] Doctor {doctor['doctor_id']} has no whatsapp_number — skipping notification")
    except Exception as _we:
        print(f"[Meeting] Doctor WhatsApp notify error (non-fatal): {_we}")

    return {
        "booked": True,
        "already_exists": False,
        "rescheduled": bool(existing),
        "meeting_link": meeting_link,
        "appointment_id": appointment_id,
        "doctor_name": doctor["doctor_name"],
        "scheduled_at_display": scheduled_at_display,
        "scheduled_at_iso": scheduled_at.isoformat(),
        "is_immediate": is_immediate,
    }

def format_meet_confirmation_whatsapp(result: dict, lead_name: str, doctor_phone: Optional[str] = None) -> tuple:
    if result.get("already_exists"):
        time_display = result.get("scheduled_at_display", "")
        status = result.get("existing_status", "pending")
        if status == "pending":
            lead_msg = (
                f"⏳ Aapki appointment request already pending hai!\n\n"
                f"📅 Requested Time: {time_display}\n\n"
                f"Doctor jald hi confirm karenge. Kya aap time change karna chahte hain?"
            )
        else:
            meet_link = result.get("meeting_link", "")
            lead_msg = (
                f"✅ Aapki appointment already confirmed hai!\n\n"
                f"📅 Date & Time: {time_display}\n"
                + (f"📹 Video Link: {meet_link}\n" if meet_link else "")
                + f"\nKya aap kuch aur jaanna chahte hain?"
            )
        return lead_msg, None

    if not result["booked"]:
        lead_msg = (
            "Hamari team se abhi koi available nahi hai 🙏\n"
            "Aapka request save kar liya hai. Hum jald hi aapko callback karenge."
        )
        return lead_msg, None

    raw_name = result["doctor_name"]
    doctor_display = raw_name.lstrip().removeprefix("Dr.").strip()
    time_display = result["scheduled_at_display"]
    
    if result.get("rescheduled"):
        lead_msg = (
            f"🔄 *Appointment Rescheduled!*\n\n"
            f"👨‍⚕️ Doctor: Dr. {doctor_display}\n"
            f"📅 New Requested Time: {time_display}\n\n"
            f"✅ Dr. {doctor_display} se confirm hone par aapko Jitsi Meet link bheja jayega.\n"
            f"Approval mein thoda samay lagega — please wait karein! 🙏"
        )
        doctor_msg = (
            f"🔔 *Rescheduled Consultation Request (Pending Approval)*\n\n"
            f"Patient: {lead_name}\n"
            f"New Requested Time: {time_display}\n"
            f"📹 Jitsi Link (share on approval): {result.get('meeting_link', '')}\n\n"
            f"Please approve or suggest alternate time in the dashboard. 🙏"
        )
    else:
        lead_msg = (
            f"📋 *Consultation Request Received!*\n\n"
            f"👨‍⚕️ Doctor: Dr. {doctor_display}\n"
            f"📅 Requested Time: {time_display}\n\n"
            f"✅ Dr. {doctor_display} se confirm hone par aapko Jitsi Meet link bheja jayega.\n"
            f"Approval mein thoda samay lagega — please wait karein! 🙏"
        )
        doctor_msg = (
            f"🔔 *New Consultation Request (Pending Approval)*\n\n"
            f"Patient: {lead_name}\n"
            f"Requested Time: {time_display}\n"
            f"📹 Jitsi Link (share on approval): {result.get('meeting_link', '')}\n\n"
            f"Please approve or suggest alternate time in the dashboard. 🙏"
        )

    return lead_msg, doctor_msg
