import os
import logging
import datetime
import httpx
import httpcore
from apscheduler.schedulers.background import BackgroundScheduler
from db.supabase import get_supabase_client
from supabase import Client
from services.exotel_service import initiate_ai_call, bridge_doctor_and_customer

logger = logging.getLogger(__name__)

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


def _trigger_callback_call(supabase: Client, lead_id: str, phone: str, exotel_number: str, lead_name: str = "Lead"):
    """Helper: fire an AI callback for a lead and clear the ai_callback_time field."""
    print(f"[AI Voice Scheduler] Triggering scheduled callback for lead {lead_id} ({phone})")
    # Clear the callback time immediately to prevent duplicate calls
    supabase.table("leads").update({"ai_callback_time": None}).eq("id", lead_id).execute()
    supabase.table("users").update({"ai_callback_time": None}).eq("id", lead_id).execute()

    # Notify the team
    try:
        from services.notification_service import notify_callback_due
        notify_callback_due(supabase, lead_name, lead_id)
    except Exception as ne:
        print(f"[AI Voice Scheduler] Notification error: {ne}")

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

        # Hard-stop: both providers exhausted — don't attempt any calls until re-enabled
        if settings.get("ai_calling_disabled"):
            print("[AI Voice Scheduler] AI calling is DISABLED (both providers failed). Skipping sweep.")
            return

        enabled_statuses = settings.get("enabled_statuses", [])
        windows = settings.get("allowed_time_windows", [])
        exotel_number = settings.get("exotel_number")

        if not exotel_number:
            print("[AI Voice Scheduler] No exotel_number configured. Skipping sweep.")
            return

        now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()

        # ─── PRIORITY QUEUE: Fire explicitly scheduled AI callbacks that are due ───
        # Check both the leads table (phone_number) and users table (phone)
        callback_leads_from_leads = supabase.table("leads").select("id, name, phone_number").lte("ai_callback_time", now_iso).not_.is_("ai_callback_time", "null").execute().data or []
        callback_leads_from_users = supabase.table("users").select("id, name, phone").lte("ai_callback_time", now_iso).not_.is_("ai_callback_time", "null").execute().data or []

        already_fired = set()

        for lead in callback_leads_from_leads:
            phone = lead.get("phone_number")
            if phone and lead["id"] not in already_fired:
                already_fired.add(lead["id"])
                _trigger_callback_call(supabase, lead["id"], phone, exotel_number, lead.get("name") or "Lead")

        for lead in callback_leads_from_users:
            phone = lead.get("phone")
            if phone and lead["id"] not in already_fired:
                already_fired.add(lead["id"])
                _trigger_callback_call(supabase, lead["id"], phone, exotel_number, lead.get("name") or "Lead")

        # ─── NORMAL QUEUE: Sweep enabled-status leads inside the calling window ───
        if not enabled_statuses:
            return

        if not is_within_calling_window(windows):
            print("[AI Voice Scheduler] Outside calling window. Skipping normal sweep.")
            return

        # Read optional filter settings
        filter_created_from = settings.get("filter_created_from")      # e.g. "2026-07-01"
        filter_created_to   = settings.get("filter_created_to")        # e.g. "2026-07-31"
        filter_sources_raw  = settings.get("filter_sources", "")       # e.g. "facebook,instagram"
        filter_sources      = [s.strip().lower() for s in filter_sources_raw.split(",") if s.strip()] if filter_sources_raw else []
        max_calls_per_lead  = int(settings.get("max_calls_per_lead") or 3)
        skip_not_interested = settings.get("skip_not_interested", True)
        skip_consultation   = settings.get("skip_consultation_scheduled", True)

        # Build the base query for leads table
        leads_query = supabase.table("leads").select("id, phone_number, status, source, created_at").in_("status", enabled_statuses).is_("ai_callback_time", "null")
        if filter_created_from:
            leads_query = leads_query.gte("created_at", filter_created_from)
        if filter_created_to:
            leads_query = leads_query.lte("created_at", filter_created_to + "T23:59:59")
        if skip_not_interested:
            leads_query = leads_query.neq("status", "NOT_INTERESTED")
        if skip_consultation:
            leads_query = leads_query.neq("status", "CONSULTATION_SCHEDULED")

        leads_from_leads = leads_query.execute().data or []

        # Build the base query for users table
        users_query = supabase.table("users").select("id, phone, status, source, created_at").in_("status", enabled_statuses).is_("ai_callback_time", "null")
        if filter_created_from:
            users_query = users_query.gte("created_at", filter_created_from)
        if filter_created_to:
            users_query = users_query.lte("created_at", filter_created_to + "T23:59:59")
        if skip_not_interested:
            users_query = users_query.neq("status", "NOT_INTERESTED")
        if skip_consultation:
            users_query = users_query.neq("status", "CONSULTATION_SCHEDULED")

        leads_from_users = users_query.execute().data or []

        all_leads = [
            {"id": l["id"], "phone": l.get("phone_number"), "source": l.get("source", "")} for l in leads_from_leads if l.get("phone_number")
        ] + [
            {"id": l["id"], "phone": l.get("phone"), "source": l.get("source", "")} for l in leads_from_users if l.get("phone") and l["id"] not in {x["id"] for x in leads_from_leads}
        ]

        # Fetch current queue
        import uuid
        q_res = supabase.table("global_settings").select("settings_value").eq("settings_key", "ai_call_queue").execute()
        queue = q_res.data[0]["settings_value"] if q_res.data else []
        # Only block re-queuing for leads that are still pending (not already called)
        queued_lead_ids = {item["lead_id"] for item in queue if "lead_id" in item and item.get("status") == "pending"}

        # ── Batch-fetch call counts for all candidate leads (single DB query) ──
        all_lead_ids = [l["id"] for l in all_leads]
        today = datetime.datetime.now().date().isoformat()
        skipped_max = 0
        skipped_today = 0
        skipped_source = 0

        if all_lead_ids:
            logs_res = supabase.table("ai_call_logs").select("lead_id, created_at").in_("lead_id", all_lead_ids).execute()
            all_logs = logs_res.data or []
            # Total call count per lead
            total_call_counts = {}
            today_call_counts = {}
            for log in all_logs:
                lid = log["lead_id"]
                total_call_counts[lid] = total_call_counts.get(lid, 0) + 1
                if (log.get("created_at") or "")[:10] == today:
                    today_call_counts[lid] = today_call_counts.get(lid, 0) + 1
        else:
            total_call_counts = {}
            today_call_counts = {}

        new_items = []
        for lead in all_leads:
            lead_id = lead["id"]
            phone = lead["phone"]
            if not phone or lead_id in queued_lead_ids:
                continue

            # Apply lead source filter
            if filter_sources:
                lead_source = (lead.get("source") or "").lower()
                if not any(fs in lead_source for fs in filter_sources):
                    skipped_source += 1
                    logger.debug(f"[AI Voice Scheduler] Skipping lead {lead_id} — source '{lead_source}' not in filter.")
                    continue

            # Skip if max lifetime calls already reached
            if total_call_counts.get(lead_id, 0) >= max_calls_per_lead:
                skipped_max += 1
                logger.debug(f"[AI Voice Scheduler] Skipping lead {lead_id} — max {max_calls_per_lead} calls reached.")
                continue

            # Only 1 call per lead per day
            if today_call_counts.get(lead_id, 0) > 0:
                skipped_today += 1
                continue

            new_items.append({
                "id": str(uuid.uuid4()),
                "lead_id": lead_id,
                "status": "pending",
                "created_at": datetime.datetime.now().isoformat()
            })
            queued_lead_ids.add(lead_id)

        if skipped_max or skipped_today or skipped_source:
            logger.info(f"[AI Voice Scheduler] Sweep summary — skipped: {skipped_max} (max calls), {skipped_today} (already called today), {skipped_source} (source filter). Queuing {len(new_items)} new leads.")

        # Add new items to queue and save
        if new_items:
            print(f"[AI Voice Scheduler] Adding {len(new_items)} leads to the call queue.")
            queue.extend(new_items)
            supabase.table("global_settings").upsert({"settings_key": "ai_call_queue", "settings_value": queue}, on_conflict="settings_key").execute()

        # Find and process the first PENDING item only
        pending_idx = next((i for i, item in enumerate(queue) if item.get("status") == "pending"), -1)
        if pending_idx >= 0:
            next_call = queue[pending_idx]
            lead_id = next_call["lead_id"]
            
            # Fetch phone number
            lead_res = supabase.table("leads").select("phone_number").eq("id", lead_id).execute()
            if lead_res.data and lead_res.data[0].get("phone_number"):
                phone = lead_res.data[0]["phone_number"]
            else:
                user_res = supabase.table("users").select("phone").eq("id", lead_id).execute()
                phone = user_res.data[0].get("phone") if user_res.data else None

            if phone:
                print(f"[AI Voice Scheduler] Triggering call for lead {lead_id} ({phone})")
                log_res = supabase.table("ai_call_logs").insert({
                    "lead_id": lead_id,
                    "status": "initiating"
                }).execute()
                call_log_id = log_res.data[0]["id"] if log_res.data else None

                exotel_res = initiate_ai_call(from_number=exotel_number, to_number=phone, lead_id=lead_id)

                if exotel_res and "Call" in exotel_res:
                    # Check for lead-level skip (bad/invalid phone number)
                    if exotel_res.get("_lead_skip"):
                        if call_log_id:
                            supabase.table("ai_call_logs").update({"status": "failed_to_initiate"}).eq("id", call_log_id).execute()
                        queue[pending_idx]["status"] = "skipped"
                        print(f"[AI Voice Scheduler] ⏭️  Skipped lead {lead_id} (invalid/unroutable phone)")
                    else:
                        call_sid = exotel_res["Call"].get("Sid")
                        if call_log_id:
                            supabase.table("ai_call_logs").update({"call_sid": call_sid, "status": "ringing"}).eq("id", call_log_id).execute()
                        # Mark as bot_called — keep in queue for status tracking
                        queue[pending_idx]["status"] = "bot_called"
                        queue[pending_idx]["call_log_id"] = call_log_id
                        queue[pending_idx]["call_sid"] = call_sid
                        queue[pending_idx]["called_at"] = datetime.datetime.utcnow().isoformat()
                        print(f"[AI Voice Scheduler] ✅ Call initiated for lead {lead_id}, marked as bot_called")
                else:
                    if call_log_id:
                        supabase.table("ai_call_logs").update({"status": "failed_to_initiate"}).eq("id", call_log_id).execute()
                    queue[pending_idx]["status"] = "failed"
                    print(f"[AI Voice Scheduler] ❌ Call failed for lead {lead_id}")
            else:
                queue[pending_idx]["status"] = "failed"
                print(f"[AI Voice Scheduler] ❌ No phone found for lead {lead_id}")
            
            # Save the updated queue
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
            logs_res = supabase.table("whatsapp_logs").select("id, phone_number, lead_id").eq("campaign_id", campaign_id).eq("status", "PENDING").execute()
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
                        # Log to whatsapp_messages for live chat visibility
                        if log.get('lead_id'):
                            # Find out if we need user_id or lead_id? Since WhatsApp Campaigns only target leads right now, we use lead_id.
                            try:
                                supabase.table("whatsapp_messages").insert({
                                    "lead_id": log["lead_id"],
                                    "message_body": f"[Campaign: {template_name}]",
                                    "sender_type": "bot"
                                }).execute()
                            except Exception as db_err:
                                print(f"[WhatsApp Scheduler] Failed to log chat message: {db_err}")
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



