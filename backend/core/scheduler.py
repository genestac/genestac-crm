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
        # exotel_number is kept for legacy callback calls but Sarvam doesn't need it
        exotel_number = settings.get("exotel_number", "")

        # Hard-stop: Sarvam billing error — admin must recharge before calls resume
        if settings.get("sarvam_billing_error"):
            print("[AI Voice Scheduler] ⛔ Sarvam billing error detected. All calling PAUSED. Recharge Sarvam credits and clear the error in admin settings.")
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
        import pytz as _pytz_sweep
        today = datetime.datetime.now(_pytz_sweep.timezone("Asia/Kolkata")).date().isoformat()
        skipped_max = 0
        skipped_today = 0
        skipped_source = 0

        if all_lead_ids:
            # ⚠️  IMPORTANT: Supabase returns max 1000 rows by default.
            # Fetching all logs in one .in_() call would silently truncate results
            # and cause leads to appear uncalled. Instead, query counts per-lead in chunks.
            total_call_counts = {}
            today_call_counts = {}
            chunk_size = 50  # Query 50 leads at a time to stay under limits
            for i in range(0, len(all_lead_ids), chunk_size):
                chunk = all_lead_ids[i:i + chunk_size]
                # Fetch ALL logs for this chunk (no row limit issue since it's per-lead)
                logs_res = supabase.table("ai_call_logs") \
                    .select("lead_id, created_at") \
                    .in_("lead_id", chunk) \
                    .limit(10000) \
                    .execute()
                for log in (logs_res.data or []):
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

            # Sanitize phone — strip any prefix like 'p:', 'tel:', spaces etc.
            if phone:
                import re
                phone = re.sub(r'^[^0-9+]+', '', str(phone).strip())  # strip leading non-digit/non-+ chars
                phone = re.sub(r'\s+', '', phone)  # remove internal spaces
                if not phone:
                    phone = None

            if phone:
                print(f"[AI Voice Scheduler] Triggering call for lead {lead_id} ({phone})")
                log_res = supabase.table("ai_call_logs").insert({
                    "lead_id": lead_id,
                    "status": "initiating"
                }).execute()
                call_log_id = log_res.data[0]["id"] if log_res.data else None

                exotel_res = initiate_ai_call(from_number=exotel_number, to_number=phone, lead_id=lead_id)

                # ── Billing error: stop all calls and notify admin via DB flag ──
                if isinstance(exotel_res, dict) and exotel_res.get("_billing_error"):
                    if call_log_id:
                        supabase.table("ai_call_logs").update({"status": "failed_to_initiate"}).eq("id", call_log_id).execute()
                    queue[pending_idx]["status"] = "failed"
                    # Set billing error flag in settings so UI shows recharge banner
                    settings["sarvam_billing_error"] = True
                    supabase.table("global_settings").update({"settings_value": settings}).eq("settings_key", "ai_call_settings").execute()
                    supabase.table("global_settings").upsert({"settings_key": "ai_call_queue", "settings_value": queue}, on_conflict="settings_key").execute()
                    print("[AI Voice Scheduler] ⛔ BILLING ERROR (402) — Sarvam credits exhausted. All calling paused. Recharge and clear error in admin panel.")
                    return  # Stop this sweep entirely

                elif exotel_res and "Call" in exotel_res:
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
            raw_components = whatsapp_template.get('default_components') if whatsapp_template else None
            
            # Build the actual API components list from stored metadata
            components = []
            if raw_components:
                for comp in raw_components:
                    if comp.get("_meta"):
                        # This is a media header that needs a URL set by the admin
                        fmt = comp.get("header_format", "IMAGE")
                        url = comp.get("header_media_url")
                        if not url:
                            print(f"[WhatsApp Scheduler] ⚠️ Template '{template_name}' has a {fmt} header but no media URL set. Skipping header component.")
                            continue
                        type_key = fmt.lower()  # "image", "document", "video"
                        param = {"type": type_key, type_key: {"link": url}}
                        if type_key == "document":
                            param[type_key]["filename"] = "document.pdf"
                        components.append({"type": "header", "parameters": [param]})
                    else:
                        # Regular body/button component — use as-is
                        components.append(comp)
            
            components = components or None  # Pass None if empty so payload omits the key

            
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
                    # Check if campaign was paused mid-execution
                    camp_check = supabase.table("whatsapp_campaigns").select("status").eq("id", campaign_id).execute()
                    if camp_check.data and camp_check.data[0].get("status") == "PAUSED":
                        print(f"[WhatsApp Scheduler] Campaign {campaign_id} paused. Stopping batch.")
                        return # Exits the loop, leaving remaining logs PENDING

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
                            # The lead_id column in whatsapp_logs can store IDs from either
                            # the `leads` table OR the `users` table. Try leads first, fallback to users.
                            try:
                                supabase.table("whatsapp_messages").insert({
                                    "lead_id": log["lead_id"],
                                    "message_body": f"[Campaign: {template_name}]",
                                    "sender_type": "bot"
                                }).execute()
                            except Exception:
                                # FK violation — the ID belongs to the users table, not leads
                                try:
                                    supabase.table("whatsapp_messages").insert({
                                        "user_id": log["lead_id"],
                                        "message_body": f"[Campaign: {template_name}]",
                                        "sender_type": "bot"
                                    }).execute()
                                except Exception as inner_err:
                                    print(f"[WhatsApp Scheduler] Failed to log chat message: {inner_err}")
                    else:
                        err = str(res_json.get("error", "Unknown error")) if res_json else "Empty response"
                        supabase.table("whatsapp_logs").update({"status": "FAILED", "error_msg": err}).eq("id", log['id']).execute()
            
            # Run async execution
            asyncio.run(process_logs())
            
            # If the loop finished and the status is still RUNNING, all logs are processed. Mark COMPLETED.
            final_check = supabase.table("whatsapp_campaigns").select("status").eq("id", campaign_id).execute()
            if final_check.data and final_check.data[0].get("status") == "RUNNING":
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
            
    # Completed consultations today
    completed_appts_res = supabase.table("appointments").select("id", count="exact").eq(
        "status", "completed"
    ).gte("updated_at", start_of_today_str).execute()
    completed_appts = completed_appts_res.count or 0

    # Pending appointments needing doctor action
    pending_appts_res = supabase.table("appointments").select("id", count="exact").eq("status", "pending").execute()
    pending_appts = pending_appts_res.count or 0

    # Build pending actions string
    pending_parts = []
    if pending_appts > 0:
        pending_parts.append(f"{pending_appts} appointment(s) awaiting doctor approval")
    pending_actions = "; ".join(pending_parts) if pending_parts else "None"

    date_str = today_date.strftime("%d %b %Y")
    revenue_str = f"{revenue:,.0f}"

    from services.whatsapp_service import send_daily_crm_report_template
    import asyncio

    tasks = []
    for num in numbers:
        tasks.append(send_daily_crm_report_template(
            phone=num,
            date=date_str,
            new_leads=new_leads,
            consultations_booked=consults_today,
            consultations_done=completed_appts,
            orders=orders_count,
            revenue=revenue_str,
            pending_actions=pending_actions,
        ))

    results = await asyncio.gather(*tasks, return_exceptions=True)
    print(f"[WhatsApp Report] Template sent to {len(numbers)} numbers. Results: {results}")


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


