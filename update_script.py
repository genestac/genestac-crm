import re

with open("backend/services/video_meet_service.py", "r") as f:
    content = f.read()

# I will rewrite book_google_meet_appointment
new_func = """def book_google_meet_appointment(
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
"""

# Find the start of book_google_meet_appointment
start_idx = content.find("def book_google_meet_appointment(")
end_idx = content.find("def format_meet_confirmation_whatsapp(")

content = content[:start_idx] + new_func + content[end_idx:]

# Also update format_meet_confirmation_whatsapp to handle rescheduled
msg_func_start = content.find("def format_meet_confirmation_whatsapp(")
msg_func_end = content.find("    return lead_msg, doctor_msg", msg_func_start) + len("    return lead_msg, doctor_msg")

new_msg_func = """def format_meet_confirmation_whatsapp(result: dict, lead_name: str, doctor_phone: Optional[str] = None) -> tuple:
    if result.get("already_exists"):
        time_display = result.get("scheduled_at_display", "")
        status = result.get("existing_status", "pending")
        if status == "pending":
            lead_msg = (
                f"⏳ Aapki appointment request already pending hai!\\n\\n"
                f"📅 Requested Time: {time_display}\\n\\n"
                f"Doctor jald hi confirm karenge. Kya aap time change karna chahte hain?"
            )
        else:
            meet_link = result.get("meeting_link", "")
            lead_msg = (
                f"✅ Aapki appointment already confirmed hai!\\n\\n"
                f"📅 Date & Time: {time_display}\\n"
                + (f"📹 Video Link: {meet_link}\\n" if meet_link else "")
                + f"\\nKya aap kuch aur jaanna chahte hain?"
            )
        return lead_msg, None

    if not result["booked"]:
        lead_msg = (
            "Hamari team se abhi koi available nahi hai 🙏\\n"
            "Aapka request save kar liya hai. Hum jald hi aapko callback karenge."
        )
        return lead_msg, None

    raw_name = result["doctor_name"]
    doctor_display = raw_name.lstrip().removeprefix("Dr.").strip()
    time_display = result["scheduled_at_display"]
    
    if result.get("rescheduled"):
        lead_msg = (
            f"🔄 *Appointment Rescheduled!*\\n\\n"
            f"👨‍⚕️ Doctor: Dr. {doctor_display}\\n"
            f"📅 New Requested Time: {time_display}\\n\\n"
            f"✅ Dr. {doctor_display} se confirm hone par aapko Jitsi Meet link bheja jayega.\\n"
            f"Approval mein thoda samay lagega — please wait karein! 🙏"
        )
        doctor_msg = (
            f"🔔 *Rescheduled Consultation Request (Pending Approval)*\\n\\n"
            f"Patient: {lead_name}\\n"
            f"New Requested Time: {time_display}\\n"
            f"📹 Jitsi Link (share on approval): {result.get('meeting_link', '')}\\n\\n"
            f"Please approve or suggest alternate time in the dashboard. 🙏"
        )
    else:
        lead_msg = (
            f"📋 *Consultation Request Received!*\\n\\n"
            f"👨‍⚕️ Doctor: Dr. {doctor_display}\\n"
            f"📅 Requested Time: {time_display}\\n\\n"
            f"✅ Dr. {doctor_display} se confirm hone par aapko Jitsi Meet link bheja jayega.\\n"
            f"Approval mein thoda samay lagega — please wait karein! 🙏"
        )
        doctor_msg = (
            f"🔔 *New Consultation Request (Pending Approval)*\\n\\n"
            f"Patient: {lead_name}\\n"
            f"Requested Time: {time_display}\\n"
            f"📹 Jitsi Link (share on approval): {result.get('meeting_link', '')}\\n\\n"
            f"Please approve or suggest alternate time in the dashboard. 🙏"
        )

    return lead_msg, doctor_msg"""

content = content[:msg_func_start] + new_msg_func + content[msg_func_end:]

with open("backend/services/video_meet_service.py", "w") as f:
    f.write(content)

