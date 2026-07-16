import os
import datetime
import httpx
import httpcore
from apscheduler.schedulers.background import BackgroundScheduler
from db.supabase import get_supabase_client
from supabase import Client
from services.exotel_service import initiate_ai_call, bridge_doctor_and_customer

# Network errors that indicate a transient DNS / connectivity issue in Docker.
# We silence these to a single warning line instead of a full traceback.
_NETWORK_ERRORS = (httpx.ConnectError, httpcore.ConnectError, httpx.TimeoutException, ConnectionError)

scheduler = BackgroundScheduler()

def is_within_calling_window(windows):
    """
    Check if the current time is within the allowed AI calling windows.
    windows: [{"start": "09:00", "end": "18:00", "days": ["Monday", "Tuesday", ...]}]
    """
    now = datetime.datetime.now()
    current_time_str = now.strftime("%H:%M")
    current_day = now.strftime("%A")

    if not windows:
        return True  # Default to true if no restrictions

    for window in windows:
        if current_day in window.get("days", []):
            start = window.get("start", "00:00")
            end = window.get("end", "23:59")
            if start <= current_time_str <= end:
                return True
    return False


def _trigger_callback_call(supabase: Client, lead_id: str, phone: str, exotel_number: str):
    """Helper: fire an AI callback for a lead and clear the ai_callback_time field."""
    print(f"[AI Voice Scheduler] Triggering scheduled callback for lead {lead_id} ({phone})")
    # Clear the callback time immediately to prevent duplicate calls
    supabase.table("leads").update({"ai_callback_time": None}).eq("id", lead_id).execute()
    supabase.table("users").update({"ai_callback_time": None}).eq("id", lead_id).execute()

    log_res = supabase.table("ai_call_logs").insert({
        "lead_id": lead_id,
        "status": "initiating"
    }).execute()
    call_log_id = log_res.data[0]["id"] if log_res.data else None

    exotel_res = initiate_ai_call(from_number=exotel_number, to_number=phone, lead_id=lead_id)
    if exotel_res and "Call" in exotel_res:
        call_sid = exotel_res["Call"].get("Sid")
        if call_log_id:
            supabase.table("ai_call_logs").update({"call_sid": call_sid, "status": "ringing"}).eq("id", call_log_id).execute()
        print(f"[AI Voice Scheduler] ✅ Callback initiated for lead {lead_id}")
    else:
        if call_log_id:
            supabase.table("ai_call_logs").update({"status": "failed_to_initiate"}).eq("id", call_log_id).execute()
        print(f"[AI Voice Scheduler] ❌ Callback failed for lead {lead_id}")


