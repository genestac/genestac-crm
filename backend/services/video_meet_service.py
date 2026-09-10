"""
meeting_service.py  (was video_meet_service.py)
Handles appointment booking with Jitsi Meet video links.

Jitsi Meet is free, open-source, and requires zero credentials.
Every appointment gets a unique room: https://meet.jit.si/genestac-<short-id>
Both doctor and patient click the same link to join.
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


# ── Jitsi Meet link generator ─────────────────────────────────────────────────

def _generate_jitsi_link(appointment_id: str) -> str:
    """
    Generates a unique, unguessable Jitsi Meet room URL for the appointment.
    Format: https://meet.jit.si/genestac-<short-id>-<random>
    """
    short_id = appointment_id.replace("-", "")[:8]
    suffix = "".join(random.choices(string.ascii_lowercase + string.digits, k=6))
    room = f"genestac-{short_id}-{suffix}"
    return f"https://meet.jit.si/{room}"


# ── Doctor availability ───────────────────────────────────────────────────────

def _is_within_schedule(schedule: dict, check_dt: datetime) -> bool:
    """
    Returns True if check_dt falls within the doctor's working hours on that day.
    schedule fields: available_days (list of 'Monday','Tuesday',...),
                     start_time (time), end_time (time)
    """
    try:
        day_name = check_dt.strftime("%A")  # e.g. "Monday"
        available_days = schedule.get("available_days") or []
        if day_name not in available_days:
            return False

        start_str = str(schedule.get("start_time", "09:00"))
        end_str = str(schedule.get("end_time", "18:00"))
        # start_time may come as "HH:MM:SS" or "HH:MM"
        sh, sm = int(start_str[:2]), int(start_str[3:5])
        eh, em = int(end_str[:2]), int(end_str[3:5])

        slot_start_minutes = check_dt.hour * 60 + check_dt.minute
        sched_start_minutes = sh * 60 + sm
        sched_end_minutes = eh * 60 + em

        return sched_start_minutes <= slot_start_minutes < sched_end_minutes
    except Exception as e:
        print(f"[Meeting] Schedule parse error: {e}")
        return False


def _has_appointment_conflict(supabase: Client, doctor_id: str, start_dt: datetime, duration_minutes: int = 30) -> bool:
    """Returns True if doctor already has an appointment overlapping [start_dt, start_dt+duration]."""
    try:
        end_dt = start_dt + timedelta(minutes=duration_minutes)
        window_start = (start_dt - timedelta(minutes=duration_minutes)).isoformat()
        window_end = end_dt.isoformat()

        res = supabase.table("appointments").select("id, scheduled_at, duration_minutes").eq(
            "doctor_id", doctor_id
        ).not_.in_("status", ["cancelled", "rejected"]).gte(
            "scheduled_at", window_start
        ).lte("scheduled_at", window_end).execute()

        return bool(res.data)
    except Exception as e:
        print(f"[Meeting] Conflict check error: {e}")
        return False


def get_next_available_doctor(supabase: Client, now: Optional[datetime] = None) -> Optional[dict]:
    """
    Checks all doctors with allow_scheduling=True.
    Returns the first one who is:
      a) Within their working hours right now
      b) Has no appointment conflict in the next 30 minutes

    Returns dict: {doctor_id, doctor_name, doctor_email, exotel_number}
    Returns None if all doctors are busy.
    """
    if now is None:
        now = datetime.now(IST)

    try:
        sched_res = supabase.table("doctor_schedules").select(
            "staff_id, available_days, start_time, end_time, allow_scheduling, exotel_number"
        ).eq("allow_scheduling", True).eq("is_active", True).execute()

        schedules = sched_res.data or []
        if not schedules:
            return None

        # Fetch doctor names
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

        return None  # All doctors busy

    except Exception as e:
        print(f"[Meeting] get_next_available_doctor error: {e}")
        return None


def get_next_free_slot(supabase: Client, duration_minutes: int = 30, search_from: Optional[datetime] = None) -> Optional[tuple]:
    """
    Finds the next free 30-minute slot across all schedulable doctors.
    Searches within next 7 days from search_from (defaults to now + 15 min).
    Returns: (datetime_of_slot_IST, doctor_dict) or None
    """
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

        # Start searching from search_from or 15 minutes from now
        now = datetime.now(IST)
        preferred_dt = search_from or (now + timedelta(minutes=15))
        if preferred_dt.tzinfo is None:
            preferred_dt = preferred_dt.replace(tzinfo=IST)

        best_slot = None
        best_doctor = None
        best_start = None

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
                        best_slot = slot
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
    """
    Books a doctor consultation appointment with a Jitsi Meet video link.

    preferred_now=True  → try to book immediately
    preferred_date/time → book at user's requested time

    Returns:
    {
      "booked": bool,
      "meeting_link": str | None,   # Jitsi Meet URL
      "appointment_id": str | None,
      "doctor_name": str,
      "scheduled_at_display": str,
      "scheduled_at_iso": str,
      "is_immediate": bool,
    }
    """
    now = datetime.now(IST)
    doctor = None
    scheduled_at = None
    is_immediate = False

    # ── Parse preferred date+time if given ──────────────────────────────────
    requested_dt = None
    if preferred_date or preferred_time:
        try:
            # Resolve date
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

            # Resolve time
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
                "meeting_link": None,
                "appointment_id": None,
                "doctor_name": "our medical team",
                "scheduled_at_display": "",
                "scheduled_at_iso": "",
                "is_immediate": False,
            }

    # Ensure tz-aware
    if scheduled_at.tzinfo is None:
        scheduled_at = scheduled_at.replace(tzinfo=IST)

    # ── Generate appointment ID and Jitsi link ──────────────────────────────
    appointment_id = str(uuid.uuid4())
    meeting_link = _generate_jitsi_link(appointment_id)

    # ── Resolve sales_rep_id (Sales Bot as default) ─────────────────────────
    SALES_BOT_ID = "c842f1fd-66ec-4e95-bf08-3a3f76d0f0a7"
    sales_rep_id = SALES_BOT_ID
    try:
        rep_res = supabase.table("staffs").select("id, full_name, roles:role_id(name)").eq("is_active", True).execute()
        for s in (rep_res.data or []):
            if "Sales Bot" in (s.get("full_name") or ""):
                sales_rep_id = s["id"]
                break
    except Exception as _sre:
        print(f"[Meeting] sales_rep lookup failed, using Sales Bot ID: {_sre}")

    # ── Resolve patient_id (FK → users, WhatsApp leads are in leads table) ──
    patient_id = None
    try:
        if lead_phone:
            clean_phone = lead_phone.lstrip("+")
            for phone_fmt in [clean_phone, "+" + clean_phone, lead_phone]:
                u_res = supabase.table("users").select("id").eq("phone", phone_fmt).limit(1).execute()
                if u_res.data:
                    patient_id = u_res.data[0]["id"]
                    break
    except Exception as _ue:
        print(f"[Meeting] patient_id lookup failed (non-fatal): {_ue}")

    # ── Insert appointment row ───────────────────────────────────────────────
    appt_payload = {
        "id": appointment_id,
        "doctor_id": doctor["doctor_id"],
        "sales_rep_id": sales_rep_id,
        "scheduled_at": scheduled_at.isoformat(),
        "duration_minutes": duration_minutes,
        "status": "confirmed",
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

    supabase.table("appointments").insert(appt_payload).execute()

    # ── Update lead status ───────────────────────────────────────────────────
    try:
        supabase.table("leads").update({"status": "CONSULTATION_SCHEDULED"}).eq("id", lead_id).execute()
    except Exception:
        pass

    scheduled_at_display = scheduled_at.strftime("%-d %b %Y at %-I:%M %p IST")

    return {
        "booked": True,
        "meeting_link": meeting_link,
        "appointment_id": appointment_id,
        "doctor_name": doctor["doctor_name"],
        "scheduled_at_display": scheduled_at_display,
        "scheduled_at_iso": scheduled_at.isoformat(),
        "is_immediate": is_immediate,
    }


def format_meet_confirmation_whatsapp(result: dict, lead_name: str, doctor_phone: Optional[str] = None) -> tuple:
    """
    Returns (lead_message, doctor_message) as a tuple of strings.
    lead_message  → sent to the patient on WhatsApp
    doctor_message → sent to the doctor on WhatsApp
    """
    if not result["booked"]:
        lead_msg = (
            "Hamari team se abhi koi available nahi hai 🙏\n"
            "Aapka request save kar liya hai. Hum jald hi aapko callback karenge."
        )
        return lead_msg, None

    meet_link = result.get("meeting_link")
    raw_name = result["doctor_name"]
    # Strip existing prefix to avoid "Dr. Dr. Harsh"
    doctor_display = raw_name.lstrip().removeprefix("Dr.").strip()
    time_display = result["scheduled_at_display"]
    is_immediate = result["is_immediate"]

    if is_immediate and meet_link:
        lead_msg = (
            f"✅ *Consultation Confirmed!*\n\n"
            f"Dr. {doctor_display} abhi available hain 🩺\n"
            f"📹 Jitsi Meet Link: {meet_link}\n\n"
            f"Abhi click karein — doctor join kar rahe hain!"
        )
    elif meet_link:
        lead_msg = (
            f"✅ *Consultation Confirmed!*\n\n"
            f"👨‍⚕️ Doctor: Dr. {doctor_display}\n"
            f"📅 Date & Time: {time_display}\n"
            f"📹 Video Call Link: {meet_link}\n\n"
            f"Yeh link save kar lein. Time par click karein — koi install karne ki zaroorat nahi! 🗓️"
        )
    else:
        lead_msg = (
            f"✅ *Consultation Booked!*\n\n"
            f"👨‍⚕️ Doctor: Dr. {doctor_display}\n"
            f"📅 Date & Time: {time_display}\n\n"
            f"Hamari team aapko call karegi. Kripya available rahein 📞"
        )

    doctor_msg = (
        f"🔔 *New Consultation Booked via WhatsApp*\n\n"
        f"Patient: {lead_name}\n"
        f"Time: {time_display}\n"
        + (f"📹 Jitsi Link: {meet_link}\n" if meet_link else "")
        + f"\nPlease join on time. 🙏"
    )

    return lead_msg, doctor_msg
