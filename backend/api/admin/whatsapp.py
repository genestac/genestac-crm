from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Query
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timedelta, timezone
from supabase import Client
from db.supabase import get_supabase_client
from api.deps import get_current_user
from services.whatsapp_service import send_whatsapp_text, send_whatsapp_interactive
from services.exotel_service import initiate_ai_call
from services.openai_agent import process_whatsapp_message
from services.notification_service import notify_new_wa_message, notify_lead_abused

router = APIRouter()

def is_admin(user: dict, supabase: Client) -> bool:
    res = supabase.table("staffs").select("roles(name)").eq("id", user["id"]).execute()
    if not res.data:
        return False
    role_name = res.data[0].get("roles", {}).get("name", "")
    return role_name in ("superadmin", "master_admin", "admin")

class TemplateCreate(BaseModel):
    name: str
    content: str

class AutoResponderSettings(BaseModel):
    enabled: bool
    template_id: str | None = None

class AudienceFilter(BaseModel):
    statuses: Optional[List[str]] = None
    source_ids: Optional[List[str]] = None
    exclude_recently_contacted_days: Optional[int] = 7
    exclude_previous_campaigns_with_same_template: bool = True
    
class CampaignCreate(BaseModel):
    name: str
    template_id: str
    scheduled_time: Optional[datetime] = None
    audience_filter: AudienceFilter

@router.get('/templates')
async def get_templates(current_user: dict = Depends(get_current_user), supabase: Client = Depends(get_supabase_client)):
    if not is_admin(current_user, supabase):
        raise HTTPException(status_code=403, detail="Admin access required")
    res = supabase.table('whatsapp_templates').select('*').execute()
    return {'data': res.data or []}

@router.post('/templates')
async def create_template(data: TemplateCreate, current_user: dict = Depends(get_current_user), supabase: Client = Depends(get_supabase_client)):
    if not is_admin(current_user, supabase):
        raise HTTPException(status_code=403, detail="Admin access required")
    res = supabase.table('whatsapp_templates').insert({
        'name': data.name,
        'content': data.content,
        'status': 'APPROVED' # In real world, this needs Meta approval sync
    }).execute()
    return {'data': res.data[0]}

@router.post('/templates/sync')
async def sync_templates(current_user: dict = Depends(get_current_user), supabase: Client = Depends(get_supabase_client)):
    if not is_admin(current_user, supabase):
        raise HTTPException(status_code=403, detail="Admin access required")
        
    from services.whatsapp_service import sync_templates_from_meta
    meta_res = await sync_templates_from_meta()
    
    if "error" in meta_res:
        raise HTTPException(status_code=400, detail=meta_res["error"])
        
    templates_data = meta_res.get("data", [])
    if not templates_data:
        return {"message": "No templates found in Meta"}
        
    synced_count = 0
    for t in templates_data:
        if t.get("status") == "APPROVED":
            name = t.get("name")
            language = t.get("language", "en_US")
            components = t.get("components", [])
            # Extract content from BODY component and create default_components
            content = ""
            default_components = []
            
            for comp in components:
                if comp.get("type") == "BODY":
                    content = comp.get("text", "")
                    
                    # If body has examples, it usually means it has variables
                    # Example format: "example": {"body_text": [["Variable 1", "Variable 2"]]}
                    if "example" in comp and "body_text" in comp["example"] and comp["example"]["body_text"]:
                        params = []
                        for _ in comp["example"]["body_text"][0]:
                            params.append({"type": "text", "text": "Greetings"})
                        if params:
                            default_components.append({
                                "type": "body",
                                "parameters": params
                            })
                            
                elif comp.get("type") == "HEADER":
                    header_format = comp.get("format", "")
                    # Store header metadata so the frontend knows this template needs a media URL.
                    # The header_handle from Meta's example is a creation-time opaque string and
                    # cannot be used as image.id (which requires an integer) or as a link URL.
                    # Admins must set a real public media URL via PATCH /templates/{id}/header-url.
                    if header_format in ("IMAGE", "DOCUMENT", "VIDEO"):
                        default_components.append({
                            "_meta": True,
                            "header_format": header_format,
                            "header_media_url": None  # Admin must configure this
                        })
            
            # Upsert by name
            # Check if exists
            existing = supabase.table("whatsapp_templates").select("id").eq("name", name).execute()
            if existing.data:
                supabase.table("whatsapp_templates").update({
                    "content": content,
                    "language": language,
                    "status": "APPROVED",
                    "default_components": default_components
                }).eq("id", existing.data[0]["id"]).execute()
            else:
                supabase.table("whatsapp_templates").insert({
                    "name": name,
                    "content": content,
                    "language": language,
                    "status": "APPROVED",
                    "default_components": default_components
                }).execute()
            synced_count += 1
            
    return {"message": f"Successfully synced {synced_count} templates"}

