import os
import requests
from core.config import settings

EXOTEL_SID = os.environ.get("EXOTEL_SID", "")
EXOTEL_TOKEN = os.environ.get("EXOTEL_TOKEN", "")
EXOTEL_SUBDOMAIN = os.environ.get("EXOTEL_SUBDOMAIN", "api.exotel.com")

def initiate_ai_call(from_number: str, to_number: str, lead_id: str):
    """
    Initiates a call using Exotel API. 
    The call connects the customer to a custom TwiML/ExoML endpoint for WebSockets.
    """
    from db.supabase import get_supabase_client
    supabase = get_supabase_client()
    
    settings_res = supabase.table("global_settings").select("settings_value").eq("settings_key", "ai_call_settings").execute()
    ai_settings = settings_res.data[0]["settings_value"] if settings_res.data else {}
    
    sid = ai_settings.get("exotel_sid") or os.environ.get("EXOTEL_SID", "")
    token = ai_settings.get("exotel_api_token") or os.environ.get("EXOTEL_TOKEN", "")
    api_key = ai_settings.get("exotel_api_key") or os.environ.get("EXOTEL_API_KEY") or sid
    subdomain = ai_settings.get("exotel_subdomain") or os.environ.get("EXOTEL_SUBDOMAIN", "api.exotel.com")

    if not sid or not token or not api_key:
        print("EXOTEL credentials not found.")
        return None

    url = f"https://{api_key}:{token}@{subdomain}/v1/Accounts/{sid}/Calls/connect.json"
    
    app_id = ai_settings.get("exotel_app_id") or os.environ.get("EXOTEL_APP_ID", "1286769")

    # CustomField is used to pass lead_id so the webhook knows who it is
    payload = {
        "From": to_number,
        "CallerId": from_number,
        "CustomField": str(lead_id),
        # Exotel connects the call to this Applet (Voicebot) which handles the WebSocket
        "Url": f"http://my.exotel.com/{sid}/exoml/start_voice/{app_id}",
        "Record": "true"
    }

    print(f"Initiating Exotel Call with payload: {payload}")

    try:
        response = requests.post(url, data=payload)
        response.raise_for_status()
        return response.json()
    except Exception as e:
        print(f"Exotel call failed: {e}")
        if hasattr(e, 'response') and e.response is not None:
            print(f"Exotel response: {e.response.text}")
        return None