def check_expired_subscriptions():
    """Daily check to mark expired subscriptions"""
    try:
        from db.supabase import get_supabase_client
        import pytz as _pytz_exp
        sb = get_supabase_client()
        today = datetime.datetime.now(_pytz_exp.timezone("Asia/Kolkata")).strftime('%Y-%m-%d')
        res = sb.table('subscriptions').update({'status': 'expired'}).lt('end_date', today).eq('status', 'active').execute()
        if res.data:
            print(f"Marked {len(res.data)} subscriptions as expired.")
    except Exception as e:
        print(f"Error checking expired subscriptions: {e}")


def sweep_subscriber_engagement():
    """
    Runs every minute, fires at the configured send_time once per day.
    Checks each active subscriber's user_plans row:
      - If no log entry in the last `inactivity_days_threshold` days  → send REMINDER template
      - If logged data today                                           → send MOTIVATION template
    Respects `min_days_between_nudges` to avoid spamming the same user.
    """
    try:
        supabase = get_supabase_client()

        # 1. Load settings
        res = supabase.table("global_settings").select("settings_value").eq("settings_key", "whatsapp_subscriber_engagement").execute()
        if not res.data:
            return
        cfg = res.data[0]["settings_value"]
        if not cfg.get("enabled"):
            return

        send_time = cfg.get("send_time", "09:00")
        import pytz
        ist = pytz.timezone("Asia/Kolkata")
        now_ist = datetime.datetime.now(ist)
        current_time_str = now_ist.strftime("%H:%M")
        if current_time_str != send_time:
            return  # Not the right minute yet

        reminder_template_id  = cfg.get("reminder_template_id")
        motivation_template_id = cfg.get("motivation_template_id")
        inactivity_days       = int(cfg.get("inactivity_days_threshold") or 1)
        min_nudge_gap         = int(cfg.get("min_days_between_nudges") or 1)

        if not reminder_template_id and not motivation_template_id:
            print("[Subscriber Engagement] No templates configured. Skipping.")
            return

        # 2. Fetch all active subscriptions with user phone
        subs_res = supabase.table("subscriptions") \
            .select("user_id, users(phone, name)") \
            .eq("status", "active") \
            .execute()
        subscribers = subs_res.data or []
        if not subscribers:
            return

        print(f"[Subscriber Engagement] Checking {len(subscribers)} active subscribers...")

        # 3. Pre-fetch template names from DB
        template_names = {}
        template_ids_needed = [tid for tid in [reminder_template_id, motivation_template_id] if tid]
        if template_ids_needed:
            t_res = supabase.table("whatsapp_templates").select("id, name, language, default_components, content").in_("id", template_ids_needed).execute()
            for t in (t_res.data or []):
                template_names[t["id"]] = t

        # 4. Fetch recent WhatsApp logs so we know who was already nudged recently
        from datetime import date as date_cls, timedelta
        cutoff_nudge = (now_ist.date() - timedelta(days=min_nudge_gap)).isoformat()
        recent_logs_res = supabase.table("whatsapp_logs").select("lead_id").gte("created_at", cutoff_nudge).execute()
        recently_nudged_ids = {log["lead_id"] for log in (recent_logs_res.data or [])}

        import asyncio
        from services.whatsapp_service import send_whatsapp_template

        today_str = now_ist.date().isoformat()
        inactivity_cutoff = (now_ist.date() - timedelta(days=inactivity_days)).isoformat()

        async def process_subscribers():
            for sub in subscribers:
                user_id = sub.get("user_id")
                user = sub.get("users") or {}
                phone = user.get("phone")
                name  = user.get("name") or "there"

                if not phone or not user_id:
                    continue

                # Skip if recently nudged
                if user_id in recently_nudged_ids:
                    continue

                # Skip if user opted out via STOP
                user_meta_res = supabase.table("users").select("metadata").eq("id", user_id).single().execute()
                user_metadata = (user_meta_res.data or {}).get("metadata") or {}
                if user_metadata.get("engagement_opted_out"):
                    print(f"[Subscriber Engagement] ⏭️ Skipping {name} — opted out")
                    continue

                # 5. Fetch user_plans row
                plan_res = supabase.table("user_plans").select(
                    "water_history, sleep_history, steps_history, measurement_history"
                ).eq("user_id", user_id).single().execute()

                if not plan_res.data:
                    # User has no plan row at all — treat as inactive
                    logged_today = False
                    last_log_date = None
                else:
                    plan = plan_res.data

                    # Find the most recent date entry across all history arrays
                    all_dates = []
                    for field in ["water_history", "sleep_history", "steps_history"]:
                        history = plan.get(field) or []
                        for entry in (history if isinstance(history, list) else []):
                            d = entry.get("date") if isinstance(entry, dict) else None
                            if d:
                                all_dates.append(d)
                    # measurement_history may be a dict with a 'measurements' list
                    mh = plan.get("measurement_history") or {}
                    if isinstance(mh, dict):
                        for entry in mh.get("measurements") or []:
                            d = entry.get("date") if isinstance(entry, dict) else None
                            if d:
                                all_dates.append(d)
                    elif isinstance(mh, list):
                        for entry in mh:
                            d = entry.get("date") if isinstance(entry, dict) else None
                            if d:
                                all_dates.append(d)

                    last_log_date = max(all_dates) if all_dates else None
                    logged_today  = (last_log_date == today_str) if last_log_date else False

                # 6. Decide which template to send
                if logged_today and motivation_template_id:
                    template_info = template_names.get(motivation_template_id)
                    send_reason = "motivation"
                elif not logged_today and reminder_template_id:
                    # Only send reminder if truly inactive for inactivity_days
                    is_inactive = (not last_log_date) or (last_log_date <= inactivity_cutoff)
                    if not is_inactive:
                        continue  # Logged recently but not today — no message
                    template_info = template_names.get(reminder_template_id)
                    send_reason = "reminder"
                else:
                    continue

                if not template_info:
                    continue

                clean_phone = ''.join(filter(str.isdigit, phone))
                template_name = template_info["name"]
                language_code = template_info.get("language") or "en_US"

                # Build per-subscriber personalized variables dict
                variable_mappings = cfg.get("variable_mappings") or {}
                mappings_for_type = variable_mappings.get(send_reason, {})  # e.g. {"1": "name", "2": "days_inactive"}

                days_inactive = 0
                if last_log_date:
                    try:
                        from datetime import date as _date
                        delta = now_ist.date() - _date.fromisoformat(last_log_date)
                        days_inactive = delta.days
                    except Exception:
                        pass

                first_name = name.split()[0] if name and name != "there" else name

                # Available personalization fields
                subscriber_vars = {
                    "name": name or "there",
                    "first_name": first_name or "there",
                    "days_inactive": str(days_inactive) if days_inactive else "a few",
                    "last_log_date": last_log_date or "N/A",
                    "today": today_str,
                    "phone": clean_phone,
                }

                # Build components — replace body parameters if variable mappings exist
                components = None
                raw_components = template_info.get("default_components") or []
                built = []
                for comp in raw_components:
                    if comp.get("_meta"):
                        # Media header
                        url = comp.get("header_media_url")
                        if not url:
                            continue
                        fmt = comp.get("header_format", "IMAGE").lower()
                        param = {"type": fmt, fmt: {"link": url}}
                        built.append({"type": "header", "parameters": [param]})
                    elif comp.get("type") == "body" and mappings_for_type:
                        # Rebuild body parameters using variable mappings
                        existing_params = comp.get("parameters") or []
                        new_params = []
                        # Use mappings to resolve {{1}}, {{2}} etc.
                        # Sort by slot index so order is preserved
                        sorted_slots = sorted(mappings_for_type.keys(), key=lambda x: int(x) if x.isdigit() else 99)
                        for slot in sorted_slots:
                            field_key = mappings_for_type[slot]
                            value = subscriber_vars.get(field_key, field_key)
                            new_params.append({"type": "text", "text": value})
                        if new_params:
                            built.append({"type": "body", "parameters": new_params})
                        elif existing_params:
                            # Fall back to stored defaults
                            built.append(comp)
                    else:
                        built.append(comp)
                if built:
                    components = built

                # 7. Send the message
                res_json = await send_whatsapp_template(clean_phone, template_name, language_code=language_code, components=components)

                if res_json and "error" not in res_json:
                    print(f"[Subscriber Engagement] ✅ Sent {send_reason} to {name} ({clean_phone})")
                    # Log to whatsapp_logs so min_nudge_gap works correctly
                    supabase.table("whatsapp_logs").insert({
                        "lead_id": user_id,
                        "phone_number": clean_phone,
                        "status": "SENT",
                        "campaign_id": None
                    }).execute()
                    # Build a human-readable body by filling subscriber_vars into the template content
                    raw_content = template_info.get("content") or ""
                    try:
                        # Replace {{1}}, {{2}} ... with actual values using variable_mappings
                        import re as _re
                        readable_body = raw_content
                        sorted_slots_for_body = sorted(
                            mappings_for_type.keys(),
                            key=lambda x: int(x) if x.isdigit() else 99
                        ) if mappings_for_type else []
                        for slot in sorted_slots_for_body:
                            field_key = mappings_for_type[slot]
                            value = subscriber_vars.get(field_key, field_key)
                            readable_body = _re.sub(
                                rf"\{{\{{{slot}\}}\}}",
                                lambda m, v=value: v,
                                readable_body
                            )
                        if not readable_body.strip():
                            readable_body = f"[Reminder: {template_name}]"
                    except Exception:
                        readable_body = f"[Reminder: {template_name}]"
                    # Save real message body to inbox so it appears in WhatsApp Inbox
                    try:
                        supabase.table("whatsapp_messages").insert({
                            "user_id": user_id,
                            "message_body": readable_body,
                            "sender_type": "bot",
                            "metadata": {
                                "engagement_type": send_reason,
                                "template_name": template_name,
                                "is_reminder": True
                            }
                        }).execute()
                    except Exception:
                        pass
                else:
                    err = str(res_json.get("error", "Unknown")) if res_json else "Empty response"
                    print(f"[Subscriber Engagement] ❌ Failed for {clean_phone}: {err}")

        asyncio.run(process_subscribers())
        print("[Subscriber Engagement] Done.")

    except _NETWORK_ERRORS as e:
        print(f"[Subscriber Engagement] ⚠️ Network error: {type(e).__name__}")
    except Exception as e:
        import traceback
        print(f"[Subscriber Engagement] Error: {e}")
        traceback.print_exc()

