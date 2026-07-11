from fastapi import APIRouter, Depends, HTTPException, Form, UploadFile, File, BackgroundTasks, Query
from supabase import Client
from db.supabase import get_supabase_client
from api.deps import get_current_user
from services.cloudinary_service import upload_file_to_cloudinary
from typing import Optional
router = APIRouter()
from pydantic import BaseModel
import razorpay
import uuid
import os
from api.admin.crm_settings import get_global_settings_from_db
import json
from datetime import datetime
from fastapi.responses import Response
from api.pdf_generator import generate_invoice_pdf

class NoteCreate(BaseModel):
    content: str
    created_at: Optional[str] = None

class BulkStatusUpdate(BaseModel):
    lead_ids: list[str]
    status: str

def is_admin(user: dict, supabase: Client) -> bool:
    res = supabase.table('staffs').select('roles(name)').eq('id', user['id']).execute()
    if not res.data:
        return False
    role_name = res.data[0].get('roles', {}).get('name', '')
    return role_name in ('superadmin', 'master_admin', 'admin')

async def process_whatsapp_autoresponder(phone: str, supabase: Client):
    try:
        res = supabase.table("global_settings").select("settings_value").eq("settings_key", "whatsapp_autoresponder").execute()
        if not res.data:
            return
            
        settings = res.data[0]["settings_value"]
        if settings.get("enabled") and settings.get("template_id"):
            template_id = settings.get("template_id")
            
            # Fetch template name
            temp_res = supabase.table("whatsapp_templates").select("name").eq("id", template_id).execute()
            if temp_res.data:
                template_name = temp_res.data[0]["name"]
                
                # Send the template
                from services.whatsapp_service import send_whatsapp_template
                import asyncio
                # We are in an async function running as BackgroundTask, so we can await
                await send_whatsapp_template(phone, template_name)
    except Exception as e:
        print(f"Autoresponder error: {e}")

@router.post('/leads')
async def create_lead(background_tasks: BackgroundTasks, phone: str=Form(...), name: Optional[str]=Form(None), source_id: Optional[str]=Form(None), email: Optional[str]=Form(None), street_address: Optional[str]=Form(None), city: Optional[str]=Form(None), state: Optional[str]=Form(None), postal_code: Optional[str]=Form(None), country: Optional[str]=Form(None), interested_plan_id: Optional[str]=Form(None), priority: Optional[str]=Form(None), followup_notes: Optional[str]=Form(None), current_user: dict=Depends(get_current_user), supabase: Client=Depends(get_supabase_client)):
    payload = {'phone': phone, 'name': name, 'source_id': source_id, 'status': 'NEW', 'assigned_sales_rep_id': current_user['id']}
    optional_fields = {'email': email, 'street_address': street_address, 'city': city, 'state': state, 'postal_code': postal_code, 'country': country, 'interested_plan_id': interested_plan_id, 'priority': priority, 'followup_notes': followup_notes}
    for k, v in optional_fields.items():
        if v is not None and v != '':
            payload[k] = v
    res = None
    if email and phone:
        res = supabase.table('users').select('*').or_(f'email.eq.{email},phone.eq.{phone}').execute()
    elif email:
        res = supabase.table('users').select('*').eq('email', email).execute()
    else:
        res = supabase.table('users').select('*').eq('phone', phone).execute()
    if res and res.data:
        existing_user = res.data[0]
        import json
        details_str = json.dumps(payload, indent=2)
        note_content = f'**Duplicate Submission Received**\n\nWe received a new lead submission with these details but matching this existing record:\n```json\n{details_str}\n```'
        supabase.table('user_notes').insert({'user_id': existing_user['id'], 'author_id': current_user['id'], 'content': note_content}).execute()
        return {'message': 'Duplicate submission added as note', 'data': [existing_user]}
    else:
        response = supabase.table('users').insert(payload).execute()
        
        # Trigger Auto-Responder
        if phone:
            background_tasks.add_task(process_whatsapp_autoresponder, phone, supabase)
            
        return {'message': 'Lead created successfully', 'data': response.data}

@router.put('/leads/bulk-status')
async def bulk_update_status(payload: BulkStatusUpdate, current_user: dict=Depends(get_current_user), supabase: Client=Depends(get_supabase_client)):
    if not payload.lead_ids:
        return {'message': 'No lead IDs provided'}
    
    # Try updating in both tables since IDs are unique
    try:
        supabase.table('users').update({'status': payload.status}).in_('id', payload.lead_ids).execute()
    except Exception as e:
        pass
        
    try:
        supabase.table('leads').update({'status': payload.status}).in_('id', payload.lead_ids).execute()
    except Exception as e:
        pass
        
    return {'message': f'Status updated to {payload.status} for {len(payload.lead_ids)} leads'}

