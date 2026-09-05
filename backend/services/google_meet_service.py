"""
google_meet_service.py
Handles Google Calendar event creation with Google Meet conferencing.

Setup (one-time):
  1. Google Cloud Console → Enable Calendar API
  2. Create Service Account → Download JSON key
  3. Set GOOGLE_SERVICE_ACCOUNT_JSON env var (full JSON string)
  4. Share each doctor's Google Calendar with the service account email
  5. Add google_calendar_id column to doctor_schedules table

The service account creates Calendar events on behalf of the doctor's calendar.
Google auto-generates a meet.google.com link for every event with conferenceData.
"""

import os
import json
import uuid
import string
import random
from datetime import datetime, timedelta
from typing import Optional
from supabase import Client
from zoneinfo import ZoneInfo

IST = ZoneInfo("Asia/Kolkata")

# ── Google Calendar client (lazy init) ───────────────────────────────────────
_calendar_service = None


def _get_calendar_service():
    """Lazy-init the Google Calendar API client using service account credentials."""
    global _calendar_service
    if _calendar_service is not None:
        return _calendar_service

    sa_json = os.getenv("GOOGLE_SERVICE_ACCOUNT_JSON")
    if not sa_json:
        return None

    try:
        from google.oauth2 import service_account
        from googleapiclient.discovery import build

        creds_dict = json.loads(sa_json)
        scopes = ["https://www.googleapis.com/auth/calendar"]
        credentials = service_account.Credentials.from_service_account_info(
            creds_dict, scopes=scopes
        )
        _calendar_service = build("calendar", "v3", credentials=credentials)
        return _calendar_service
    except Exception as e:
        print(f"[GoogleMeet] Failed to init Calendar service: {e}")
        return None


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
        print(f"[GoogleMeet] Schedule parse error: {e}")
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
        print(f"[GoogleMeet] Conflict check error: {e}")
        return False


def get_next_available_doctor(supabase: Client, now: Optional[datetime] = None) -> Optional[dict]:
    """
    Checks all doctors with allow_scheduling=True.
    Returns the first one who is:
      a) Within their working hours right now
      b) Has no appointment conflict in the next 30 minutes

    Returns dict: {doctor_id, doctor_name, doctor_email, google_calendar_id, exotel_number}
    Returns None if all doctors are busy.
    """
    if now is None:
        now = datetime.now(IST)

    try:
        sched_res = supabase.table("doctor_schedules").select(
            "staff_id, available_days, start_time, end_time, allow_scheduling, exotel_number, google_calendar_id"
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
                "google_calendar_id": sched.get("google_calendar_id"),
                "exotel_number": sched.get("exotel_number"),
            }

        return None  # All doctors busy

    except Exception as e:
        print(f"[GoogleMeet] get_next_available_doctor error: {e}")
        return None


def get_next_free_slot(supabase: Client, duration_minutes: int = 30) -> Optional[tuple]:
    """
    Finds the next free 30-minute slot across all schedulable doctors.
    Searches within next 7 days.
    Returns: (datetime_of_slot_IST, doctor_dict) or None
    """
    try:
        from services.slot_service import find_nearest_available_slot

        sched_res = supabase.table("doctor_schedules").select(
            "staff_id, allow_scheduling, google_calendar_id, exotel_number"
        ).eq("allow_scheduling", True).eq("is_active", True).execute()

        schedules = sched_res.data or []
        if not schedules:
            return None

        doctor_ids = [s["staff_id"] for s in schedules]
        staff_res = supabase.table("staffs").select("id, full_name, email").in_("id", doctor_ids).execute()
        staff_map = {s["id"]: s for s in (staff_res.data or [])}
        sched_map = {s["staff_id"]: s for s in schedules}

        # Start searching from 15 minutes from now
        now = datetime.now(IST)
        preferred_dt = now + timedelta(minutes=15)

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
                            "google_calendar_id": sched.get("google_calendar_id"),
                            "exotel_number": sched.get("exotel_number"),
                        }
                        best_slot = slot
                except Exception:
                    continue

        if best_start and best_doctor:
            return best_start, best_doctor

        return None

    except Exception as e:
        print(f"[GoogleMeet] get_next_free_slot error: {e}")
        return None