class TemplateHeaderUrl(BaseModel):
    header_media_url: str

@router.patch('/templates/{template_id}/header-url')
async def set_template_header_url(template_id: str, data: TemplateHeaderUrl, current_user: dict = Depends(get_current_user), supabase: Client = Depends(get_supabase_client)):
    """
    Set a public media URL for a template that has an IMAGE/DOCUMENT/VIDEO header.
    Validates that the URL actually returns an image/video/document content-type,
    not an HTML page (which would cause Meta error 131053).
    """
    if not is_admin(current_user, supabase):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    # Validate the URL actually serves media, not a webpage (Meta rejects text/html)
    import httpx
    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=10.0) as client:
            resp = await client.head(data.header_media_url)
            content_type = resp.headers.get("content-type", "")
        
        ALLOWED_TYPES = ("image/", "video/", "application/pdf", "application/octet-stream")
        if not any(content_type.startswith(t) for t in ALLOWED_TYPES):
            raise HTTPException(
                status_code=400,
                detail=(
                    f"The URL returns '{content_type}' instead of an image, video, or document. "
                    f"Meta will reject it with 'Unsupported Image mime type'. "
                    f"Please use a direct link to the file (e.g. ending in .jpg, .png, .webp, .mp4, .pdf) "
                    f"not a webpage URL."
                )
            )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not reach the URL to validate it: {e}")
    
    # Fetch the template's current default_components
    res = supabase.table("whatsapp_templates").select("id, default_components").eq("id", template_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Template not found")
    
    template = res.data[0]
    components = template.get("default_components") or []
    
    # Find the _meta header entry and update it with the URL
    header_format = None
    updated_components = []
    for comp in components:
        if comp.get("_meta") and comp.get("header_format"):
            header_format = comp["header_format"]
            updated_components.append({
                **comp,
                "header_media_url": data.header_media_url
            })
        else:
            updated_components.append(comp)
    
    if not header_format:
        raise HTTPException(status_code=400, detail="This template does not have an IMAGE/DOCUMENT/VIDEO header.")
    
    supabase.table("whatsapp_templates").update({
        "default_components": updated_components
    }).eq("id", template_id).execute()
    
    return {"message": f"Header URL updated successfully for {header_format} template."}

@router.get('/campaigns')
async def get_campaigns(current_user: dict = Depends(get_current_user), supabase: Client = Depends(get_supabase_client)):
    if not is_admin(current_user, supabase):
        raise HTTPException(status_code=403, detail="Admin access required")
    res = supabase.table('whatsapp_campaigns').select('*, whatsapp_templates(name), whatsapp_logs(status)').order('created_at', desc=True).execute()
    
    campaigns = res.data or []
    for c in campaigns:
        logs = c.pop('whatsapp_logs', [])
        total = len(logs)
        sent = sum(1 for log in logs if log['status'] == 'SENT')
        failed = sum(1 for log in logs if log['status'] == 'FAILED')
        c['stats'] = {
            'total': total,
            'sent': sent,
            'failed': failed,
            'percentage': int((sent + failed) / total * 100) if total > 0 else 0
        }
        
    return {'data': campaigns}

@router.get('/campaigns/{campaign_id}/logs')
async def get_campaign_logs(campaign_id: str, current_user: dict = Depends(get_current_user), supabase: Client = Depends(get_supabase_client)):
    if not is_admin(current_user, supabase):
        raise HTTPException(status_code=403, detail="Admin access required")
        
    # 1. Fetch raw logs
    res = supabase.table('whatsapp_logs').select('*').eq('campaign_id', campaign_id).execute()
    logs = res.data or []
    if not logs:
        return {'data': []}
        
    # 2. Extract unique lead_ids
    lead_ids = list(set([log['lead_id'] for log in logs if log.get('lead_id')]))
    
    # 3. Fetch from both leads and users tables to get names and phone numbers
    lead_details = {}
    if lead_ids:
        # Fetch from old leads
        l_res = supabase.table('leads').select('id, name, phone_number').in_('id', lead_ids).execute()
        for l in (l_res.data or []):
            lead_details[l['id']] = {'name': l.get('name'), 'phone_number': l.get('phone_number')}
            
        # Fetch from new users table
        u_res = supabase.table('users').select('id, name, phone').in_('id', lead_ids).execute()
        for u in (u_res.data or []):
            lead_details[u['id']] = {'name': u.get('name'), 'phone_number': u.get('phone')}
            
    # 4. Attach lead info to logs
    for log in logs:
        lid = log.get('lead_id')
        log['leads'] = lead_details.get(lid)
        
    return {'data': logs}

def resolve_audience(supabase: Client, audience_filter: AudienceFilter, template_id: str = None) -> List[dict]:
    # Fetch from leads table
    l_query = supabase.table('leads').select('id, name, phone_number').eq('whatsapp_opt_out', False)
    if audience_filter.statuses:
        l_query = l_query.in_('status', audience_filter.statuses)
    if audience_filter.source_ids:
        l_query = l_query.in_('source_id', audience_filter.source_ids)
        
    leads_res = l_query.execute()
    merged_leads = leads_res.data or []
    
    # Fetch from users table (new leads)
    u_query = supabase.table('users').select('id, name, phone')
    if audience_filter.statuses:
        u_query = u_query.in_('status', audience_filter.statuses)
    if audience_filter.source_ids:
        u_query = u_query.in_('source_id', audience_filter.source_ids)
        
    users_res = u_query.execute()
    users = users_res.data or []
    
    for u in users:
        # Ignore users without phone numbers
        if not u.get('phone'): continue
        merged_leads.append({
            'id': u['id'],
            'name': u['name'],
            'phone_number': u['phone']
        })
    
    if not merged_leads:
        return []
        
    lead_ids = [lead['id'] for lead in merged_leads]
    
    # Bulk fetch recent logs to avoid N+1 queries
    recent_contacted_ids = set()
    if audience_filter.exclude_recently_contacted_days:
        cutoff = datetime.now() - timedelta(days=audience_filter.exclude_recently_contacted_days)
        # Fetching all logs after cutoff is faster than N+1.
        recent_log_res = supabase.table('whatsapp_logs').select('lead_id').gte('created_at', cutoff.isoformat()).execute()
        if recent_log_res.data:
            recent_contacted_ids = {log['lead_id'] for log in recent_log_res.data}
    
    # Bulk fetch previous template logs
    same_template_contacted_ids = set()
    if template_id and audience_filter.exclude_previous_campaigns_with_same_template:
        template_campaigns_res = supabase.table('whatsapp_campaigns').select('id').eq('template_id', template_id).execute()
        template_camp_ids = [c['id'] for c in template_campaigns_res.data] if template_campaigns_res.data else []
        if template_camp_ids:
            prev_log_res = supabase.table('whatsapp_logs').select('lead_id').in_('campaign_id', template_camp_ids).execute()
            if prev_log_res.data:
                same_template_contacted_ids = {log['lead_id'] for log in prev_log_res.data}
    
    # Filter out excluded leads
    final_leads = []
    for lead in merged_leads:
        if lead['id'] in recent_contacted_ids:
            continue
        if lead['id'] in same_template_contacted_ids:
            continue
        final_leads.append(lead)
        
    return final_leads

class EstimateRequest(BaseModel):
    template_id: str | None = None
    audience_filter: AudienceFilter

@router.post('/campaigns/estimate')
async def estimate_campaign_audience(data: EstimateRequest, current_user: dict = Depends(get_current_user), supabase: Client = Depends(get_supabase_client)):
    if not is_admin(current_user, supabase):
        raise HTTPException(status_code=403, detail="Admin access required")
        
    final_leads = resolve_audience(supabase, data.audience_filter, data.template_id)
    return {
        'data': {
            'count': len(final_leads),
            'preview': final_leads[:5]
        }
    }

@router.post('/campaigns')
async def create_campaign(data: CampaignCreate, background_tasks: BackgroundTasks, current_user: dict = Depends(get_current_user), supabase: Client = Depends(get_supabase_client)):
    if not is_admin(current_user, supabase):
        raise HTTPException(status_code=403, detail="Admin access required")
    scheduled_time = data.scheduled_time or datetime.now(timezone.utc)
    
    # Create campaign
    camp_res = supabase.table('whatsapp_campaigns').insert({
        'name': data.name,
        'template_id': data.template_id,
        'scheduled_time': scheduled_time if isinstance(scheduled_time, str) else scheduled_time.isoformat(),
        'status': 'PENDING',
        'created_by': current_user.get('id'),
        'audience_filter': data.audience_filter.model_dump()
    }).execute()
    
    campaign = camp_res.data[0]
    campaign_id = campaign['id']
    
    final_leads = resolve_audience(supabase, data.audience_filter, data.template_id)
    
    logs = [{
        'campaign_id': campaign_id,
        'lead_id': lead['id'],
        'phone_number': lead['phone_number'],
        'status': 'PENDING'
    } for lead in final_leads]
            
    if logs:
        supabase.table('whatsapp_logs').insert(logs).execute()
        
    if not data.scheduled_time:
        from core.scheduler import sweep_whatsapp_campaigns
        background_tasks.add_task(sweep_whatsapp_campaigns)
        
    return {'data': campaign, 'audience_size': len(logs)}

@router.post('/campaigns/{campaign_id}/start-now')
async def start_campaign_now(campaign_id: str, background_tasks: BackgroundTasks, current_user: dict = Depends(get_current_user), supabase: Client = Depends(get_supabase_client)):
    if not is_admin(current_user, supabase):
        raise HTTPException(status_code=403, detail="Admin access required")
        
    supabase.table('whatsapp_campaigns').update({
        'scheduled_time': datetime.now(timezone.utc).isoformat()
    }).eq('id', campaign_id).execute()
    
    from core.scheduler import sweep_whatsapp_campaigns
    background_tasks.add_task(sweep_whatsapp_campaigns)
    
    return {'status': 'success'}

@router.post('/campaigns/{campaign_id}/pause')
async def pause_campaign(campaign_id: str, current_user: dict = Depends(get_current_user), supabase: Client = Depends(get_supabase_client)):
    if not is_admin(current_user, supabase):
        raise HTTPException(status_code=403, detail="Admin access required")
        
    supabase.table('whatsapp_campaigns').update({
        'status': 'PAUSED'
    }).eq('id', campaign_id).execute()
    
    return {'status': 'success'}

@router.post('/campaigns/{campaign_id}/continue')
async def continue_campaign(campaign_id: str, background_tasks: BackgroundTasks, current_user: dict = Depends(get_current_user), supabase: Client = Depends(get_supabase_client)):
    if not is_admin(current_user, supabase):
        raise HTTPException(status_code=403, detail="Admin access required")
        
    # Set to PENDING and scheduled_time to now so scheduler picks it up immediately
    supabase.table('whatsapp_campaigns').update({
        'status': 'PENDING',
        'scheduled_time': datetime.now(timezone.utc).isoformat()
    }).eq('id', campaign_id).execute()
    
    from core.scheduler import sweep_whatsapp_campaigns
    background_tasks.add_task(sweep_whatsapp_campaigns)
    
    return {'status': 'success'}

@router.put('/campaigns/{campaign_id}')
async def update_campaign(campaign_id: str, data: CampaignCreate, current_user: dict = Depends(get_current_user), supabase: Client = Depends(get_supabase_client)):
    if not is_admin(current_user, supabase):
        raise HTTPException(status_code=403, detail="Admin access required")
        
    camp_res = supabase.table('whatsapp_campaigns').select('status').eq('id', campaign_id).execute()
    if not camp_res.data or camp_res.data[0]['status'] != 'PENDING':
        raise HTTPException(status_code=400, detail="Only pending campaigns can be updated")
        
    scheduled_time = data.scheduled_time or datetime.now(timezone.utc)
    
    supabase.table('whatsapp_campaigns').update({
        'name': data.name,
        'template_id': data.template_id,
        'scheduled_time': scheduled_time if isinstance(scheduled_time, str) else scheduled_time.isoformat(),
        'audience_filter': data.audience_filter.model_dump()
    }).eq('id', campaign_id).execute()
    
    # Delete old pending logs and regenerate
    supabase.table('whatsapp_logs').delete().eq('campaign_id', campaign_id).eq('status', 'PENDING').execute()
    
    final_leads = resolve_audience(supabase, data.audience_filter, data.template_id)
    logs = [{
        'campaign_id': campaign_id,
        'lead_id': lead['id'],
        'phone_number': lead['phone_number'],
        'status': 'PENDING'
    } for lead in final_leads]
    
    if logs:
        supabase.table('whatsapp_logs').insert(logs).execute()
        
    return {'status': 'success'}

@router.delete('/campaigns/{campaign_id}')
async def delete_campaign(campaign_id: str, current_user: dict = Depends(get_current_user), supabase: Client = Depends(get_supabase_client)):
    if not is_admin(current_user, supabase):
        raise HTTPException(status_code=403, detail="Admin access required")
        
    # Delete logs first (if not cascading)
    supabase.table('whatsapp_logs').delete().eq('campaign_id', campaign_id).execute()
    supabase.table('whatsapp_campaigns').delete().eq('id', campaign_id).execute()
    return {'status': 'success'}

@router.get('/settings/autoresponder')
async def get_autoresponder(current_user: dict = Depends(get_current_user), supabase: Client = Depends(get_supabase_client)):
    if not is_admin(current_user, supabase):
        raise HTTPException(status_code=403, detail="Admin access required")
    res = supabase.table("global_settings").select("settings_value").eq("settings_key", "whatsapp_autoresponder").execute()
    if res.data:
        return {"data": res.data[0]["settings_value"]}
    return {"data": {"enabled": False, "template_id": None}}

@router.put('/settings/autoresponder')
async def update_autoresponder(data: AutoResponderSettings, current_user: dict = Depends(get_current_user), supabase: Client = Depends(get_supabase_client)):
    if not is_admin(current_user, supabase):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    # Check if exists
    res = supabase.table("global_settings").select("id").eq("settings_key", "whatsapp_autoresponder").execute()
    val = {"enabled": data.enabled, "template_id": data.template_id}
    if res.data:
        supabase.table("global_settings").update({"settings_value": val}).eq("settings_key", "whatsapp_autoresponder").execute()
    else:
        supabase.table("global_settings").insert({"settings_key": "whatsapp_autoresponder", "settings_value": val}).execute()
        
    return {"data": val}

class SubscriberEngagementSettingsModel(BaseModel):
    enabled: bool
    reminder_template_id: Optional[str] = None   # template for inactive users
    motivation_template_id: Optional[str] = None  # template for active users
    inactivity_days_threshold: int = 1
    min_days_between_nudges: int = 1
    send_time: str = "09:00"
    # Maps {{1}}, {{2}} etc. → subscriber data field
    # e.g. {"reminder": {"1": "name", "2": "days_inactive"}, "motivation": {"1": "name"}}
    variable_mappings: Optional[dict] = None

@router.get('/settings/subscriber-engagement')
async def get_subscriber_engagement(current_user: dict = Depends(get_current_user), supabase: Client = Depends(get_supabase_client)):
    if not is_admin(current_user, supabase):
        raise HTTPException(status_code=403, detail="Admin access required")
    res = supabase.table("global_settings").select("settings_value").eq("settings_key", "whatsapp_subscriber_engagement").execute()
    if res.data:
        return {"data": res.data[0]["settings_value"]}
    return {"data": {"enabled": False, "reminder_template_id": None, "motivation_template_id": None, "inactivity_days_threshold": 1, "min_days_between_nudges": 1, "send_time": "09:00", "variable_mappings": {"reminder": {}, "motivation": {}}}}

@router.put('/settings/subscriber-engagement')
async def update_subscriber_engagement(data: SubscriberEngagementSettingsModel, current_user: dict = Depends(get_current_user), supabase: Client = Depends(get_supabase_client)):
    if not is_admin(current_user, supabase):
        raise HTTPException(status_code=403, detail="Admin access required")
    val = data.model_dump()
    supabase.table("global_settings").upsert({"settings_key": "whatsapp_subscriber_engagement", "settings_value": val}, on_conflict="settings_key").execute()
    return {"data": val}

@router.get('/webhook')
async def verify_webhook(
    hub_mode: str = Query(None, alias="hub.mode"),
    hub_challenge: str = Query(None, alias="hub.challenge"),
    hub_verify_token: str = Query(None, alias="hub.verify_token")
):
    # Meta webhook verification
    if hub_mode == "subscribe":
        return PlainTextResponse(hub_challenge)
    return {"status": "ok"}

@router.post('/webhook')
async def webhook_handler(payload: dict, background_tasks: BackgroundTasks, supabase: Client = Depends(get_supabase_client)):
    try:
        print(f"[WhatsApp Webhook] Received payload: {payload}")
        if payload.get("object") == "whatsapp_business_account":
            for entry in payload.get("entry", []):
                for change in entry.get("changes", []):
                    value = change.get("value", {})
                    if "messages" in value:
                        for msg in value.get("messages", []):
                            phone = msg.get("from")
                            if not phone:
                                continue
                                
                            clean_phone = ''.join(filter(str.isdigit, phone))
                            
                            # Determine message content
                            text_body = ""
                            msg_type = msg.get("type")
                            interactive_reply_id = None
                            interactive_reply_title = None
                            
                            if msg_type == "text":
                                text_body = msg.get("text", {}).get("body", "").strip()
                            elif msg_type == "interactive":
                                interactive = msg.get("interactive", {})
                                if interactive.get("type") == "list_reply":
                                    text_body = interactive.get("list_reply", {}).get("title", "")
                                    interactive_reply_id = interactive.get("list_reply", {}).get("id", "")
                                elif interactive.get("type") == "button_reply":
                                    text_body = interactive.get("button_reply", {}).get("title", "")
                                    interactive_reply_id = interactive.get("button_reply", {}).get("id", "")
                            
                            # Check for STOP intent
                            if text_body.lower() in ["stop", "unsubscribe", "cancel"]:
                                # Opt out leads table
                                supabase.table("leads").update({"whatsapp_opt_out": True}).ilike("phone_number", f"%{clean_phone}%").execute()
                                # Opt out subscribed users via metadata flag
                                u_res = supabase.table("users").select("id, metadata").ilike("phone", f"%{clean_phone}%").execute()
                                for u_row in (u_res.data or []):
                                    meta = u_row.get("metadata") or {}
                                    meta["engagement_opted_out"] = True
                                    supabase.table("users").update({"metadata": meta}).eq("id", u_row["id"]).execute()
                                # Send confirmation
                                await send_whatsapp_text(f"{clean_phone}", "You have been unsubscribed from Genestac health reminders. Reply START anytime to re-enable them. \U0001f64f")
                                print(f"[WhatsApp Webhook] Opted out phone: {clean_phone}")
                                continue

                            # Check for START / re-subscribe intent
                            if text_body.lower() in ["start", "subscribe", "yes"]:
                                # Re-enable leads
                                supabase.table("leads").update({"whatsapp_opt_out": False}).ilike("phone_number", f"%{clean_phone}%").execute()
                                # Re-enable subscribed users
                                u_res = supabase.table("users").select("id, metadata").ilike("phone", f"%{clean_phone}%").execute()
                                for u_row in (u_res.data or []):
                                    meta = u_row.get("metadata") or {}
                                    meta["engagement_opted_out"] = False
                                    supabase.table("users").update({"metadata": meta}).eq("id", u_row["id"]).execute()
                                await send_whatsapp_text(f"{clean_phone}", "Welcome back! \U0001f44b You are now re-subscribed to daily health reminders from Genestac. Keep logging to stay on track! \U0001f4aa")
                                print(f"[WhatsApp Webhook] Re-subscribed phone: {clean_phone}")
                                continue
                                
                            # ----- State Machine Logic -----
                            
                            # 1. Fetch existing lead/user
                            existing = None
                            table = "leads"
                            phone_field = "phone_number"
                            
                            res_users = supabase.table("users").select("*").ilike("phone", f"%{clean_phone}%").execute()
                            if res_users.data:
                                existing = res_users.data[0]
                                table = "users"
                                phone_field = "phone"
                            else:
                                res_leads = supabase.table("leads").select("*").ilike("phone_number", f"%{clean_phone}%").execute()
                                if res_leads.data:
                                    existing = res_leads.data[0]
                                    table = "leads"
                                    phone_field = "phone_number"
                                    
                            if existing:
                                existing[phone_field] = existing.get(phone_field) or clean_phone
                                existing["phone_number"] = existing.get("phone_number") or clean_phone
                                existing["phone"] = existing.get("phone") or clean_phone

                            metadata = existing.get("metadata", {}) if existing else {}
                            current_step = metadata.get("whatsapp_step")
                            lead_name = existing.get("name") if existing else None
                            
                            # If no user/lead, create one
                            if not existing:
                                # Create new lead
                                whatsapp_source_id = "936ddc7e-f841-41f8-bccc-06820a5d33c4" # Meta ads source
                                new_lead_data = {
                                    "phone_number": f"+{clean_phone}",
                                    "status": "NEW",
                                    "source_id": whatsapp_source_id,
                                    "metadata": {}
                                }
                                res = supabase.table("leads").insert(new_lead_data).execute()
                                if res.data:
                                    existing = res.data[0]
                                    table = "leads"
                                    phone_field = "phone_number"
                                    metadata = new_lead_data["metadata"]
                                    
                            # Check if bot is paused
                            is_bot_paused = metadata.get("bot_paused", False)
                            
                            # Insert incoming message to DB
                            wa_message_id = msg.get("id")
                            lead_col = "user_id" if table == "users" else "lead_id"
                            
                            supabase.table("whatsapp_messages").insert({
                                lead_col: existing["id"],
                                "message_body": text_body,
                                "sender_type": "lead",
                                "wa_message_id": wa_message_id
                            }).execute()

                            # ── Notify team of new message ──────────────────
                            _lead_name = existing.get("name") or existing.get("phone_number") or existing.get("phone") or "Unknown"
                            background_tasks.add_task(
                                notify_new_wa_message,
                                supabase, _lead_name, existing["id"], text_body
                            )

                            # ── Score lead from chat (non-blocking) ─────────
                            async def _score_in_bg(lid, lname, tbl):
                                from services.lead_scoring_service import score_lead_from_chat
                                await score_lead_from_chat(lid, lname, supabase, table=tbl)
                            background_tasks.add_task(_score_in_bg, existing["id"], _lead_name, table)
                            
                            if is_bot_paused:
                                print(f"[WhatsApp Webhook] Bot paused for {clean_phone}, skipping AI reply.")
                                continue
                            
                            # ── First-message detection ─────────────────────
                            # Count messages for this lead (we just inserted the current one).
                            # prior_count == 1 means the only message is the one just inserted.
                            prior_msg_res = supabase.table("whatsapp_messages") \
                                .select("id") \
                                .eq(lead_col, existing["id"]) \
                                .limit(3) \
                                .execute()
                            prior_count = len(prior_msg_res.data or [])

                            # Re-fetch fresh metadata from DB so we pick up any wa_intake_form_sent
                            # flag that may have been saved by a previous request (avoid stale cache).
                            _fresh_res = supabase.table(table).select("wa_intake_form_sent, metadata") \
                                .eq("id", existing["id"]).execute()
                            _fresh = _fresh_res.data[0] if _fresh_res.data else {}
                            _fresh_meta = _fresh.get("metadata") or {}
                            _intake_sent = (
                                _fresh.get("wa_intake_form_sent")
                                or _fresh_meta.get("wa_intake_form_sent")
                                or False
                            )
                            # is_first_message = True ONLY when this is the very first message
                            # (prior_count == 1 means only the current message exists) AND form not yet sent.
                            is_first_message = (prior_count == 1) and not _intake_sent
                            print(f"[WhatsApp Webhook] is_first_message={is_first_message} (prior_count={prior_count}, intake_sent={_intake_sent}) for {clean_phone}")

                            
                            print(f"[WhatsApp Webhook] Processing message with OpenAI Agent for {clean_phone}")
                            
                            # Use OpenAI RAG Agent
                            ai_reply, should_trigger_call = await process_whatsapp_message(
                                lead=existing, 
                                message=text_body, 
                                supabase=supabase,
                                is_first_message=is_first_message
                            )
                            
                            # Send AI Reply
                            if ai_reply:
                                await send_whatsapp_text(clean_phone, ai_reply)
                                supabase.table("whatsapp_messages").insert({
                                    lead_col: existing["id"],
                                    "message_body": ai_reply,
                                    "sender_type": "bot"
                                }).execute()
                                
                            # Trigger Exotel Call if AI requested it
                            if should_trigger_call:
                                print(f"[WhatsApp Webhook] Triggering Exotel call for {clean_phone}")
                                def trigger_exotel(phone, lead_id):
                                    res_settings = supabase.table("global_settings").select("settings_value").eq("settings_key", "ai_call_settings").execute()
                                    exotel_number = None
                                    if res_settings.data:
                                        exotel_number = res_settings.data[0]["settings_value"].get("exotel_number")
                                    if not exotel_number:
                                        exotel_number = "+9101141189316" # Fallback caller ID
                                        
                                    log_res = supabase.table("ai_call_logs").insert({"lead_id": lead_id, "status": "initiating"}).execute()
                                    call_log_id = log_res.data[0]["id"] if log_res.data else None
                                    
                                    formatted_phone = f"+{phone}" if not phone.startswith("+") else phone
                                    exotel_res = initiate_ai_call(from_number=exotel_number, to_number=formatted_phone, lead_id=lead_id)
                                    
                                    if exotel_res and "Call" in exotel_res:
                                        call_sid = exotel_res["Call"].get("Sid")
                                        if call_log_id:
                                            supabase.table("ai_call_logs").update({"call_sid": call_sid, "status": "ringing"}).eq("id", call_log_id).execute()
                                    else:
                                        if call_log_id:
                                            supabase.table("ai_call_logs").update({"status": "failed_to_initiate"}).eq("id", call_log_id).execute()
                                            
                                background_tasks.add_task(trigger_exotel, clean_phone, existing["id"])
                                
    except Exception as e:
        print(f"[WhatsApp Webhook Error]: {e}")
        import traceback
        traceback.print_exc()
        
    return {"status": "success"}
