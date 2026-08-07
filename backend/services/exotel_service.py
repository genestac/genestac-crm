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


def _set_ai_provider(supabase, ai_settings: dict, new_provider: str):
    """Persist a provider switch back to global_settings so all future calls use it."""
    ai_settings["ai_provider"] = new_provider
    existing = supabase.table("global_settings").select("id").eq("settings_key", "ai_call_settings").execute()
    if existing.data:
        supabase.table("global_settings").update({"settings_value": ai_settings}).eq("settings_key", "ai_call_settings").execute()
    logger.warning(f"[AI Call] Provider switched → {new_provider} and saved to DB.")


def _set_calling_disabled(supabase, ai_settings: dict, disabled: bool):
    """Set ai_calling_disabled flag in global_settings to stop all auto-calling."""
    ai_settings["ai_calling_disabled"] = disabled
    existing = supabase.table("global_settings").select("id").eq("settings_key", "ai_call_settings").execute()
    if existing.data:
        supabase.table("global_settings").update({"settings_value": ai_settings}).eq("settings_key", "ai_call_settings").execute()
    state = "DISABLED" if disabled else "ENABLED"
    logger.warning(f"[AI Call] Calling service {state} and saved to DB.")


def initiate_ai_call(from_number: str, to_number: str, lead_id: str):
    """
    Routes the outbound call with automatic provider fallback:
      1. Try the configured provider (sarvam or pipecat/OpenAI).
      2. On failure → switch to the other provider, save to DB, retry once.
      3. Both fail → set ai_calling_disabled=True in DB and return None.
         The scheduler and all callers should check this flag before calling.
    """
    supabase = get_supabase_client()
    settings_res = supabase.table("global_settings").select("settings_value").eq("settings_key", "ai_call_settings").execute()
    ai_settings = settings_res.data[0]["settings_value"] if settings_res.data else {}

    # Hard-stop if service was disabled after both providers failed
    if ai_settings.get("ai_calling_disabled"):
        logger.warning("[AI Call] Service is disabled (both providers exhausted). Skipping call.")
        return None

    primary = ai_settings.get("ai_provider", "sarvam")
    fallback = "pipecat" if primary == "sarvam" else "sarvam"

    def _call(provider: str):
        logger.warning(f"[AI Call] Attempting with provider: {provider}")
        if provider == "pipecat":
            return _initiate_pipecat_call(from_number, to_number, lead_id)
        else:
            return _initiate_sarvam_call(to_number, lead_id, supabase)

    # ── Try primary provider ──────────────────────────────────────────────────
    result = _call(primary)
    if result is not None:
        return result

    # ── Primary failed → switch to fallback ──────────────────────────────────
    logger.warning(f"[AI Call] {primary} failed. Switching to fallback: {fallback}")
    _set_ai_provider(supabase, ai_settings, fallback)

    result = _call(fallback)
    if result is not None:
        return result

    # ── Both failed → disable the service ────────────────────────────────────
    logger.error("[AI Call] Both providers failed. Disabling AI calling service.")
    _set_calling_disabled(supabase, ai_settings, True)
    return None



def _initiate_pipecat_call(from_number: str, to_number: str, lead_id: str):
    """Legacy Exotel connect.json API for Genestac's internal Pipecat integration."""
    creds = _get_exotel_creds()
    sid, token, api_key, subdomain = creds["sid"], creds["token"], creds["api_key"], creds["subdomain"]
    app_id = creds["app_id"] or "1286769"

    if not sid or not token or not api_key:
        logger.error("EXOTEL credentials not found.")
        return None

    url = f"https://{api_key}:{token}@{subdomain}/v1/Accounts/{sid}/Calls/connect.json"
    backend_url = os.environ.get("BACKEND_PUBLIC_URL", "").rstrip("/")
    status_callback = f"{backend_url}/api/webhooks/exotel/call-status" if backend_url else ""

    payload = {
        "From": to_number,
        "CallerId": from_number,
        "CustomField": str(lead_id),
        "Url": f"http://my.exotel.com/{sid}/exoml/start_voice/{app_id}",
        "Record": "true",
    }
    if status_callback:
        payload["StatusCallback"] = status_callback

    logger.warning(f"Initiating Exotel (Pipecat) Call with payload: {payload}")
    try:
        response = requests.post(url, data=payload)
        response.raise_for_status()
        return response.json()
    except Exception as e:
        logger.error(f"Exotel call failed: {e}")
        return None