# ── Google Calendar event creation ───────────────────────────────────────────

def create_google_meet_event(
    doctor: dict,
    lead_name: str,
    lead_email: Optional[str],
    scheduled_at: datetime,
    duration_minutes: int = 30,
) -> Optional[str]:
    """
    Creates a Google Calendar event with Meet conferencing on the doctor's calendar.
    Returns the Google Meet URL (hangoutLink) or None on failure.
    """
    service = _get_calendar_service()
    if service is None:
        print("[GoogleMeet] No Calendar service available — check GOOGLE_SERVICE_ACCOUNT_JSON env var")
        return None

    calendar_id = doctor.get("google_calendar_id") or "primary"
    doctor_email = doctor.get("doctor_email")

    # Build attendees
    attendees = []
    if doctor_email:
        attendees.append({"email": doctor_email})
    if lead_email:
        attendees.append({"email": lead_email})

    start_iso = scheduled_at.isoformat()
    end_iso = (scheduled_at + timedelta(minutes=duration_minutes)).isoformat()

    event_body = {
        "summary": f"Genestac Consultation – {lead_name}",
        "description": (
            f"Free Initial Medical Consultation with {doctor.get('doctor_name', 'Doctor')} "
            f"for {lead_name}.\n\nBooked via Genestac WhatsApp AI."
        ),
        "start": {"dateTime": start_iso, "timeZone": "Asia/Kolkata"},
        "end": {"dateTime": end_iso, "timeZone": "Asia/Kolkata"},
        "attendees": attendees,
        "conferenceData": {
            "createRequest": {
                "requestId": str(uuid.uuid4()),
                "conferenceSolutionKey": {"type": "hangoutsMeet"},
            }
        },
        "reminders": {
            "useDefault": False,
            "overrides": [
                {"method": "email", "minutes": 30},
                {"method": "popup", "minutes": 10},
            ],
        },
        "guestsCanModifyEvent": False,
    }

    try:
        created_event = (
            service.events()
            .insert(
                calendarId=calendar_id,
                body=event_body,
                conferenceDataVersion=1,
                sendUpdates="all",  # sends email invites to attendees
            )
            .execute()
        )
        meet_link = created_event.get("hangoutLink")
        print(f"[GoogleMeet] Created event for {lead_name} at {start_iso}, Meet: {meet_link}")
        return meet_link
    except Exception as e:
        print(f"[GoogleMeet] Event creation failed: {e}")
        return None


# ── Full appointment booking ──────────────────────────────────────────────────

