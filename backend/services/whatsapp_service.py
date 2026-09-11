import os
import httpx

WHATSAPP_API_URL = "https://graph.facebook.com/v25.0"


# ---------------------------------------------------------------------------
# Universal trigger-based sender
# Looks up template + variable_map from DB, auto-fills variables from context.
# ---------------------------------------------------------------------------

async def send_trigger(trigger_key: str, context: dict, phone: str, supabase=None) -> dict:
    """
    Send a WhatsApp message using the template mapped to `trigger_key`.

    Args:
        trigger_key: e.g. "appointment_new_request"
        context: dict of data available for this event, e.g. {"doctor_name": "Harsh", ...}
        phone: recipient phone number
        supabase: optional Supabase client (imported lazily if not provided)

    The variable_map stored in template_triggers drives which context field
    fills which {{N}} placeholder. Order is determined by `position`.
    """
    try:
        if supabase is None:
            from db.supabase import get_supabase_client
            supabase = get_supabase_client()

        # Fetch trigger + linked template
        trig_res = supabase.table("template_triggers").select(
            "trigger_key, template_id, variable_map, is_active, "
            "whatsapp_templates!template_triggers_template_id_fkey(name, language)"
        ).eq("trigger_key", trigger_key).single().execute()

        if not trig_res.data:
            print(f"[send_trigger] No trigger found for key: {trigger_key}")
            return {"error": "trigger_not_found"}

        trigger = trig_res.data
        if not trigger.get("is_active"):
            print(f"[send_trigger] Trigger {trigger_key} is inactive — skipping")
            return {"skipped": "inactive"}

        template_info = trigger.get("whatsapp_templates") or {}
        template_name = template_info.get("name")
        language = template_info.get("language", "en")

        if not template_name:
            print(f"[send_trigger] Trigger {trigger_key} has no linked template")
            return {"error": "no_template_linked"}

        # Parse variable_map
        import json as _json
        variable_map = trigger.get("variable_map") or []
        if isinstance(variable_map, str):
            try:
                variable_map = _json.loads(variable_map)
            except Exception:
                variable_map = []

        # Sort by position, build parameters list
        variable_map_sorted = sorted(variable_map, key=lambda x: x.get("position", 0))
        parameters = []
        for mapping in variable_map_sorted:
            field = mapping.get("field", "")
            value = str(context.get(field, ""))
            parameters.append({"type": "text", "text": value or "—"})

        components = []
        if parameters:
            components.append({"type": "body", "parameters": parameters})

        return await send_whatsapp_template(phone, template_name, language, components)

    except Exception as e:
        print(f"[send_trigger] Error for {trigger_key} → {phone}: {e}")
        return {"error": str(e)}


# ---------------------------------------------------------------------------
# Named template senders — each maps to a specific Meta-approved template.
# Using templates lets us send outside the free 24-hour customer-care window.
# ---------------------------------------------------------------------------

async def send_appointment_request_to_doctor(
    doctor_phone: str,
    doctor_name: str,
    patient_name: str,
    date_time: str,
    jitsi_link: str,
) -> dict:
    """Template: appointment_new_request → sent to doctor when patient books."""
    components = [
        {
            "type": "body",
            "parameters": [
                {"type": "text", "text": doctor_name},
                {"type": "text", "text": patient_name},
                {"type": "text", "text": date_time},
                {"type": "text", "text": jitsi_link},
            ],
        }
    ]
    return await send_whatsapp_template(
        doctor_phone, "appointment_new_request", "en", components
    )


async def send_appointment_confirmed_to_patient(
    patient_phone: str,
    patient_name: str,
    doctor_name: str,
    date_time: str,
    jitsi_link: str,
) -> dict:
    """Template: appointment_confirmed_patient → sent to patient when doctor confirms."""
    components = [
        {
            "type": "body",
            "parameters": [
                {"type": "text", "text": patient_name},
                {"type": "text", "text": doctor_name},
                {"type": "text", "text": date_time},
                {"type": "text", "text": jitsi_link},
            ],
        }
    ]
    return await send_whatsapp_template(
        patient_phone, "appointment_confirmed_patient", "en", components
    )


async def send_appointment_reminder(
    phone: str,
    recipient_name: str,
    doctor_name: str,
    time_str: str,
    jitsi_link: str,
) -> dict:
    """Template: appointment_reminder_10min → sent to doctor + patient 10 min before."""
    components = [
        {
            "type": "body",
            "parameters": [
                {"type": "text", "text": recipient_name},
                {"type": "text", "text": doctor_name},
                {"type": "text", "text": time_str},
                {"type": "text", "text": jitsi_link},
            ],
        }
    ]
    return await send_whatsapp_template(
        phone, "appointment_reminder_10min", "en", components
    )


