import os
import json
import requests
from db.supabase import get_supabase_client


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
    Initiates an AI outbound call using Exotel API.
    The call connects the customer to a custom TwiML/ExoML endpoint for WebSockets.
    """
    creds = _get_exotel_creds()
    sid, token, api_key, subdomain = creds["sid"], creds["token"], creds["api_key"], creds["subdomain"]
    app_id = creds["app_id"]

    if not sid or not token or not api_key:
        print("EXOTEL credentials not found.")
        return None

    url = f"https://{api_key}:{token}@{subdomain}/v1/Accounts/{sid}/Calls/connect.json"
    payload = {
        "From": to_number,
        "CallerId": from_number,
        "CustomField": str(lead_id),
        "Url": f"http://my.exotel.com/{sid}/exoml/start_voice/{app_id}",
        "Record": "true",
    }

    print(f"Initiating Exotel Call with payload: {payload}")
    try:
        response = requests.post(url, data=payload)
        response.raise_for_status()
        return response.json()
    except Exception as e:
        print(f"Exotel call failed: {e}")
        if hasattr(e, "response") and e.response is not None:
            print(f"Exotel response: {e.response.text}")
        return None


def call_doctor_into_conference(
    doctor_phone: str,
    conference_name: str,
    base_url: str,
) -> bool:
    """
    Calls the doctor's phone number and connects them into a named conference room.

    Exotel will call `doctor_phone` and, when the doctor answers, serve them the
    conference ExoML from `base_url/api/webhooks/exotel/conference-exoml?room=<name>`.
    """
    creds = _get_exotel_creds()
    sid, token, api_key, subdomain, number = (
        creds["sid"], creds["token"], creds["api_key"], creds["subdomain"], creds["number"]
    )

    if not all([sid, token, api_key, number]):
        print("[Doctor Handoff] Exotel credentials incomplete — cannot call doctor.")
        return False

    conference_exoml_url = f"{base_url}/api/webhooks/exotel/conference-exoml?room={conference_name}"
    url = f"https://{api_key}:{token}@{subdomain}/v1/Accounts/{sid}/Calls/connect.json"

    payload = {
        "From": doctor_phone,          # Exotel calls the doctor
        "CallerId": number,             # Caller ID shown to doctor = our Exotel number
        "Url": conference_exoml_url,    # ExoML that joins the conference
        "Record": "false",
    }

    print(f"[Doctor Handoff] Calling doctor {doctor_phone} into conference '{conference_name}'")
    try:
        resp = requests.post(url, data=payload, timeout=10)
        resp.raise_for_status()
        print(f"[Doctor Handoff] Doctor call initiated: {resp.json()}")
        return True
    except Exception as e:
        print(f"[Doctor Handoff] Failed to call doctor: {e}")
        return False


def redirect_call_to_conference(
    call_sid: str,
    conference_name: str,
    base_url: str,
) -> bool:
    """
    Redirects the user's live Exotel call to a conference room, removing Gemini from the call.

    Uses Exotel's Call Update API: POST /v1/Accounts/{sid}/Calls/{call_sid}
    with a new Url pointing to conference ExoML.
    """
    creds = _get_exotel_creds()
    sid, token, api_key, subdomain = (
        creds["sid"], creds["token"], creds["api_key"], creds["subdomain"]
    )

    if not all([sid, token, api_key, call_sid]):
        print("[Doctor Handoff] Cannot redirect call — missing call_sid or credentials.")
        return False

    conference_exoml_url = f"{base_url}/api/webhooks/exotel/conference-exoml?room={conference_name}"
    url = f"https://{api_key}:{token}@{subdomain}/v1/Accounts/{sid}/Calls/{call_sid}"

    print(f"[Doctor Handoff] Redirecting call {call_sid} to conference '{conference_name}'")
    try:
        resp = requests.post(url, data={"Url": conference_exoml_url}, timeout=10)
        resp.raise_for_status()
        print(f"[Doctor Handoff] Call redirected successfully: {resp.status_code}")
        return True
    except Exception as e:
        print(f"[Doctor Handoff] Failed to redirect call: {e}")
        if hasattr(e, "response") and e.response is not None:
            print(f"[Doctor Handoff] Exotel response: {e.response.text}")
        return False