def book_google_meet_appointment(
    supabase: Client,
    lead_id: str,
    lead_name: str,
    lead_email: Optional[str] = None,
    lead_phone: Optional[str] = None,
    preferred_now: bool = True,
    duration_minutes: int = 30,
) -> dict:
    """
    Master function: checks doctor availability, creates Google Meet event,
    inserts appointment into DB, returns full result.

    preferred_now=True → try to book immediately (within next 5 minutes)
    preferred_now=False → find next available slot

    Returns:
    {
      "booked": bool,
      "meeting_link": str | None,
      "appointment_id": str | None,
      "doctor_name": str,
      "scheduled_at_display": str,   # human-readable IST
      "scheduled_at_iso": str,
      "is_immediate": bool,
      "next_available_display": str | None,  # if not booked, show next slot
    }
    """
    now = datetime.now(IST)
    doctor = None
    scheduled_at = None
    is_immediate = False

    if preferred_now:
        doctor = get_next_available_doctor(supabase, now)
        if doctor:
            scheduled_at = now + timedelta(minutes=2)  # 2 min buffer
            is_immediate = True

    if doctor is None:
        # Find next free slot
        result = get_next_free_slot(supabase, duration_minutes=duration_minutes)
        if result:
            scheduled_at, doctor = result
        else:
            # No slots at all within 7 days — create a waiting appointment
            return {
                "booked": False,
                "meeting_link": None,
                "appointment_id": None,
                "doctor_name": "our medical team",
                "scheduled_at_display": "",
                "scheduled_at_iso": "",
                "is_immediate": False,
                "next_available_display": None,
            }

    # Ensure scheduled_at is tz-aware
    if scheduled_at.tzinfo is None:
        scheduled_at = scheduled_at.replace(tzinfo=IST)

    # Create Google Meet event
    meet_link = create_google_meet_event(
        doctor=doctor,
        lead_name=lead_name,
        lead_email=lead_email,
        scheduled_at=scheduled_at,
        duration_minutes=duration_minutes,
    )

    # Insert appointment row
    appt_payload = {
        "patient_id": lead_id,
        "doctor_id": doctor["doctor_id"],
        "scheduled_at": scheduled_at.isoformat(),
        "duration_minutes": duration_minutes,
        "status": "confirmed" if meet_link else "pending",
        "type": "consultation",
        "title": f"Free Consultation – {lead_name}",
        "meeting_link": meet_link,
        "notes": (
            f"Booked via WhatsApp AI. Lead: {lead_name}"
            + (f" [PHONE: {lead_phone}]" if lead_phone else "")
        ),
    }
    appt_res = supabase.table("appointments").insert(appt_payload).execute()
    appointment_id = appt_res.data[0]["id"] if appt_res.data else None

    # Update lead status
    supabase.table("leads").update({"status": "CONSULTATION_SCHEDULED"}).eq("id", lead_id).execute()

    # Format display time
    scheduled_at_display = scheduled_at.strftime("%-d %b %Y at %-I:%M %p IST")
    scheduled_at_iso = scheduled_at.isoformat()

    return {
        "booked": True,
        "meeting_link": meet_link,
        "appointment_id": appointment_id,
        "doctor_name": doctor["doctor_name"],
        "scheduled_at_display": scheduled_at_display,
        "scheduled_at_iso": scheduled_at_iso,
        "is_immediate": is_immediate,
        "next_available_display": None,
    }


def format_meet_confirmation_whatsapp(result: dict, lead_name: str, doctor_phone: Optional[str] = None) -> tuple:
    """
    Returns (lead_message, doctor_message) as a tuple of strings.
    lead_message → sent to the lead on WhatsApp
    doctor_message → sent to the doctor on WhatsApp (via their phone number)
    """
    if not result["booked"]:
        lead_msg = (
            "Hamari team se abhi koi available nahi hai 🙏\n"
            "Aapka request save kar liya hai. Hum jald hi aapko callback karenge."
        )
        return lead_msg, None

    meet_link = result.get("meeting_link")
    doctor_name = result["doctor_name"]
    time_display = result["scheduled_at_display"]
    is_immediate = result["is_immediate"]

    if is_immediate and meet_link:
        lead_msg = (
            f"✅ *Consultation Confirmed!*\n\n"
            f"Dr. {doctor_name} abhi available hain 🩺\n"
            f"Google Meet Link: {meet_link}\n\n"
            f"Link par abhi click karein — doctor join kar rahe hain!"
        )
    elif meet_link:
        lead_msg = (
            f"✅ *Consultation Confirmed!*\n\n"
            f"Doctor: Dr. {doctor_name}\n"
            f"Date & Time: {time_display}\n"
            f"Google Meet Link: {meet_link}\n\n"
            f"Yeh link save kar lein. 10 minute pehle reminder milega 🗓️"
        )
    else:
        lead_msg = (
            f"✅ *Consultation Booked!*\n\n"
            f"Doctor: Dr. {doctor_name}\n"
            f"Date & Time: {time_display}\n\n"
            f"Hamari team aapko call karegi. Kripya available rahein 📞"
        )

    # Doctor notification message
    doctor_msg = (
        f"🔔 *New Consultation Booked via WhatsApp*\n\n"
        f"Patient: {lead_name}\n"
        f"Time: {time_display}\n"
        + (f"Meet Link: {meet_link}\n" if meet_link else "")
        + f"\nPlease join on time. 🙏"
    )

    return lead_msg, doctor_msg
