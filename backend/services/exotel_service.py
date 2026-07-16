import os
import logging
import requests
from db.supabase import get_supabase_client

logger = logging.getLogger(__name__)


def _get_exotel_creds() -> dict:
    """Load Exotel credentials from DB settings then fall back to env vars."""
    supabase = get_supabase_client()
    settings_res = (
        supabase.table("global_settings")
        .select("settings_value")
        .eq("settings_key", "ai_call_settings")
        .execute()
    )
    ai_settings = settings_res.data[0]["settings_value"] if settings_res.data else {}

    sid       = ai_settings.get("exotel_sid")       or os.environ.get("EXOTEL_SID", "")
    token     = ai_settings.get("exotel_api_token")  or os.environ.get("EXOTEL_TOKEN", "")
    api_key   = ai_settings.get("exotel_api_key")    or os.environ.get("EXOTEL_API_KEY") or sid
    subdomain = ai_settings.get("exotel_subdomain")  or os.environ.get("EXOTEL_SUBDOMAIN", "api.exotel.com")
    number    = ai_settings.get("exotel_number")     or os.environ.get("EXOTEL_NUMBER", "")
    app_id    = ai_settings.get("exotel_app_id")     or os.environ.get("EXOTEL_APP_ID", "")

    return {
        "sid": sid, "token": token, "api_key": api_key,
        "subdomain": subdomain, "number": number, "app_id": app_id,
    }


def initiate_ai_call(from_number: str, to_number: str, lead_id: str):
    """
    Initiates an AI outbound call using Exotel's connect.json API.
    - from_number: Exotel virtual number (caller ID)
    - to_number:   Customer's phone number (who gets called)

    Uses connect.json with the Exotel-hosted applet URL.
    The applet (configured in Exotel dashboard) streams audio to our
    WebSocket endpoint at wss://{ngrok}/api/webhooks/exotel/stream.

    NOTE: Calls.json returns 403 on this account — don't use it.
    """
    creds = _get_exotel_creds()
    sid, token, api_key, subdomain = creds["sid"], creds["token"], creds["api_key"], creds["subdomain"]
    app_id = creds["app_id"] or "1286769"   # Fallback to known working app ID

    if not sid or not token or not api_key:
        logger.error("EXOTEL credentials not found.")
        return None

    url = f"https://{api_key}:{token}@{subdomain}/v1/Accounts/{sid}/Calls/connect.json"
    
    backend_url = os.environ.get("BACKEND_PUBLIC_URL", "").rstrip("/")
    status_callback = f"{backend_url}/api/webhooks/exotel/call-status" if backend_url else ""

    payload = {
        "From": to_number,             # Customer's number (called first)
        "CallerId": from_number,        # Exotel virtual number (caller ID)
        "CustomField": str(lead_id),    # Passed to WebSocket stream's start event
        "Url": f"http://my.exotel.com/{sid}/exoml/start_voice/{app_id}",
        "Record": "true",
    }
    
    if status_callback:
        payload["StatusCallback"] = status_callback

    logger.warning(f"Initiating Exotel Call with payload: {payload}")
    try:
        response = requests.post(url, data=payload)
        response.raise_for_status()
        return response.json()
    except Exception as e:
        logger.error(f"Exotel call failed: {e}")
        if hasattr(e, "response") and e.response is not None:
            logger.error(f"Exotel response: {e.response.text}")
        return None


