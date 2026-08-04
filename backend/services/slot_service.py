"""
services/slot_service.py
========================
Core slot engine for appointment booking.

Responsibilities:
  - Generate available time slots for a doctor on a given date
  - Conflict detection (two patients can't occupy the same doctor at the same time)
  - Find the nearest free slot to a requested datetime (used by AI voice agent)
  - Slot-stretch conflict check (doctor extends a running appointment)
"""

from __future__ import annotations

import logging
from datetime import date, datetime, timedelta
from typing import Optional
from zoneinfo import ZoneInfo

from supabase import Client

logger = logging.getLogger(__name__)

IST = ZoneInfo("Asia/Kolkata")

# ---------------------------------------------------------------------------
# Data model helpers
# ---------------------------------------------------------------------------

def _parse_time(t: str) -> tuple[int, int]:
    """Parse 'HH:MM' or 'HH:MM:SS' into (hour, minute)."""
    parts = t.split(":")
    return int(parts[0]), int(parts[1])


def _make_aware(dt: datetime) -> datetime:
    """Ensure datetime is timezone-aware (IST)."""
    if dt.tzinfo is None:
        return dt.replace(tzinfo=IST)
    return dt.astimezone(IST)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def get_doctor_schedule(doctor_id: str, supabase: Client) -> dict:
    """
    Return the doctor_schedules row for a doctor, or sensible defaults.
    """
    try:
        res = (
            supabase.table("doctor_schedules")
            .select("*")
            .eq("staff_id", doctor_id)
            .single()
            .execute()
        )
        return res.data or {}
    except Exception:
        return {}


def get_booked_intervals(
    doctor_id: str,
    target_date: date,
    supabase: Client,
    exclude_appointment_id: Optional[str] = None,
) -> list[dict]:
    """
    Return all booked (start, end) intervals for a doctor on a given date.
    Excludes cancelled/rejected appointments and (optionally) a specific
    appointment being updated.
    """
    try:
        # Query appointments that overlap the target date in IST
        day_start_utc = datetime(
            target_date.year, target_date.month, target_date.day,
            0, 0, 0, tzinfo=IST
        ).isoformat()
        day_end_utc = datetime(
            target_date.year, target_date.month, target_date.day,
            23, 59, 59, tzinfo=IST
        ).isoformat()

        query = (
            supabase.table("appointments")
            .select("id, scheduled_at, duration_minutes, status, patient_id, users!patient_id(name)")
            .eq("doctor_id", doctor_id)
            .not_.in_("status", ["cancelled", "rejected"])
            .gte("scheduled_at", day_start_utc)
            .lte("scheduled_at", day_end_utc)
            .order("scheduled_at", desc=False)
        )
        res = query.execute()
        intervals = []
        for appt in (res.data or []):
            if exclude_appointment_id and appt["id"] == exclude_appointment_id:
                continue
            start = _make_aware(datetime.fromisoformat(appt["scheduled_at"]))
            duration = appt.get("duration_minutes") or 10
            end = start + timedelta(minutes=duration)
            intervals.append({
                "appointment_id": appt["id"],
                "start": start,
                "end": end,
                "status": appt["status"],
                "patient_name": (appt.get("users") or {}).get("name", "Unknown"),
            })
        return intervals
    except Exception as e:
        logger.error(f"[SlotService] get_booked_intervals error: {e}")
        return []


def check_conflict(
    doctor_id: str,
    scheduled_at: datetime,
    duration_minutes: int,
    supabase: Client,
    exclude_appointment_id: Optional[str] = None,
) -> Optional[dict]:
    """
    Check whether a new/updated appointment conflicts with an existing one.

    Returns:
      None            — no conflict, slot is free
      dict            — conflict details {appointment_id, start, end, patient_name}

    Algorithm:
      Conflict exists when the new interval [T, T+D) overlaps any booked interval [S, S+Ds):
        new_start < existing_end  AND  new_end > existing_start
    """
    new_start = _make_aware(scheduled_at)
    new_end = new_start + timedelta(minutes=duration_minutes)

    target_date = new_start.date()
    intervals = get_booked_intervals(
        doctor_id, target_date, supabase, exclude_appointment_id
    )

    for interval in intervals:
        if new_start < interval["end"] and new_end > interval["start"]:
            return interval  # Conflict found — return offending appointment

    return None  # Free!


