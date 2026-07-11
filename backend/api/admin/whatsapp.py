from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timedelta, timezone
from supabase import Client
from db.supabase import get_supabase_client
from api.deps import get_current_user

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
            # Extract content from BODY component
            content = ""
            for comp in components:
                if comp.get("type") == "BODY":
                    content = comp.get("text", "")
                    break
                    
            # Upsert by name
            # Check if exists
            existing = supabase.table("whatsapp_templates").select("id").eq("name", name).execute()
            if existing.data:
                supabase.table("whatsapp_templates").update({
                    "content": content,
                    "language": language,
                    "status": "APPROVED"
                }).eq("id", existing.data[0]["id"]).execute()
            else:
                supabase.table("whatsapp_templates").insert({
                    "name": name,
                    "content": content,
                    "language": language,
                    "status": "APPROVED"
                }).execute()
            synced_count += 1
            
    return {"message": f"Successfully synced {synced_count} templates"}

@router.get('/campaigns')
async def get_campaigns(current_user: dict = Depends(get_current_user), supabase: Client = Depends(get_supabase_client)):
    if not is_admin(current_user, supabase):
        raise HTTPException(status_code=403, detail="Admin access required")
    res = supabase.table('whatsapp_campaigns').select('*, whatsapp_templates(name)').order('created_at', desc=True).execute()
    return {'data': res.data or []}

@router.get('/campaigns/{campaign_id}/logs')
async def get_campaign_logs(campaign_id: str, current_user: dict = Depends(get_current_user), supabase: Client = Depends(get_supabase_client)):
    if not is_admin(current_user, supabase):
        raise HTTPException(status_code=403, detail="Admin access required")
    res = supabase.table('whatsapp_logs').select('*, leads(name, phone_number)').eq('campaign_id', campaign_id).execute()
    return {'data': res.data or []}

def resolve_audience(supabase: Client, audience_filter: AudienceFilter, template_id: str = None) -> List[dict]:
    query = supabase.table('leads').select('id, name, phone_number').eq('whatsapp_opt_out', False)
    
    if audience_filter.statuses:
        query = query.in_('status', audience_filter.statuses)
    if audience_filter.source_ids:
        query = query.in_('source_id', audience_filter.source_ids)
        
    leads_res = query.execute()
    leads = leads_res.data or []
    
    if not leads:
        return []
        
    lead_ids = [lead['id'] for lead in leads]
    
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
    
    final_leads = []
    for lead in leads:
        lead_id = lead['id']
        
        if lead_id in recent_contacted_ids:
            continue
                
        if lead_id in same_template_contacted_ids:
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

@router.get('/webhook')
async def verify_webhook(hub_mode: str = None, hub_challenge: str = None, hub_verify_token: str = None):
    # Meta webhook verification
    if hub_mode == "subscribe":
        return int(hub_challenge)
    return {"status": "ok"}

@router.post('/webhook')
async def webhook_handler(payload: dict, supabase: Client = Depends(get_supabase_client)):
    try:
        if payload.get("object") == "whatsapp_business_account":
            for entry in payload.get("entry", []):
                for change in entry.get("changes", []):
                    value = change.get("value", {})
                    if "messages" in value:
                        for msg in value.get("messages", []):
                            if msg.get("type") == "text":
                                text = msg.get("text", {}).get("body", "").strip().lower()
                                phone = msg.get("from") # The sender's phone number
                                
                                # Check for STOP intent
                                if text in ["stop", "unsubscribe", "cancel"]:
                                    if phone:
                                        # Opt-out the lead
                                        supabase.table("leads").update({"whatsapp_opt_out": True}).eq("phone_number", phone).execute()
                                        print(f"[WhatsApp Webhook] Opted out phone: {phone}")
    except Exception as e:
        print(f"[WhatsApp Webhook Error]: {e}")
        
    return {"status": "success"}
