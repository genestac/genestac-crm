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

    Handles two flows:
      1. Direct Exotel / Pipecat calls: CustomField = lead_id or appointment_id
      2. Sarvam-managed calls: CustomField is absent — fall back to CallSid lookup
    """
    target_id = appointment_id or CustomField
    logger.warning(
        f"[Exotel Webhook] CallSid={CallSid}, Status={Status}, "
        f"RecordingUrl={RecordingUrl}, TargetId={target_id}"
    )

    supabase = get_supabase_client()

    # ── Path 1: target_id present (direct Exotel / Pipecat flow) ─────────────
    if target_id:
        if RecordingUrl:
            logger.warning(f"[Exotel Webhook] Launching background task for {target_id}")
            background_tasks.add_task(process_call_recording, target_id, RecordingUrl)
        else:
            logger.warning(
                f"[Exotel Webhook] No recording URL for {target_id}. "
                "Likely missed or too short. Logging to DB."
            )
            content = (
                "**📞 Call Ended**\n\n"
                "The call was completed but no recording was generated "
                "(likely missed or too short)."
            )
            try:
                res = supabase.table("appointments").select("*").eq("id", target_id).execute()
                if res.data:
                    appt = res.data[0]
                    patient_id = appt.get("patient_id")
                    if patient_id and str(patient_id) != "null":
                        supabase.table("communications").insert({
                            "lead_id": patient_id,
                            "type": "call",
                            "content": content
                        }).execute()
                    else:
                        import datetime
                        existing_notes = appt.get("notes") or ""
                        new_notes = (
                            existing_notes + "\n\n"
                            + f"[{datetime.datetime.now().strftime('%Y-%m-%d %H:%M')}] "
                            + f"Note added:\n{content}"
                        )
                        supabase.table("appointments").update(
                            {"notes": new_notes.strip()}
                        ).eq("id", target_id).execute()
                else:
                    # CustomField is a patient/lead ID directly
                    supabase.table("communications").insert({
                        "lead_id": target_id,
                        "type": "call",
                        "content": content
                    }).execute()

                    # Update ai_call_logs for AI voice calls
                    if CallSid:
                        _update_ai_call_log(
                            supabase, CallSid, Status, RecordingUrl,
                            target_id, background_tasks
                        )

            except Exception as e:
                logger.error(f"[Exotel Webhook] Failed to log missed call: {e}")

    # ── Path 2: No target_id — Sarvam-managed call, use CallSid fallback ─────
    else:
        if not CallSid:
            logger.warning("[Exotel Webhook] Skipping: both TargetId and CallSid are missing!")
            return {"status": "success"}

        logger.warning(
            f"[Exotel Webhook] No target_id — Sarvam fallback via CallSid={CallSid}"
        )

        log_res = supabase.table("ai_call_logs").select("id, status, lead_id").eq("call_sid", CallSid).execute()

        if log_res.data:
            row = log_res.data[0]
            lead_id = row.get("lead_id") or ""
            _update_ai_call_log(
                supabase, CallSid, Status, RecordingUrl,
                lead_id, background_tasks, log_row=row
            )
        else:
            # No log row — Sarvam call not tracked in our CRM yet; preserve the recording.
            logger.warning(
                f"[Exotel Webhook] No ai_call_logs row for CallSid={CallSid}. "
                "Creating orphan log to preserve recording."
            )
            if RecordingUrl:
                mapped = _map_exotel_status((Status or "").lower())
                supabase.table("ai_call_logs").insert({
                    "call_sid": CallSid,
                    "status": mapped,
                    "recording_url": RecordingUrl,
                    "provider": "sarvam",
                }).execute()

    return {"status": "success"}


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _map_exotel_status(exotel_status: str) -> str:
    """Map Exotel status strings to our internal ai_call_logs status values."""
    mapping = {
        "no-answer":   "no_answer",
        "canceled":    "no_answer",
        "failed":      "failed",
        "busy":        "busy",
        "completed":   "completed",
        "in-progress": "in_progress",
    }
    return mapping.get(exotel_status, exotel_status.replace("-", "_"))


def _update_ai_call_log(
    supabase,
    call_sid: str,
    raw_status: Optional[str],
    recording_url: Optional[str],
    lead_id: str,
    background_tasks: BackgroundTasks,
    log_row: Optional[dict] = None,
):
    """
    Core update for ai_call_logs after an Exotel callback.
    Works for both direct-Exotel and Sarvam-managed calls.
    """
    try:
        exotel_status = (raw_status or "").lower()

        if log_row is None:
            res = supabase.table("ai_call_logs").select("id, status").eq("call_sid", call_sid).execute()
            log_row = res.data[0] if res.data else None

        if not log_row:
            logger.warning(f"[Exotel Webhook] No ai_call_logs row for CallSid={call_sid}")
            return

        log_id = log_row["id"]
        current_status = log_row.get("status", "")
        update_data: dict = {}

        if exotel_status in ("no-answer", "canceled", "failed", "busy"):
            update_data["status"] = _map_exotel_status(exotel_status)
            if lead_id:
                supabase.table("users").update({"status": "CONTACT_ATTEMPTED"}).eq("id", lead_id).execute()
                supabase.table("leads").update({"status": "CONTACT_ATTEMPTED"}).eq("id", lead_id).execute()

        elif exotel_status == "completed" and current_status in ("ringing", "initiating", "in_progress"):
            update_data["status"] = "completed"

        if recording_url:
            update_data["recording_url"] = recording_url

        if update_data:
            supabase.table("ai_call_logs").update(update_data).eq("id", log_id).execute()
            logger.warning(f"[Exotel Webhook] Updated ai_call_logs id={log_id}: {update_data}")

        # ── Notification ─────────────────────────────────────────────────────
        try:
            from services.notification_service import notify_call_completed
            lead_name_res = supabase.table("leads").select("name").eq("id", lead_id).execute()
            if not lead_name_res.data:
                lead_name_res = supabase.table("users").select("name").eq("id", lead_id).execute()
            _lname = (lead_name_res.data[0].get("name") or "Lead") if lead_name_res.data else "Lead"
            final_status = update_data.get("status", raw_status or "completed")
            background_tasks.add_task(notify_call_completed, supabase, _lname, lead_id, final_status)
        except Exception as ne:
            logger.error(f"[Exotel Webhook] Notification error: {ne}")

        # ── Queue status update ──────────────────────────────────────────────
        try:
            q_res = supabase.table("global_settings").select("*").eq("settings_key", "ai_call_queue").execute()
            if q_res.data:
                queue = q_res.data[0]["settings_value"] or []
                for qi in queue:
                    if qi.get("call_sid") == call_sid or qi.get("call_log_id") == log_id:
                        if exotel_status in ("no-answer", "canceled", "failed", "busy"):
                            qi["status"] = "not_picked"
                        elif exotel_status == "completed":
                            qi["status"] = "in_call"
                        break
                supabase.table("global_settings").upsert(
                    {"settings_key": "ai_call_queue", "settings_value": queue},
                    on_conflict="settings_key"
                ).execute()
        except Exception as qe:
            logger.error(f"[Exotel Webhook] Failed to update queue status: {qe}")

    except Exception as e:
        logger.error(f"[Exotel Webhook] _update_ai_call_log error: {e}")