def get_available_slots(
    doctor_id: str,
    target_date: date,
    supabase: Client,
) -> list[dict]:
    """
    Generate all available time slots for a doctor on a given date.

    Returns a list of dicts:
      {
        "start": ISO string,
        "end": ISO string,
        "start_display": "10:00 AM",
        "end_display": "10:30 AM",
        "duration_minutes": 30,
        "available": True
      }
    """
    schedule = get_doctor_schedule(doctor_id, supabase)

    if not schedule or not schedule.get("allow_scheduling", True):
        return []

    # Check if the target date is in the doctor's working days
    day_name = target_date.strftime("%A")  # e.g. "Monday"
    available_days = schedule.get("available_days") or []
    if available_days and day_name not in available_days:
        return []  # Doctor doesn't work on this day

    # Parse working hours
    start_str = schedule.get("start_time", "09:00:00")
    end_str = schedule.get("end_time", "17:00:00")
    slot_duration = schedule.get("slot_duration_minutes") or 10
    buffer = schedule.get("buffer_minutes") or 0
    step = slot_duration + buffer  # Time between slot starts

    start_h, start_m = _parse_time(start_str)
    end_h, end_m = _parse_time(end_str)

    work_start = _make_aware(
        datetime(target_date.year, target_date.month, target_date.day, start_h, start_m, 0)
    )
    work_end = _make_aware(
        datetime(target_date.year, target_date.month, target_date.day, end_h, end_m, 0)
    )

    # Fetch all booked intervals for this day
    booked = get_booked_intervals(doctor_id, target_date, supabase)

    # Generate slots
    slots = []
    current = work_start
    while current + timedelta(minutes=slot_duration) <= work_end:
        slot_start = current
        slot_end = current + timedelta(minutes=slot_duration)

        # Check if this theoretical slot is free
        is_free = True
        conflicting_appt = None
        for interval in booked:
            # Overlap check: slot_start < interval_end AND slot_end > interval_start
            if slot_start < interval["end"] and slot_end > interval["start"]:
                is_free = False
                conflicting_appt = interval
                break

        slots.append({
            "start": slot_start.isoformat(),
            "end": slot_end.isoformat(),
            "start_display": slot_start.strftime("%I:%M %p"),
            "end_display": slot_end.strftime("%I:%M %p"),
            "duration_minutes": slot_duration,
            "available": is_free,
            "booked_by": conflicting_appt.get("patient_name") if conflicting_appt else None,
            "appointment_id": conflicting_appt.get("appointment_id") if conflicting_appt else None,
        })

        current += timedelta(minutes=step)

    return slots


def find_nearest_available_slot(
    doctor_id: str,
    preferred_dt: datetime,
    duration_minutes: int,
    supabase: Client,
    search_days: int = 7,
) -> Optional[dict]:
    """
    Find the nearest free slot to the requested datetime for a doctor.

    Strategy:
    1. On the requested day, snap the preferred time to the nearest slot boundary
       (e.g. 3:45 → checks 3:40 and 3:50, picks the closer free one).
    2. If nothing fits today, search forward up to `search_days` days.

    Returns a slot dict {start, end, start_display, end_display, duration_minutes, snapped}
    or None if nothing found in the search window.
    """
    preferred_dt = _make_aware(preferred_dt)
    target_date = preferred_dt.date()

    for day_offset in range(search_days):
        search_date = target_date + timedelta(days=day_offset)
        slots = get_available_slots(doctor_id, search_date, supabase)
        free_slots = [s for s in slots if s["available"]]

        if not free_slots:
            continue

        target_dt_for_day = datetime(
            search_date.year, search_date.month, search_date.day,
            preferred_dt.hour, preferred_dt.minute, preferred_dt.second,
            tzinfo=IST
        )

        def _dist(s: dict) -> float:
            return abs(
                (datetime.fromisoformat(s["start"]) - target_dt_for_day).total_seconds()
            )

        # On the same day, prioritize slots that haven't already passed if target_date is today
        now_ist = datetime.now(IST)
        valid_slots = free_slots
        if search_date == now_ist.date():
            # Filter out slots in the past with a 5-min buffer
            upcoming = [s for s in free_slots if datetime.fromisoformat(s["start"]) >= now_ist - timedelta(minutes=5)]
            if upcoming:
                valid_slots = upcoming

        best = min(valid_slots, key=_dist)
        if best:
            return best

    return None  # No free slot found in the search window


def check_extend_conflict(
    appointment_id: str,
    doctor_id: str,
    scheduled_at: datetime,
    new_duration_minutes: int,
    supabase: Client,
) -> Optional[dict]:
    """
    Check if extending an appointment's duration conflicts with the next booking.
    Excludes the appointment being stretched from the conflict check.
    """
    return check_conflict(
        doctor_id=doctor_id,
        scheduled_at=scheduled_at,
        duration_minutes=new_duration_minutes,
        supabase=supabase,
        exclude_appointment_id=appointment_id,
    )