def geocode_missing_cities():
    """
    Background task to fetch coordinates for cities from Nominatim API (1 req/sec limit)
    Updates 'city_coordinates_cache' in global_settings.
    """
    try:
        from db.supabase import get_supabase_client
        supabase = get_supabase_client()
        import requests
        import time

        # Fetch all unique cities from leads
        leads_res = supabase.table("leads").select("city, metadata").execute()
        raw_cities = set()
        for lead in (leads_res.data or []):
            city = lead.get("city")
            if not city and isinstance(lead.get("metadata"), dict):
                city = lead["metadata"].get("city")
            if city and isinstance(city, str) and city.strip():
                raw_cities.add(city.strip().lower())
                
        if not raw_cities:
            return

        # Fetch cache
        cache_res = supabase.table("global_settings").select("settings_value").eq("settings_key", "city_coordinates_cache").execute()
        city_cache = cache_res.data[0].get("settings_value", {}) if cache_res.data else {}
        
        missing_cities = [c for c in raw_cities if c not in city_cache]
        
        if not missing_cities:
            return
            
        print(f"[Geocode] Found {len(missing_cities)} missing cities. Processing up to 20...")
        
        # Process in small batches so we don't block the scheduler thread for too long
        batch = missing_cities[:20]
        updated = False
        headers = {"User-Agent": "GenestacCRMHeatmap/1.0 (contact: admin@genestac.com)"}
        
        for city in batch:
            try:
                # Add India to help disambiguate unless they provided country
                query = city if "india" in city.lower() else f"{city}, India"
                url = f"https://nominatim.openstreetmap.org/search?format=json&q={requests.utils.quote(query)}&limit=1"
                resp = requests.get(url, headers=headers, timeout=10)
                if resp.status_code == 200:
                    data = resp.json()
                    if data and len(data) > 0:
                        city_cache[city] = {
                            "lat": float(data[0]["lat"]),
                            "lng": float(data[0]["lon"])
                        }
                    else:
                        # Cache empty so we don't retry endlessly
                        city_cache[city] = {"lat": None, "lng": None}
                    updated = True
                time.sleep(1.2) # Respect 1 req/sec limit
            except Exception as e:
                print(f"[Geocode] Error geocoding {city}: {e}")
                
        if updated:
            supabase.table("global_settings").upsert({
                "settings_key": "city_coordinates_cache",
                "settings_value": city_cache
            }, on_conflict="settings_key").execute()
            print(f"[Geocode] Updated cache with new locations.")

    except Exception as e:
        print(f"[Geocode] Error in background task: {e}")