@router.put('/leads/{lead_id}')
async def update_lead_details(lead_id: str, status: Optional[str]=Form(None), priority: Optional[str]=Form(None), next_followup_date: Optional[str]=Form(None), followup_notes: Optional[str]=Form(None), name: Optional[str]=Form(None), email: Optional[str]=Form(None), street_address: Optional[str]=Form(None), city: Optional[str]=Form(None), state: Optional[str]=Form(None), postal_code: Optional[str]=Form(None), country: Optional[str]=Form(None), source_id: Optional[str]=Form(None), interested_plan_id: Optional[str]=Form(None), metadata_json: Optional[str]=Form(None), record_type: Optional[str]=Form('USER'), current_user: dict=Depends(get_current_user), supabase: Client=Depends(get_supabase_client)):
    payload = {}
    fields = {'status': status, 'priority': priority, 'next_followup_date': next_followup_date, 'followup_notes': followup_notes, 'name': name, 'email': email, 'street_address': street_address, 'city': city, 'state': state, 'postal_code': postal_code, 'country': country, 'source_id': source_id, 'interested_plan_id': interested_plan_id}
    for k, v in fields.items():
        if v is not None:
            if v == '':
                payload[k] = None
            else:
                payload[k] = v
    if metadata_json:
        import json
        try:
            payload['metadata'] = json.loads(metadata_json)
        except Exception:
            pass
    table = 'leads' if record_type == 'LEAD' else 'users'
    try:
        response = supabase.table(table).update(payload).eq('id', lead_id).execute()
        return {'message': 'Lead updated successfully', 'data': response.data}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
@router.get('/leads')
async def get_leads(statuses: Optional[str]=Query(None), exclude_statuses: Optional[str]=Query(None), require_followup: Optional[bool]=Query(False), page: int=Query(1), limit: int=Query(50), sort_by: str=Query('created_at'), sort_order: str=Query('desc'), search: Optional[str]=Query(None), source_id: Optional[str]=Query(None), current_user: dict=Depends(get_current_user), supabase: Client=Depends(get_supabase_client)):
    try:
        user_id = current_user['id']
        is_admin = current_user.get('role') in ['SUPER_ADMIN', 'superadmin', 'admin', 'master_admin']
        settings = get_global_settings_from_db(supabase)
        shared_pool_enabled = settings.get('shared_lead_pool', False)
        users_data = []
        u_query = supabase.table('users').select('*, user_sources(name), plans(name, price)')
        if not is_admin:
            if shared_pool_enabled:
                u_query = u_query.or_(f'assigned_sales_rep_id.eq.{user_id},assigned_sales_rep_id.is.null')
            else:
                u_query = u_query.eq('assigned_sales_rep_id', user_id)
        if statuses:
            u_query = u_query.in_('status', statuses.split(','))
        if exclude_statuses:
            for st in exclude_statuses.split(','):
                u_query = u_query.neq('status', st)
        if require_followup:
            u_query = u_query.not_.is_('next_followup_date', 'null')
        if source_id:
            u_query = u_query.eq('source_id', source_id)
        if search:
            u_query = u_query.or_(f'name.ilike.%{search}%,phone.ilike.%{search}%')
        u_res = u_query.execute()
        users_data = u_res.data or []
        for u in users_data:
            u['record_type'] = 'USER'
            
        leads_data = []
        try:
            l_query = supabase.table('leads').select('*, user_sources(name), plans(name, price)')
            if not is_admin:
                if shared_pool_enabled:
                    l_query = l_query.or_(f'assigned_sales_rep_id.eq.{user_id},assigned_sales_rep_id.is.null')
                else:
                    l_query = l_query.eq('assigned_sales_rep_id', user_id)
            if statuses:
                l_query = l_query.in_('status', statuses.split(','))
            if exclude_statuses:
                for st in exclude_statuses.split(','):
                    l_query = l_query.neq('status', st)
            if require_followup:
                l_query = l_query.not_.is_('next_followup_date', 'null')
            if source_id:
                l_query = l_query.eq('source_id', source_id)
            if search:
                l_query = l_query.or_(f'name.ilike.%{search}%,phone_number.ilike.%{search}%')
            l_res = l_query.execute()
            leads_data = l_res.data or []
            for l in leads_data:
                l['record_type'] = 'LEAD'
                if 'phone_number' in l:
                    l['phone'] = l.pop('phone_number', None)
                if 'metadata' not in l or not l['metadata']:
                    l['metadata'] = {}
        except Exception as e:
            print(f'Skipping leads table fetch (may not exist): {e}')
        combined = users_data + leads_data
        
        # Dynamic sorting
        sort_key = sort_by if sort_by else 'created_at'
        is_reverse = True if sort_order.lower() == 'desc' else False
        combined.sort(key=lambda x: x.get(sort_key, '') or '', reverse=is_reverse)
        
        total_count = len(combined)
        start_idx = (page - 1) * limit
        end_idx = start_idx + limit
        paginated_data = combined[start_idx:end_idx]
        
        return {
            'data': paginated_data,
            'total': total_count,
            'page': page,
            'limit': limit
        }
    except Exception as e:
        import traceback, sys
        err = traceback.format_exc()
        print(f'get_leads error: {err}')
        sys.stdout.flush()
        raise HTTPException(status_code=500, detail=f'get_leads error: {str(e)}')