async def send_daily_crm_report_template(
    phone: str,
    date: str,
    new_leads: int,
    consultations_booked: int,
    consultations_done: int,
    orders: int,
    revenue: str,
    pending_actions: str,
) -> dict:
    """Template: crm_daily_status_update → sent to admins for daily report.
    Works outside 24-hour window (template-based, not session message)."""
    components = [
        {
            "type": "header",
            "parameters": [{"type": "text", "text": date}],
        },
        {
            "type": "body",
            "parameters": [
                {"type": "text", "text": str(new_leads)},
                {"type": "text", "text": str(consultations_booked)},
                {"type": "text", "text": str(consultations_done)},
                {"type": "text", "text": str(orders)},
                {"type": "text", "text": revenue},
                {"type": "text", "text": pending_actions or "None"},
            ],
        },
    ]
    return await send_whatsapp_template(
        phone, "crm_daily_status_update", "en", components
    )


async def send_whatsapp_template(phone_number: str, template_name: str, language_code: str = "en_US", components: list = None):
    """
    Sends a WhatsApp template message using Meta Cloud API.
    """
    token = os.getenv("WHATSAPP_TOKEN")
    phone_number_id = os.getenv("WHATSAPP_PHONE_NUMBER_ID")
    
    if not token or not phone_number_id:
        print("WhatsApp credentials not found in environment.")
        return {"error": "Missing credentials"}
        
    url = f"{WHATSAPP_API_URL}/{phone_number_id}/messages"
    
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    
    # Strip any formatting like + or spaces from phone
    clean_phone = ''.join(filter(str.isdigit, phone_number))
    
    payload = {
        "messaging_product": "whatsapp",
        "to": clean_phone,
        "type": "template",
        "template": {
            "name": template_name,
            "language": {
                "code": language_code
            }
        }
    }
    
    if components:
        payload["template"]["components"] = components
        
    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(url, headers=headers, json=payload, timeout=10.0)
            response.raise_for_status()
            return response.json()
        except Exception as e:
            if hasattr(e, 'response') and e.response is not None:
                print(f"WhatsApp API Error: {e} - Body: {e.response.text}")
            else:
                print(f"WhatsApp API Error: {e}")
            return {"error": str(e)}

async def sync_templates_from_meta():
    """
    Fetches all approved templates from Meta and returns them.
    """
    token = os.getenv("WHATSAPP_TOKEN")
    waba_id = os.getenv("WHATSAPP_BUSINESS_ACCOUNT_ID")
    
    if not token or not waba_id:
        return {"error": "Missing WHATSAPP_BUSINESS_ACCOUNT_ID or Token"}
        
    url = f"{WHATSAPP_API_URL}/{waba_id}/message_templates?limit=1000"
    
    headers = {
        "Authorization": f"Bearer {token}",
    }
    
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(url, headers=headers, timeout=10.0)
            response.raise_for_status()
            return response.json()
        except Exception as e:
            print(f"Meta Template Sync Error: {e}")
            return {"error": str(e)}

async def send_whatsapp_text(phone_number: str, text: str):
    """
    Sends a standard text message.
    """
    token = os.getenv("WHATSAPP_TOKEN")
    phone_number_id = os.getenv("WHATSAPP_PHONE_NUMBER_ID")
    
    if not token or not phone_number_id:
        return {"error": "Missing credentials"}
        
    url = f"{WHATSAPP_API_URL}/{phone_number_id}/messages"
    
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    
    clean_phone = ''.join(filter(str.isdigit, phone_number))
    
    payload = {
        "messaging_product": "whatsapp",
        "to": clean_phone,
        "type": "text",
        "text": {
            "body": text
        }
    }
    
    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(url, headers=headers, json=payload, timeout=10.0)
            response.raise_for_status()
            return response.json()
        except Exception as e:
            print(f"WhatsApp API Error (Text): {e}")
            return {"error": str(e)}

async def send_whatsapp_interactive(phone_number: str, interactive_payload: dict):
    """
    Sends an interactive message (list or buttons).
    """
    token = os.getenv("WHATSAPP_TOKEN")
    phone_number_id = os.getenv("WHATSAPP_PHONE_NUMBER_ID")
    
    if not token or not phone_number_id:
        return {"error": "Missing credentials"}
        
    url = f"{WHATSAPP_API_URL}/{phone_number_id}/messages"
    
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    
    clean_phone = ''.join(filter(str.isdigit, phone_number))
    
    payload = {
        "messaging_product": "whatsapp",
        "to": clean_phone,
        "type": "interactive",
        "interactive": interactive_payload
    }
    
    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(url, headers=headers, json=payload, timeout=10.0)
            response.raise_for_status()
            return response.json()
        except Exception as e:
            print(f"WhatsApp API Error (Interactive): {e}")
            return {"error": str(e)}