def sweep_ai_health_coach_nudges():
    """
    Runs every minute, fires at 9:00 AM IST once per day.

    For each user with an ACTIVE mobile subscription:
      1. Fetch their recent daily_logs and ai_doctor_sessions context
      2. Generate a personalised AI health coach check-in via GPT-4o
      3. Append the message to ai_doctor_sessions (appears in app chat)
      4. Send an Expo push notification

    Skips users who were already nudged today.
    """
    import pytz
    ist = pytz.timezone("Asia/Kolkata")
    now_ist = datetime.datetime.now(ist)
    current_time_str = now_ist.strftime("%H:%M")

    # Only fire at 09:00 IST
    NUDGE_HOUR = "09:00"
    if current_time_str != NUDGE_HOUR:
        return

    try:
        supabase = get_supabase_client()
        import asyncio, json, os
        import openai as _openai

        # ── Fetch all active mobile subscriptions ─────────────────────────────
        subs_res = supabase.table("subscriptions") \
            .select("user_id, end_date, users(name, metadata)") \
            .eq("status", "active") \
            .execute()

        mobile_subs = [
            s for s in (subs_res.data or [])
            if (s.get("plan_type") or "").lower() in ("mobile", "app", "digital", "online")
        ]

        # Fallback: if plan_type column missing, include all active subs
        if not mobile_subs:
            mobile_subs = subs_res.data or []

        if not mobile_subs:
            return

        print(f"[AI Coach Nudge] Checking {len(mobile_subs)} active subscribers...")
        today_str = now_ist.date().isoformat()

        async def _nudge_user(sub: dict):
            user_id = sub.get("user_id")
            user_info = sub.get("users") or {}
            name = user_info.get("name") or "there"
            meta = user_info.get("metadata") or {}
            push_token = meta.get("expo_push_token")

            if not user_id:
                return

            # ── Check if already nudged today ─────────────────────────────────
            session_res = supabase.table("ai_doctor_sessions") \
                .select("messages, updated_at") \
                .eq("user_id", user_id) \
                .limit(1) \
                .execute()
            session_row = session_res.data[0] if session_res.data else None

            if session_row:
                updated_at = (session_row.get("updated_at") or "")[:10]
                if updated_at == today_str:
                    return  # Already sent a message today

            # ── Fetch last 3 messages for context ─────────────────────────────
            existing_msgs = (session_row or {}).get("messages") or [] if session_row else []
            last_3 = existing_msgs[-3:] if len(existing_msgs) >= 3 else existing_msgs
            chat_context = "\n".join([
                f"{m.get('role','?').capitalize()}: {m.get('content','')[:200]}"
                for m in last_3
            ])

            # ── Fetch recent daily logs ───────────────────────────────────────
            logs_res = supabase.table("daily_logs") \
                .select("date, weight, mood, notes") \
                .eq("user_id", user_id) \
                .order("date", desc=True) \
                .limit(3) \
                .execute()
            logs = logs_res.data or []
            logged_yesterday = any(
                (l.get("date") or "")[:10] == (now_ist.date() - datetime.timedelta(days=1)).isoformat()
                for l in logs
            )

            # ── Fetch user plan for context ───────────────────────────────────
            plan_ctx = ""
            try:
                plan_res = supabase.table("user_plans") \
                    .select("diet_plan, exercise_plan") \
                    .eq("user_id", user_id) \
                    .limit(1) \
                    .execute()
                plan_row = plan_res.data[0] if plan_res.data else None
                if plan_row:
                    diet = plan_row.get("diet_plan") or {}
                    plan_ctx = f"User has a diet plan targeting {diet.get('daily_calories', '')} calories/day."
            except Exception:
                pass

            # ── Build prompt ──────────────────────────────────────────────────
            day_of_week = now_ist.strftime("%A")
            is_monday = day_of_week == "Monday"

            prompt = f"""You are the Genestac AI Health Coach sending a daily check-in message to {name}.

Context:
- Today: {day_of_week}, {today_str}
- {plan_ctx}
- User logged activity yesterday: {logged_yesterday}
- Recent chat:
{chat_context or '(no previous conversation)'}
- Recent logs: {json.dumps(logs[:2], default=str) if logs else 'None'}

Task: Write a SHORT (2-4 sentences) personalised daily check-in message.
Rules:
- If logged yesterday → celebrate + motivate for today
- If NOT logged yesterday → gentle reminder, not preachy
- On Monday → ask a brief weekly check-in question about their weekend
- Always specific to their plan and name
- End with one actionable tip for the day
- Warm, friendly tone — like a health-savvy friend
- Use a relevant emoji at the start
- Respond ONLY with the message text. No JSON, no labels."""

            try:
                oai = _openai.AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))
                resp = await oai.chat.completions.create(
                    model="gpt-4o-mini",
                    messages=[{"role": "user", "content": prompt}],
                    max_tokens=150,
                    temperature=0.8,
                )
                nudge_text = resp.choices[0].message.content.strip()
            except Exception as e:
                print(f"[AI Coach Nudge] GPT error for user {user_id}: {e}")
                return

            # ── Save message to ai_doctor_sessions ────────────────────────────
            try:
                import time
                new_msg = {
                    "id": f"nudge_{int(time.time())}",
                    "role": "assistant",
                    "content": nudge_text,
                    "timestamp": int(time.time() * 1000),
                }
                if session_res.data:
                    updated_msgs = list(existing_msgs) + [new_msg]
                    supabase.table("ai_doctor_sessions").update({
                        "messages": updated_msgs,
                        "updated_at": datetime.datetime.now(pytz.timezone("UTC")).isoformat(),
                    }).eq("user_id", user_id).execute()
                else:
                    supabase.table("ai_doctor_sessions").insert({
                        "user_id": user_id,
                        "messages": [new_msg],
                    }).execute()
                print(f"[AI Coach Nudge] ✅ Message saved for user {user_id}")
            except Exception as e:
                print(f"[AI Coach Nudge] Session update failed for user {user_id}: {e}")
                return

            # ── Send Expo push notification ───────────────────────────────────
            if push_token and push_token.startswith("Exponent"):
                try:
                    import httpx as _httpx
                    async with _httpx.AsyncClient(timeout=10) as client:
                        await client.post(
                            "https://exp.host/--/api/v2/push/send",
                            json={
                                "to": push_token,
                                "title": "💬 Message from your Health Coach",
                                "body": nudge_text[:100] + ("..." if len(nudge_text) > 100 else ""),
                                "sound": "default",
                                "data": {"screen": "ai-doctor-chat"},
                            },
                            headers={"Content-Type": "application/json"},
                        )
                    print(f"[AI Coach Nudge] Push sent to user {user_id}")
                except Exception as e:
                    print(f"[AI Coach Nudge] Push failed for user {user_id}: {e}")

        # Run all nudges concurrently
        async def _run_all():
            tasks = [_nudge_user(s) for s in mobile_subs]
            await asyncio.gather(*tasks, return_exceptions=True)

        asyncio.run(_run_all())
        print(f"[AI Coach Nudge] ✅ Daily nudge sweep complete for {len(mobile_subs)} subscribers")

    except _NETWORK_ERRORS as e:
        print(f"[AI Coach Nudge] ⚠️ Network error: {type(e).__name__}")
    except Exception as e:
        import traceback
        print(f"[AI Coach Nudge] ❌ Error: {e}")
        traceback.print_exc()