def bridge_doctor_and_customer(
    doctor_phone: str,
    customer_phone: str,
    base_url: str = "",
    custom_field: str = "",
) -> bool:
    """
    Uses Exotel's connect.json click-to-call bridge to connect doctor and customer.

    Flow:
      1. Exotel calls the doctor first (From=doctor_phone)
      2. When doctor answers, Exotel calls the customer (To=customer_phone)
      3. Both parties are bridged together

    This is the only transfer mechanism available on this Exotel account since
    Calls.json and Call Update API both return 403 "Method not allowed".
    """
    creds = _get_exotel_creds()
    sid       = creds["sid"]
    token     = creds["token"]
    api_key   = creds["api_key"]
    subdomain = creds["subdomain"]
    number    = creds["number"]

    if not all([sid, token, api_key, number]):
        logger.error("[Doctor Bridge] Missing Exotel credentials — cannot bridge.")
        return {"success": False, "error": "Missing Exotel credentials."}

    # Ensure phone numbers have country code
    if customer_phone and not customer_phone.startswith("+"):
        customer_phone = "+91" + customer_phone.lstrip("0")

    url = f"https://{api_key}:{token}@{subdomain}/v1/Accounts/{sid}/Calls/connect.json"
    payload = {
        "From": doctor_phone,      # Exotel calls doctor first
        "CallerId": number,         # Our Exotel number shown as caller ID to both parties
        "To": customer_phone,       # After doctor answers, Exotel calls customer & bridges
        "Record": "true",
    }
    
    if custom_field:
        payload["CustomField"] = str(custom_field)
        callback_url = f"{base_url.rstrip('/')}/api/webhooks/exotel/call-status?appointment_id={custom_field}"
    else:
        callback_url = f"{base_url.rstrip('/')}/api/webhooks/exotel/call-status"

    if base_url:
        payload["StatusCallback"] = callback_url


    logger.warning(
        f"[Doctor Bridge] Initiating bridge via connect.json: "
        f"doctor={doctor_phone}, customer={customer_phone}, callerId={number}"
    )
    try:
        resp = requests.post(url, data=payload, timeout=10)
        logger.warning(f"[Doctor Bridge] Response HTTP {resp.status_code}: {resp.text[:500]}")
        
        if resp.status_code != 200:
            error_msg = "Failed to initiate call via Exotel."
            try:
                data = resp.json()
                if "RestException" in data and "Message" in data["RestException"]:
                    error_msg = data["RestException"]["Message"]
            except Exception:
                pass
            return {"success": False, "error": error_msg}
            
        resp.raise_for_status()
        logger.warning(f"[Doctor Bridge] ✅ Bridge call initiated successfully")
        return {"success": True, "error": None}
    except Exception as e:
        logger.error(f"[Doctor Bridge] ❌ Failed to initiate bridge: {e}")
        error_msg = str(e)
        if hasattr(e, "response") and e.response is not None:
            logger.error(f"[Doctor Bridge] Error body: {e.response.text[:500]}")
            try:
                data = e.response.json()
                if "RestException" in data and "Message" in data["RestException"]:
                    error_msg = data["RestException"]["Message"]
            except Exception:
                pass
        return {"success": False, "error": error_msg}


def redirect_customer_to_doctor(
    call_sid: str,
    doctor_phone: str,
    base_url: str,
    exotel_number: str = "",
) -> bool:
    """
    Redirects the customer's live Exotel call directly to the doctor using
    a simple <Dial><Number> ExoML — no conference room needed.

    Exotel puts the customer on hold, calls the doctor, and bridges them
    together when the doctor picks up.

    Uses Exotel's Call Update API: POST /v1/Accounts/{sid}/Calls/{call_sid}
    with a new Url pointing to our dial-doctor ExoML endpoint.
    """
    creds = _get_exotel_creds()
    sid       = creds["sid"]
    token     = creds["token"]
    api_key   = creds["api_key"]
    subdomain = creds["subdomain"]
    caller_id = exotel_number or creds.get("number", "")

    logger.warning(
        f"[Doctor Handoff] redirect_customer_to_doctor called: "
        f"call_sid={call_sid!r}, doctor={doctor_phone!r}, "
        f"sid_set={bool(sid)}, token_set={bool(token)}, api_key_set={bool(api_key)}"
    )

    if not all([sid, token, api_key, call_sid]):
        logger.error(
            f"[Doctor Handoff] Cannot redirect — missing credentials or call_sid. "
            f"sid={bool(sid)}, token={bool(token)}, api_key={bool(api_key)}, call_sid={bool(call_sid)}"
        )
        return False

    dial_exoml_url = (
        f"{base_url}/api/webhooks/exotel/dial-doctor"
        f"?phone={doctor_phone}&caller_id={caller_id}"
    )
    url = f"https://{api_key}:{token}@{subdomain}/v1/Accounts/{sid}/Calls/{call_sid}"

    logger.warning(f"[Doctor Handoff] POST {url}")
    logger.warning(f"[Doctor Handoff] Dial ExoML URL: {dial_exoml_url}")
    try:
        resp = requests.post(url, data={"Url": dial_exoml_url}, timeout=10)
        logger.warning(f"[Doctor Handoff] Redirect response HTTP {resp.status_code}: {resp.text[:500]}")
        resp.raise_for_status()
        logger.warning(f"[Doctor Handoff] ✅ Customer call redirected to doctor {doctor_phone}")
        return True
    except Exception as e:
        logger.error(f"[Doctor Handoff] ❌ Redirect API call failed: {e}")
        if hasattr(e, "response") and e.response is not None:
            logger.error(f"[Doctor Handoff] Exotel error body: {e.response.text[:500]}")
        return False


# ── Legacy aliases — kept so older import sites don't break ──────────────────

def call_doctor_into_conference(doctor_phone: str, conference_name: str, base_url: str) -> bool:
    """DEPRECATED — now handled by redirect_customer_to_doctor()."""
    logger.warning("[Doctor Handoff] call_doctor_into_conference is deprecated — skipping.")
    return True  # No-op: doctor dialing is done via the redirect ExoML itself


def redirect_call_to_conference(call_sid: str, conference_name: str, base_url: str) -> bool:
    """DEPRECATED — use redirect_customer_to_doctor() instead."""
    logger.warning("[Doctor Handoff] redirect_call_to_conference is deprecated — skipping.")
    return False