async def _send_daily_whatsapp_report_logic():
    print("[WhatsApp Report] Generating daily report...")
    supabase = get_supabase_client()
    
    # 1. Fetch Config
    num_res = supabase.table("global_settings").select("settings_value").eq("settings_key", "whatsapp_report_numbers").execute()
    numbers = num_res.data[0].get("settings_value", {}).get("numbers", []) if num_res.data else []
    
    if not numbers:
        print("[WhatsApp Report] No phone numbers configured. Skipping.")
        return
        
    # 2. Gather Stats
    today_date = datetime.datetime.now()
    start_of_today_str = today_date.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    
    # New Leads
    leads_res = supabase.table("leads").select("id", count="exact").gte("created_at", start_of_today_str).execute()
    new_leads = leads_res.count or 0
    
    # AI Calls
    logs_res = supabase.table("ai_call_logs").select("id, status", count="exact").gte("created_at", start_of_today_str).execute()
    total_calls = logs_res.count or 0
    answered = len([log for log in (logs_res.data or []) if log.get("status") == "completed"])
    
    # Consultations
    consult_res = supabase.table("leads").select("id", count="exact").eq("status", "CONSULTATION_SCHEDULED").gte("created_at", start_of_today_str).execute()
    # Note: Using created_at might only catch leads created today that became scheduled today. Let's assume this is a simplified proxy. 
    # For better accuracy, we just show current leads with this status created today, or we can look at all leads updated today.
    # We will use updated_at for status changes if possible. But for now, we just query based on created_at or generic.
    
    # Let's do a broader fetch for today's conversions/consultations
    # All leads updated today to CONSULTATION_SCHEDULED or CONVERTED
    updated_res = supabase.table("leads").select("status").gte("updated_at", start_of_today_str).execute()
    consults_today = 0
    conversions_today = 0
    for lead in (updated_res.data or []):
        if lead.get("status") == "CONSULTATION_SCHEDULED":
            consults_today += 1
        elif lead.get("status") == "CONVERTED":
            conversions_today += 1
            
    # Orders (Revenue)
    orders_res = supabase.table("proforma_invoices").select("total_amount").gte("created_at", start_of_today_str).execute()
    revenue = sum(o.get("total_amount", 0) for o in (orders_res.data or []))
    orders_count = len(orders_res.data or [])
            
    report_text = f"""📊 *Genestac Daily Report* 📊
Date: {today_date.strftime('%Y-%m-%d')}

📈 *Leads & Sales*
- New Leads: {new_leads}
- Consultations Booked: {consults_today}
- New Conversions: {conversions_today}
- Orders Generated: {orders_count}
- Total Revenue: ₹{revenue:,.2f}

🤖 *AI Calling*
- Total Calls Triggered: {total_calls}
- Calls Answered: {answered}

_This is an automated daily report from Genestac CRM._"""

    from services.whatsapp_service import send_whatsapp_text
    import asyncio
    
    tasks = []
    for num in numbers:
        tasks.append(send_whatsapp_text(num, report_text))
        
    results = await asyncio.gather(*tasks, return_exceptions=True)
    print(f"[WhatsApp Report] Sent to {len(numbers)} numbers. Results: {results}")