def sweep_leads_for_auto_call():
    try:
        supabase: Client = get_supabase_client()

        # 1. Fetch settings
        res = supabase.table("global_settings").select("settings_value").eq("settings_key", "ai_call_settings").execute()
        if not res.data:
            return

        settings = res.data[0]["settings_value"]
        enabled_statuses = settings.get("enabled_statuses", [])
        windows = settings.get("allowed_time_windows", [])
        exotel_number = settings.get("exotel_number")

        if not exotel_number:
            print("[AI Voice Scheduler] No exotel_number configured. Skipping sweep.")
            return

        now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()

        # ─── PRIORITY QUEUE: Fire explicitly scheduled AI callbacks that are due ───
        # Check both the leads table (phone_number) and users table (phone)
        callback_leads_from_leads = supabase.table("leads").select("id, phone_number").lte("ai_callback_time", now_iso).not_.is_("ai_callback_time", "null").execute().data or []
        callback_leads_from_users = supabase.table("users").select("id, phone").lte("ai_callback_time", now_iso).not_.is_("ai_callback_time", "null").execute().data or []

        already_fired = set()

        for lead in callback_leads_from_leads:
            phone = lead.get("phone_number")
            if phone and lead["id"] not in already_fired:
                already_fired.add(lead["id"])
                _trigger_callback_call(supabase, lead["id"], phone, exotel_number)

        for lead in callback_leads_from_users:
            phone = lead.get("phone")
            if phone and lead["id"] not in already_fired:
                already_fired.add(lead["id"])
                _trigger_callback_call(supabase, lead["id"], phone, exotel_number)

        # ─── NORMAL QUEUE: Sweep enabled-status leads inside the calling window ───
        if not enabled_statuses:
            return

        if not is_within_calling_window(windows):
            print("[AI Voice Scheduler] Outside calling window. Skipping normal sweep.")
            return

        # Fetch from leads table (phone_number column)
        leads_from_leads = supabase.table("leads").select("id, phone_number").in_("status", enabled_statuses).is_("ai_callback_time", "null").execute().data or []
        # Fetch from users table (phone column)
        leads_from_users = supabase.table("users").select("id, phone").in_("status", enabled_statuses).is_("ai_callback_time", "null").execute().data or []

        all_leads = [
            {"id": l["id"], "phone": l.get("phone_number")} for l in leads_from_leads if l.get("phone_number")
        ] + [
            {"id": l["id"], "phone": l.get("phone")} for l in leads_from_users if l.get("phone") and l["id"] not in {x["id"] for x in leads_from_leads}
        ]

        # Fetch current queue
        import uuid
        q_res = supabase.table("global_settings").select("settings_value").eq("settings_key", "ai_call_queue").execute()
        queue = q_res.data[0]["settings_value"] if q_res.data else []
        queued_lead_ids = {item["lead_id"] for item in queue if "lead_id" in item}

        new_items = []
        for lead in all_leads:
            lead_id = lead["id"]
            phone = lead["phone"]
            if not phone or lead_id in queued_lead_ids:
                continue

            # Skip if max 3 lifetime calls already made
            total_logs = supabase.table("ai_call_logs").select("id").eq("lead_id", lead_id).execute()
            if len(total_logs.data) >= 3:
                print(f"[AI Voice Scheduler] Skipping lead {lead_id} — max 3 calls reached.")
                continue

            # Only 1 call per lead per day
            today = datetime.datetime.now().date().isoformat()
            today_logs = supabase.table("ai_call_logs").select("id").eq("lead_id", lead_id).gte("created_at", today).execute()
            if len(today_logs.data) > 0:
                continue

            new_items.append({
                "id": str(uuid.uuid4()),
                "lead_id": lead_id,
                "status": "pending",
                "created_at": datetime.datetime.now().isoformat()
            })
            queued_lead_ids.add(lead_id)

        # Add new items to queue and save
        if new_items:
            print(f"[AI Voice Scheduler] Adding {len(new_items)} leads to the call queue.")
            queue.extend(new_items)
            supabase.table("global_settings").upsert({"settings_key": "ai_call_queue", "settings_value": queue}, on_conflict="settings_key").execute()

        # Process the first item in the queue (if any)
        if queue:
            next_call = queue.pop(0)
            lead_id = next_call["lead_id"]
            
            # Fetch phone number
            lead_res = supabase.table("leads").select("phone_number").eq("id", lead_id).execute()
            if lead_res.data and lead_res.data[0].get("phone_number"):
                phone = lead_res.data[0]["phone_number"]
            else:
                user_res = supabase.table("users").select("phone").eq("id", lead_id).execute()
                phone = user_res.data[0].get("phone") if user_res.data else None

            if phone:
                print(f"[AI Voice Scheduler] Popped queue, triggering call for lead {lead_id} ({phone})")
                log_res = supabase.table("ai_call_logs").insert({
                    "lead_id": lead_id,
                    "status": "initiating"
                }).execute()
                call_log_id = log_res.data[0]["id"] if log_res.data else None

                exotel_res = initiate_ai_call(from_number=exotel_number, to_number=phone, lead_id=lead_id)

                if exotel_res and "Call" in exotel_res:
                    call_sid = exotel_res["Call"].get("Sid")
                    if call_log_id:
                        supabase.table("ai_call_logs").update({"call_sid": call_sid, "status": "ringing"}).eq("id", call_log_id).execute()
                else:
                    if call_log_id:
                        supabase.table("ai_call_logs").update({"status": "failed_to_initiate"}).eq("id", call_log_id).execute()
            
            # Save the queue with the item removed
            supabase.table("global_settings").upsert({"settings_key": "ai_call_queue", "settings_value": queue}, on_conflict="settings_key").execute()

    except _NETWORK_ERRORS as e:
        print(f"[AI Voice Scheduler] ⚠️  Network unavailable (DNS?), skipping sweep: {type(e).__name__}")
    except Exception as e:
        import traceback
        print(f"[AI Voice Scheduler Error]: {e}")
        traceback.print_exc()