def _initiate_sarvam_call(to_number: str, lead_id: str, supabase):
    """Initiates an AI outbound call using Sarvam AI's Outbound Call API (v3).
    ALL credentials must be configured in the AI Voice Calling tab (admin settings).
    If any required field is missing, calling is stopped with a clear error.
    """
    # ── Load ONLY from global_settings (AI Voice Calling tab) ───────────────
    try:
        settings_res = supabase.table("global_settings").select("settings_value").eq("settings_key", "ai_call_settings").execute()
        ai_settings = settings_res.data[0]["settings_value"] if settings_res.data else {}
    except Exception as e:
        logger.error(f"[Sarvam] Failed to load AI calling settings from DB: {e}")
        return None

    api_key       = (ai_settings.get("sarvam_api_key") or "").strip()
    org_id        = (ai_settings.get("sarvam_org_id") or "").strip()
    workspace_id  = (ai_settings.get("sarvam_workspace_id") or "").strip()
    app_id        = (ai_settings.get("sarvam_app_id") or "").strip()
    app_version   = int(ai_settings.get("sarvam_app_version") or 3)
    connection_id = (ai_settings.get("sarvam_connection_id") or "").strip()
    agent_phone   = (ai_settings.get("sarvam_agent_phone") or "").strip()
    backend_url   = os.getenv("BACKEND_PUBLIC_URL", "")

    missing = [k for k, v in {
        "sarvam_api_key": api_key, "sarvam_org_id": org_id,
        "sarvam_workspace_id": workspace_id, "sarvam_app_id": app_id,
        "sarvam_connection_id": connection_id, "sarvam_agent_phone": agent_phone,
    }.items() if not v]
    if missing:
        logger.error(
            f"[Sarvam] ❌ Call BLOCKED — missing required fields in AI calling settings: {missing}. "
            "Go to Admin → AI Voice Calling tab and fill in all Sarvam AI Configuration fields."
        )
        return None

    if not all([api_key, org_id, workspace_id, app_id, connection_id, agent_phone]):
        logger.error("SARVAM credentials not found or incomplete.")
        return None

    # ── Lead details ─────────────────────────────────────────────────────────
    lead_name = "ji"
    lead_source_phrase = "humari website pe"
    call_disposition = "NEW"
    gender = ""
    src = ""

    try:
        u = supabase.table("users").select("name, source, status").eq("id", lead_id).execute()
        if u.data:
            row = u.data[0]
            lead_name        = row.get("name") or "ji"
            src              = (row.get("source") or "").lower()
            call_disposition = row.get("status") or "NEW"
        else:
            l = supabase.table("leads").select("name, source, status").eq("id", lead_id).execute()
            if l.data:
                row = l.data[0]
                lead_name        = row.get("name") or "ji"
                src              = (row.get("source") or "").lower()
                call_disposition = row.get("status") or "NEW"
    except Exception as e:
        logger.error(f"[Sarvam] Lead fetch error (non-fatal): {e}")

    try:
        gu = supabase.table("users").select("gender").eq("id", lead_id).execute()
        if gu.data:
            gender = gu.data[0].get("gender") or ""
    except Exception:
        gender = ""

    source_map = {
        "facebook": "Facebook pe", "instagram": "Instagram pe",
        "google": "Google pe", "website": "hamare website pe",
        "whatsapp": "WhatsApp pe", "referral": "apne ek jaankaar se",
    }
    for key, phrase in source_map.items():
        if key in src:
            lead_source_phrase = phrase
            break

    # Last call summary for context
    call_summary = ""
    try:
        mem = (
            supabase.table("lead_context_memory")
            .select("memory_text")
            .eq("lead_id", lead_id)
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        if mem.data:
            call_summary = (mem.data[0].get("memory_text") or "")[:500]
    except Exception:
        pass

    to_number = to_number.strip()
    if not to_number.startswith("+"):
        to_number = "+91" + to_number.lstrip("0")

    payload = {
        "app_config": {
            "app_id": app_id,
            "app_version": app_version,
            "app_type": "agent",
            "connection_config": {
                "connection_id": connection_id,
                "agent_phone_number": agent_phone,
            },
            "agent_variables": {
                "lead_id":            lead_id,
                "lead_name":          lead_name,
                "lead_source_phrase": lead_source_phrase,
                "call_disposition":   call_disposition,
                "call_summary":       call_summary,
                "company_name":       "Genestac",
                "gender":             gender,
            },
        },
        "user_config": {"user_phone_number": to_number},
    }

    if backend_url:
        payload["webhook_config"] = {
            "url": f"{backend_url}/api/webhooks/sarvam/post-call",
            "metadata": {"lead_id": lead_id},
        }

    url = f"https://apps.sarvam.ai/api/outbounds/v1/orgs/{org_id}/workspaces/{workspace_id}/outbounds"
    headers = {"Content-Type": "application/json", "X-API-Key": api_key}

    logger.warning(
        f"[Sarvam] Initiating outbound call v{app_version}: "
        f"to={to_number} lead={lead_id} name={lead_name!r} disposition={call_disposition!r}"
    )
    try:
        response = requests.post(url, json=payload, headers=headers)
        response.raise_for_status()
        data = response.json()
        return {"Call": {"Sid": data.get("attempt_id")}}
    except Exception as e:
        logger.error(f"[Sarvam] Call failed: {e}")
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
