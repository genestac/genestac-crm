import os
import datetime
from apscheduler.schedulers.background import BackgroundScheduler
from db.supabase import get_supabase_client
from supabase import Client
from services.exotel_service import initiate_ai_call

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
        return True # Default to true if no restrictions

    for window in windows:
        if current_day in window.get("days", []):
            start = window.get("start", "00:00")
            end = window.get("end", "23:59")
            if start <= current_time_str <= end:
                return True
    return False

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
        
        if not enabled_statuses or not exotel_number:
            return
            
        if not is_within_calling_window(windows):
            print(f"[AI Voice Scheduler] Outside calling window. Skipping sweep.")
            return
            
        # 2. Fetch leads in enabled statuses
        leads_res = supabase.table("leads").select("id, phone").in_("status", enabled_statuses).execute()
        leads = leads_res.data
        
        if not leads:
            return
            
        # 3. For each lead, check if we already called them today
        for lead in leads:
            # We don't want to spam. Only 1 AI call per lead per day for now.
            today = datetime.datetime.now().date().isoformat()
            logs_res = supabase.table("ai_call_logs").select("id").eq("lead_id", lead["id"]).gte("created_at", today).execute()
            
            if len(logs_res.data) == 0:
                print(f"[AI Voice Scheduler] Triggering call for lead {lead['id']} ({lead['phone']})")
                
                # Log intent to call
                log_res = supabase.table("ai_call_logs").insert({
                    "lead_id": lead["id"],
                    "status": "initiating"
                }).execute()
                
                call_log_id = log_res.data[0]["id"]
                
                # Trigger call
                exotel_res = initiate_ai_call(from_number=exotel_number, to_number=lead["phone"], lead_id=lead["id"])
                
                if exotel_res and "Call" in exotel_res:
                    call_sid = exotel_res["Call"].get("Sid")
                    supabase.table("ai_call_logs").update({"call_sid": call_sid, "status": "ringing"}).eq("id", call_log_id).execute()
                else:
                    supabase.table("ai_call_logs").update({"status": "failed_to_initiate"}).eq("id", call_log_id).execute()
                
    except Exception as e:
        print(f"[AI Voice Scheduler Error]: {e}")

def start_scheduler():
    if not scheduler.running:
        scheduler.add_job(sweep_leads_for_auto_call, 'interval', minutes=5, id="ai_voice_sweep", replace_existing=True)
        scheduler.start()
        print("Started Background Scheduler for AI Voice Calling.")