@router.get('/leads/{lead_id}/ai-calls')
async def get_lead_ai_calls(lead_id: str, current_user: dict=Depends(get_current_user), supabase: Client=Depends(get_supabase_client)):
    try:
        res = supabase.table('ai_call_logs').select('*').eq('lead_id', lead_id).order('created_at', desc=True).execute()
        return {'data': res.data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post('/leads/{lead_id}/trigger-ai-call')
async def trigger_ai_call(lead_id: str, current_user: dict=Depends(get_current_user), supabase: Client=Depends(get_supabase_client)):
    from services.exotel_service import initiate_ai_call
    
    # Check if admin
    is_admin = current_user.get('role') in ['SUPER_ADMIN', 'superadmin', 'admin', 'master_admin']
    if not is_admin:
        # Also check staffs table just in case
        profile = supabase.table("staffs").select("roles(name)").eq("id", current_user["id"]).single().execute()
        role_name = profile.data.get("roles", {}).get("name") if profile.data and profile.data.get("roles") else None
        if role_name not in ["superadmin", "master_admin", "admin"]:
            raise HTTPException(status_code=403, detail="Only admins can manually trigger AI calls.")
            
    try:
        # Get lead phone (check users table first, then leads table)
        phone = None
        user_res = supabase.table("users").select("phone").eq("id", lead_id).execute()
        if user_res.data and user_res.data[0].get("phone"):
            phone = user_res.data[0]["phone"]
        else:
            lead_res = supabase.table("leads").select("phone_number").eq("id", lead_id).execute()
            if lead_res.data and lead_res.data[0].get("phone_number"):
                phone = lead_res.data[0]["phone_number"]
                
        if not phone:
            raise HTTPException(status_code=404, detail="Lead/User phone not found")
        
        # Get AI exotel number
        settings_res = supabase.table("global_settings").select("settings_value").eq("settings_key", "ai_call_settings").execute()
        if not settings_res.data:
            raise HTTPException(status_code=400, detail="AI Settings not configured")
        
        ai_settings = settings_res.data[0]["settings_value"]
        exotel_number = ai_settings.get("exotel_caller_id") or ai_settings.get("exotel_number")
        if not exotel_number:
            raise HTTPException(status_code=400, detail="Exotel caller ID not configured in AI settings")
            
        # Create log
        log_res = supabase.table("ai_call_logs").insert({
            "lead_id": lead_id,
            "status": "initiating"
        }).execute()
        call_log_id = log_res.data[0]["id"]
        
        # Trigger
        exotel_res = initiate_ai_call(from_number=exotel_number, to_number=phone, lead_id=lead_id)
        
        if exotel_res and "Call" in exotel_res:
            call_sid = exotel_res["Call"].get("Sid")
            supabase.table("ai_call_logs").update({"call_sid": call_sid, "status": "ringing"}).eq("id", call_log_id).execute()
            return {"success": True, "message": "Call initiated"}
        else:
            supabase.table("ai_call_logs").update({"status": "failed_to_initiate"}).eq("id", call_log_id).execute()
            raise HTTPException(status_code=500, detail="Failed to initiate Exotel call")
            
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