# ── WhatsApp Follow-up Sweeps ─────────────────────────────────────────────────

def sweep_whatsapp_followups():
    """
    Sweeps leads with a scheduled WhatsApp follow-up time that has passed.
    Sends a re-engagement message and clears the followup timestamp.
    Runs every minute.
    """
    import asyncio
    try:
        supabase: Client = get_supabase_client()
        now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()

        res = supabase.table("leads").select(
            "id, name, phone_number, metadata, status"
        ).lte("whatsapp_followup_at", now_iso).not_.is_(
            "whatsapp_followup_at", "null"
        ).eq("whatsapp_opt_out", False).limit(20).execute()

        leads = res.data or []
        if not leads:
            return

        print(f"[WA Followup] Found {len(leads)} leads to follow up")

        async def _send_followup(lead):
            try:
                from services.whatsapp_service import send_whatsapp_text
                phone = lead.get("phone_number", "")
                if not phone:
                    return

                name = lead.get("name") or "aap"
                followup_msg = (
                    f"Namaste {name}! 👋\n\n"
                    "Main Aalya bol rahi hu, Genestac se. Pehle baat hui thi hamare GLP-1 "
                    "Weight Management Program ke baare mein.\n\n"
                    "Kya aap abhi baat kar sakte hain? Hamara FREE initial assessment offer "
                    "abhi bhi available hai. 🩺"
                )
                await send_whatsapp_text(phone, followup_msg)

                # Clear followup time + update status
                supabase.table("leads").update({
                    "whatsapp_followup_at": None,
                    "status": "FOLLOWUP_SENT",
                }).eq("id", lead["id"]).execute()

                print(f"[WA Followup] ✅ Follow-up sent to {lead['id']} ({phone})")
            except Exception as e:
                print(f"[WA Followup] ❌ Error for lead {lead.get('id')}: {e}")

        async def _run():
            await asyncio.gather(*[_send_followup(l) for l in leads], return_exceptions=True)

        asyncio.run(_run())

    except _NETWORK_ERRORS as e:
        print(f"[WA Followup] ⚠️ Network error: {type(e).__name__}")
    except Exception as e:
        import traceback
        print(f"[WA Followup] ❌ Error: {e}")
        traceback.print_exc()