def sweep_scheduled_appointments():
    """
    Runs every minute. Finds confirmed/pending appointments whose scheduled_at
    time has arrived (within a 2-minute window) and triggers an Exotel bridge
    call between the doctor and the patient.

    Flow:
      1. Query appointments where scheduled_at is between now-1min and now+1min
         and status is 'confirmed' or 'pending' and exotel_call_triggered is not set
      2. For each: fetch doctor exotel_number and patient phone
      3. Call bridge_doctor_and_customer()
      4. Mark appointment status as 'completed' (or update a triggered flag)
    """
    try:
        supabase: Client = get_supabase_client()
        import pytz
        ist = pytz.timezone("Asia/Kolkata")
        now = datetime.datetime.now(ist)

        # Window: appointments scheduled within the past 1 min to next 1 min
        window_start = (now - datetime.timedelta(minutes=1)).isoformat()
        window_end   = (now + datetime.timedelta(minutes=1)).isoformat()

        # appointments.doctor_id → staffs.id (NOT doctor_schedules)
        # So we query without the doctor_schedules join, then look up exotel_number separately.
        res = supabase.table("appointments") \
            .select("id, doctor_id, patient_id, scheduled_at, status, notes, "
                    "patients:users!patient_id(phone, name)") \
            .in_("status", ["pending", "confirmed"]) \
            .gte("scheduled_at", window_start) \
            .lte("scheduled_at", window_end) \
            .execute()

        appts = res.data or []
        if not appts:
            return

        print(f"[Appointment Scheduler] Found {len(appts)} appointment(s) due now.")

        # Pre-fetch all doctor exotel numbers from doctor_schedules (staff_id = doctor_id)
        all_doctor_ids = list({a["doctor_id"] for a in appts})
        doc_res = supabase.table("doctor_schedules") \
            .select("staff_id, exotel_number") \
            .in_("staff_id", all_doctor_ids) \
            .execute()
        doctor_exotel_map = {
            d["staff_id"]: d["exotel_number"]
            for d in (doc_res.data or [])
            if d.get("exotel_number")
        }

        for appt in appts:
            appt_id = appt["id"]

            # Skip if we already triggered this appointment (check notes for marker)
            if appt.get("notes") and "[CALL_TRIGGERED]" in appt["notes"]:
                print(f"[Appointment Scheduler] Skipping {appt_id} — already triggered.")
                continue

            # Get patient phone
            patient_info = appt.get("patients") or {}
            patient_phone = patient_info.get("phone", "")
            patient_name  = patient_info.get("name", "Patient")

            if not patient_phone and appt.get("notes") and "[PHONE:" in appt["notes"]:
                import re
                m = re.search(r"\[PHONE:\s*([^\]]+)\]", appt["notes"])
                if m:
                    patient_phone = m.group(1).strip()

            # Get doctor exotel_number from pre-fetched map
            doctor_exotel_number = doctor_exotel_map.get(appt["doctor_id"], "")

            if not patient_phone or not doctor_exotel_number:
                print(
                    f"[Appointment Scheduler] ⚠️  Appointment {appt_id}: "
                    f"missing phone (patient={patient_phone!r}, "
                    f"doctor_exotel={doctor_exotel_number!r}). Skipping."
                )
                continue

            # Normalise patient phone (add country code if needed)
            if not patient_phone.startswith("+"):
                patient_phone = "+91" + patient_phone.lstrip("0")

            print(
                f"[Appointment Scheduler] 📞 Bridging appointment {appt_id}: "
                f"Doctor {doctor_exotel_number} ⇔ Patient {patient_phone} ({patient_name})"
            )

            # Mark as triggered immediately so a re-run doesn't double-fire
            existing_notes = appt.get("notes") or ""
            supabase.table("appointments").update({
                "notes": existing_notes + "\n[CALL_TRIGGERED]"
            }).eq("id", appt_id).execute()

            # Bridge doctor → patient via Exotel connect.json
            success = bridge_doctor_and_customer(
                doctor_phone=doctor_exotel_number,
                customer_phone=patient_phone,
            )

            if success:
                print(f"[Appointment Scheduler] ✅ Bridge call initiated for appointment {appt_id}")
                # Notify doctor via system notification
                try:
                    supabase.table("system_notifications").insert({
                        "target_role": "doctor",
                        "target_id": appt["doctor_id"],
                        "notification_type": "in_app",
                        "title": "Appointment Call Started",
                        "message": f"Exotel bridge call with {patient_name} has been initiated. Please answer."
                    }).execute()
                except Exception:
                    pass
            else:
                print(f"[Appointment Scheduler] ❌ Bridge call FAILED for appointment {appt_id}")
                # Revert the trigger marker so it can retry
                supabase.table("appointments").update({
                    "notes": existing_notes  # remove the marker
                }).eq("id", appt_id).execute()

    except _NETWORK_ERRORS as e:
        print(f"[Appointment Scheduler] ⚠️  Network unavailable (DNS?), skipping sweep: {type(e).__name__}")
    except Exception as e:
        import traceback
        print(f"[Appointment Scheduler Error]: {e}")
        traceback.print_exc()