def check_and_send_whatsapp_report():
    try:
        supabase = get_supabase_client()
        time_res = supabase.table("global_settings").select("settings_value").eq("settings_key", "whatsapp_report_time").execute()
        target_time = time_res.data[0].get("settings_value", {}).get("time", "21:00") if time_res.data else "21:00"
        
        now = datetime.datetime.now()
        current_time_str = now.strftime("%H:%M")
        
        if current_time_str == target_time:
            # Prevent multiple sends within the same minute by checking a basic log/cache if needed,
            # but apscheduler runs this exactly once per minute if we use interval=1m at 0 seconds.
            import asyncio
            asyncio.run(_send_daily_whatsapp_report_logic())
            
    except Exception as e:
        print(f"[WhatsApp Report Trigger Error] {e}")


def start_scheduler():
    if not scheduler.running:
        # Sweep for auto-calls and pending callbacks every 5 minutes
        scheduler.add_job(sweep_leads_for_auto_call, 'interval', minutes=1, id="ai_voice_sweep", replace_existing=True)
        # Sweep for scheduled appointments every 1 minute and trigger Exotel bridge calls
        scheduler.add_job(sweep_scheduled_appointments, 'interval', minutes=1, id="appointment_call_sweep", replace_existing=True)
        # Sweep for WhatsApp Campaigns every 1 minute
        scheduler.add_job(sweep_whatsapp_campaigns, 'interval', minutes=1, id="whatsapp_campaign_sweep", replace_existing=True)
        # Check WhatsApp Daily Report trigger every 1 minute
        scheduler.add_job(check_and_send_whatsapp_report, 'interval', minutes=1, id="whatsapp_daily_report", replace_existing=True)
        scheduler.start()
        print("Started Background Scheduler for AI Voice Calling and WhatsApp.")