def sweep_meet_reminders():
    """
    Runs every minute. Sends appointment_reminder_10min WhatsApp TEMPLATE
    to both patient and doctor 10 minutes before a confirmed appointment.
    Uses Meta templates so it works even outside the 24-hour free window.
    Marks reminder_sent=True to avoid duplicate sends.
    """
    import asyncio
    try:
        supabase: Client = get_supabase_client()
        now = datetime.datetime.now(datetime.timezone.utc)
        window_start = (now + datetime.timedelta(minutes=8)).isoformat()
        window_end = (now + datetime.timedelta(minutes=12)).isoformat()

        res = supabase.table("appointments").select(
            "id, patient_id, scheduled_at, meeting_link, doctor_id, notes, "
            "staffs!appointments_doctor_id_fkey(full_name, whatsapp_number)"
        ).gte("scheduled_at", window_start).lte(
            "scheduled_at", window_end
        ).eq("status", "confirmed").eq("reminder_sent", False).not_.is_(
            "meeting_link", "null"
        ).execute()

        appts = res.data or []
        if not appts:
            return

        print(f"[Meet Reminder] Sending {len(appts)} 10-min template reminders")

        async def _remind(appt):
            try:
                from services.whatsapp_service import send_appointment_reminder
                import re

                meet_link = appt.get("meeting_link")
                if not meet_link:
                    return

                doc_info = appt.get("staffs") or {}
                raw_doc_name = doc_info.get("full_name", "Doctor")
                doctor_display = raw_doc_name.lstrip().removeprefix("Dr.").strip()
                doctor_wa = doc_info.get("whatsapp_number")

                notes = appt.get("notes") or ""
                patient_id = appt.get("patient_id")

                # Resolve scheduled_at as IST time string
                sched_raw = appt.get("scheduled_at", "")
                try:
                    from zoneinfo import ZoneInfo
                    IST = ZoneInfo("Asia/Kolkata")
                    sched_dt = datetime.datetime.fromisoformat(sched_raw)
                    if sched_dt.tzinfo is None:
                        sched_dt = sched_dt.replace(tzinfo=datetime.timezone.utc)
                    sched_dt_ist = sched_dt.astimezone(IST)
                    time_display = sched_dt_ist.strftime("%-I:%M %p IST")
                except Exception:
                    time_display = sched_raw

                # Resolve patient phone + name
                patient_phone = None
                patient_name = "Patient"

                # From notes [PHONE: ...]
                pm = re.search(r'\[PHONE:\s*([^\]]+)\]', notes)
                if pm:
                    patient_phone = pm.group(1).strip()

                if patient_id:
                    lead_res = supabase.table("leads").select("phone_number, name").eq("id", patient_id).execute()
                    if lead_res.data:
                        patient_phone = patient_phone or lead_res.data[0].get("phone_number")
                        patient_name = lead_res.data[0].get("name") or patient_name
                    if not patient_phone:
                        user_res = supabase.table("users").select("phone, name").eq("id", patient_id).execute()
                        if user_res.data:
                            patient_phone = user_res.data[0].get("phone")
                            patient_name = user_res.data[0].get("name") or patient_name

                tasks = []

                # ── Send to patient ──────────────────────────────────────────
                if patient_phone:
                    tasks.append(send_appointment_reminder(
                        phone=patient_phone,
                        recipient_name=patient_name,
                        doctor_name=doctor_display,
                        time_str=time_display,
                        jitsi_link=meet_link,
                    ))
                else:
                    print(f"[Meet Reminder] ⚠️ No patient phone for appt {appt['id']}")

                # ── Send to doctor ───────────────────────────────────────────
                if doctor_wa:
                    tasks.append(send_appointment_reminder(
                        phone=doctor_wa,
                        recipient_name=f"Dr. {doctor_display}",
                        doctor_name=doctor_display,
                        time_str=time_display,
                        jitsi_link=meet_link,
                    ))
                else:
                    print(f"[Meet Reminder] ⚠️ Doctor has no whatsapp_number — skipping doctor reminder")

                if tasks:
                    await asyncio.gather(*tasks, return_exceptions=True)

                # Mark reminder sent
                supabase.table("appointments").update({"reminder_sent": True}).eq("id", appt["id"]).execute()
                print(f"[Meet Reminder] ✅ Reminder sent for appointment {appt['id']}")
            except Exception as e:
                print(f"[Meet Reminder] ❌ Error for appt {appt.get('id')}: {e}")

        async def _run():
            await asyncio.gather(*[_remind(a) for a in appts], return_exceptions=True)

        asyncio.run(_run())

    except _NETWORK_ERRORS as e:
        print(f"[Meet Reminder] ⚠️ Network error: {type(e).__name__}")
    except Exception as e:
        import traceback
        print(f"[Meet Reminder] ❌ Error: {e}")
        traceback.print_exc()