def sweep_whatsapp_campaigns():
    """
    Checks for pending WhatsApp campaigns where scheduled_time <= NOW().
    Runs the campaign and updates log statuses.
    """
    try:
        supabase = get_supabase_client()
        now = datetime.datetime.now(datetime.timezone.utc).isoformat()
        
        # Get pending campaigns whose scheduled_time has passed
        res = supabase.table("whatsapp_campaigns").select("id, template_id, whatsapp_templates(name, language, default_components)").eq("status", "PENDING").lte("scheduled_time", now).execute()
        
        campaigns = res.data or []
        if not campaigns:
            return
            
        import asyncio
        from services.whatsapp_service import send_whatsapp_template
        
        for campaign in campaigns:
            campaign_id = campaign['id']
            whatsapp_template = campaign.get('whatsapp_templates')
            template_name = whatsapp_template['name'] if whatsapp_template else None
            language_code = whatsapp_template.get('language') or 'en_US' if whatsapp_template else 'en_US'
            components = whatsapp_template.get('default_components') if whatsapp_template else None
            
            if not template_name:
                supabase.table("whatsapp_campaigns").update({"status": "FAILED"}).eq("id", campaign_id).execute()
                continue
                
            # Mark campaign as running
            supabase.table("whatsapp_campaigns").update({"status": "RUNNING"}).eq("id", campaign_id).execute()
            
            # Fetch pending logs
            logs_res = supabase.table("whatsapp_logs").select("id, phone_number").eq("campaign_id", campaign_id).eq("status", "PENDING").execute()
            logs = logs_res.data or []
            
            async def process_logs():
                for log in logs:
                    phone = log.get('phone_number')
                    if not phone:
                        supabase.table("whatsapp_logs").update({"status": "FAILED", "error_msg": "No phone number"}).eq("id", log['id']).execute()
                        continue
                        
                    # Send message
                    res_json = await send_whatsapp_template(phone, template_name, language_code=language_code, components=components)
                    
                    if res_json and "error" not in res_json:
                        supabase.table("whatsapp_logs").update({"status": "SENT"}).eq("id", log['id']).execute()
                    else:
                        err = str(res_json.get("error", "Unknown error")) if res_json else "Empty response"
                        supabase.table("whatsapp_logs").update({"status": "FAILED", "error_msg": err}).eq("id", log['id']).execute()
            
            # Run async execution
            asyncio.run(process_logs())
            
            # Mark campaign completed
            supabase.table("whatsapp_campaigns").update({"status": "COMPLETED"}).eq("id", campaign_id).execute()
            print(f"[WhatsApp Scheduler] ✅ Completed campaign {campaign_id}")
            
    except _NETWORK_ERRORS as e:
        print(f"[WhatsApp Scheduler] ⚠️  Network unavailable (DNS?), skipping sweep: {type(e).__name__}")
    except Exception as e:
        import traceback
        print(f"[WhatsApp Scheduler Error]: {e}")
        traceback.print_exc()



def start_scheduler():
    if not scheduler.running:
        # Sweep for auto-calls and pending callbacks every 5 minutes
        scheduler.add_job(sweep_leads_for_auto_call, 'interval', minutes=1, id="ai_voice_sweep", replace_existing=True)
        # Sweep for scheduled appointments every 1 minute and trigger Exotel bridge calls
        scheduler.add_job(sweep_scheduled_appointments, 'interval', minutes=1, id="appointment_call_sweep", replace_existing=True)
        # Sweep for WhatsApp Campaigns every 1 minute
        scheduler.add_job(sweep_whatsapp_campaigns, 'interval', minutes=1, id="whatsapp_campaign_sweep", replace_existing=True)
        scheduler.start()
        print("Started Background Scheduler for AI Voice Calling and WhatsApp.")

