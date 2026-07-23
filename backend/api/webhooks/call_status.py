import logging
from fastapi import APIRouter, Form, Request, BackgroundTasks
from typing import Optional
from services.audio_tasks import process_call_recording
from db.supabase import get_supabase_client

logger = logging.getLogger(__name__)
router = APIRouter()

@router.post("/call-status")
async def exotel_call_status(
    request: Request,
    background_tasks: BackgroundTasks,
    appointment_id: Optional[str] = None,
    CallSid: Optional[str] = Form(None),
    Status: Optional[str] = Form(None),
    RecordingUrl: Optional[str] = Form(None),
    CustomField: Optional[str] = Form(None),
):
    """
    Webhook to receive status callbacks from Exotel when a call ends.
    """
    target_id = appointment_id or CustomField
    logger.warning(f"[Exotel Webhook] CallSid={CallSid}, Status={Status}, RecordingUrl={RecordingUrl}, TargetId={target_id}")
    
    if target_id:
        if RecordingUrl:
            logger.warning(f"[Exotel Webhook] Launching background task for {target_id}")
            background_tasks.add_task(process_call_recording, target_id, RecordingUrl)
        else:
            logger.warning(f"[Exotel Webhook] No recording URL provided for {target_id}. Likely missed or too short. Logging to DB.")
            # We must log it so the frontend auto-dismissal detects a change!
            content = f"**📞 Call Ended**\n\nThe call was completed but no recording was generated (likely missed or too short)."
            try:
                supabase = get_supabase_client()
                # Check if it's an appointment ID or a patient ID
                res = supabase.table('appointments').select('*').eq('id', target_id).execute()
                if res.data:
                    appt = res.data[0]
                    patient_id = appt.get('patient_id')
                    if patient_id and str(patient_id) != 'null':
                        supabase.table("communications").insert({
                            "lead_id": patient_id,
                            "type": "call",
                            "content": content
                        }).execute()
                    else:
                        existing_notes = appt.get('notes') or ""
                        import datetime
                        new_notes = existing_notes + "\n\n" + f"[{datetime.datetime.now().strftime('%Y-%m-%d %H:%M')}] Note added:\n" + content
                        supabase.table('appointments').update({'notes': new_notes.strip()}).eq('id', target_id).execute()
                else:
                    # Maybe CustomField is a patient ID directly
                    supabase.table("communications").insert({
                        "lead_id": target_id,
                        "type": "call",
                        "content": content
                    }).execute()

                    # Also update ai_call_logs if this was an AI voice call
                    if CallSid:
                        log_res = supabase.table("ai_call_logs").select("id, status").eq("call_sid", CallSid).execute()
                        if log_res.data:
                            current_status = log_res.data[0]["status"]
                            exotel_status = Status.lower() if Status else "completed"
                            update_data = {}
                            if exotel_status in ["no-answer", "canceled", "failed", "busy"]:
                                mapped_status = exotel_status.replace("-", "_")
                                if mapped_status == "canceled":
                                    mapped_status = "no_answer"
                                update_data["status"] = mapped_status
                                
                                # Update CRM lead status to 'CONTACT_ATTEMPTED' since they didn't pick up
                                supabase.table("users").update({"status": "CONTACT_ATTEMPTED"}).eq("id", target_id).execute()
                                supabase.table("leads").update({"status": "CONTACT_ATTEMPTED"}).eq("id", target_id).execute()
                                
                            elif exotel_status == "completed" and current_status in ["ringing", "initiating"]:
                                update_data["status"] = "completed"
                            
                            if update_data:
                                supabase.table("ai_call_logs").update(update_data).eq("id", log_res.data[0]["id"]).execute()

                            # --- Update queue item status ---
                            try:
                                q_res = supabase.table("global_settings").select("*").eq("settings_key", "ai_call_queue").execute()
                                if q_res.data:
                                    queue = q_res.data[0]["settings_value"] or []
                                    for qi in queue:
                                        if qi.get("call_sid") == CallSid or qi.get("call_log_id") == log_res.data[0]["id"]:
                                            if exotel_status in ["no-answer", "canceled", "failed", "busy"]:
                                                qi["status"] = "not_picked"
                                            elif exotel_status == "completed":
                                                qi["status"] = "in_call"
                                            break
                                    supabase.table("global_settings").upsert({"settings_key": "ai_call_queue", "settings_value": queue}, on_conflict="settings_key").execute()
                            except Exception as qe:
                                logger.error(f"[Exotel Webhook] Failed to update queue status: {qe}")

            except Exception as e:
                logger.error(f"[Exotel Webhook] Failed to log missed call: {e}")
    else:
        logger.warning(f"[Exotel Webhook] Skipping task: TargetId is missing!")

    return {"status": "success"}