def sweep_undecided_lead_nudges():
    """
    Sends a 24-hour check-in nudge to NEW/FOLLOWUP_SENT leads
    who haven't had a WhatsApp message in the last 24 hours.
    Runs once per day at 10:00 AM IST.
    """
    import asyncio
    try:
        supabase: Client = get_supabase_client()
        now = datetime.datetime.now(datetime.timezone.utc)
        cutoff = (now - datetime.timedelta(hours=24)).isoformat()

        res = supabase.table("leads").select(
            "id, name, phone_number, metadata"
        ).in_("status", ["NEW", "FOLLOWUP_SENT"]).eq(
            "whatsapp_opt_out", False
        ).is_("whatsapp_followup_at", "null").limit(50).execute()

        leads = res.data or []
        if not leads:
            return

        # Filter to only leads whose last WA message was > 24h ago
        lead_ids = [l["id"] for l in leads]
        recent_msg_res = supabase.table("whatsapp_messages").select(
            "lead_id, created_at"
        ).in_("lead_id", lead_ids).gte("created_at", cutoff).execute()

        recently_active_ids = {m["lead_id"] for m in (recent_msg_res.data or [])}
        stale_leads = [l for l in leads if l["id"] not in recently_active_ids]

        if not stale_leads:
            return

        print(f"[WA 24h Nudge] Sending nudges to {len(stale_leads)} stale leads")

        async def _nudge(lead):
            try:
                from services.whatsapp_service import send_whatsapp_text
                phone = lead.get("phone_number", "")
                if not phone:
                    return
                name = lead.get("name") or "aap"
                msg = (
                    f"Namaste {name}! 🙏\n\n"
                    "Genestac Therapeutics se Aalya bol rahi hu.\n\n"
                    "Kya aapke koi sawaal hain hamare GLP-1 program ke baare mein? "
                    "Ya kya aap ek FREE doctor consultation book karna chahenge? 🩺\n\n"
                    "Bas reply karein — main yahan hu!"
                )
                await send_whatsapp_text(phone, msg)
                print(f"[WA 24h Nudge] ✅ Nudge sent to {lead['id']}")
            except Exception as e:
                print(f"[WA 24h Nudge] ❌ Error for lead {lead.get('id')}: {e}")

        async def _run():
            await asyncio.gather(*[_nudge(l) for l in stale_leads], return_exceptions=True)

        asyncio.run(_run())

    except _NETWORK_ERRORS as e:
        print(f"[WA 24h Nudge] ⚠️ Network error: {type(e).__name__}")
    except Exception as e:
        import traceback
        print(f"[WA 24h Nudge] ❌ Error: {e}")
        traceback.print_exc()


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
        # Check expired subscriptions every hour
        scheduler.add_job(check_expired_subscriptions, 'interval', hours=1, id="check_expired_subs", replace_existing=True)
        # Check subscriber engagement (reminder/motivation) every minute, fires at configured send_time
        scheduler.add_job(sweep_subscriber_engagement, 'interval', minutes=1, id="subscriber_engagement_sweep", replace_existing=True)
        # Background task to geocode lead cities for the heatmap
        scheduler.add_job(geocode_missing_cities, 'interval', hours=1, id="geocode_cities_sweep", replace_existing=True)
        # AI Health Coach daily nudges — sends personalised check-in messages to mobile subscribers
        scheduler.add_job(sweep_ai_health_coach_nudges, 'interval', minutes=1, id="ai_health_coach_nudges", replace_existing=True)
        # ── NEW: WhatsApp Follow-up & Meet Reminder Sweeps ─────────────────────
        # Send follow-up WhatsApp to leads who said "talk later" (checks every minute)
        scheduler.add_job(sweep_whatsapp_followups, 'interval', minutes=1, id="wa_followup_sweep", replace_existing=True)
        # Send Google Meet 10-min reminders (checks every minute)
        scheduler.add_job(sweep_meet_reminders, 'interval', minutes=1, id="meet_reminder_sweep", replace_existing=True)
        # 24-hour nudge for undecided NEW leads (runs daily at 10:00 AM IST)
        scheduler.add_job(
            sweep_undecided_lead_nudges, 'cron',
            hour=4, minute=30,  # 10:00 AM IST = 04:30 UTC
            id="undecided_lead_nudge",
            replace_existing=True,
        )
        scheduler.start()
        print("Started Background Scheduler for AI Voice Calling, WhatsApp Follow-ups, and Meet Reminders.")

