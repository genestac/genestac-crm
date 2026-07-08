from fastapi import APIRouter, Depends, HTTPException, Form, UploadFile, File
from supabase import Client
from db.supabase import get_supabase_client
from api.deps import get_current_user
from services.cloudinary_service import upload_file_to_cloudinary
from typing import Optional
router = APIRouter()
from fastapi import Query
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
def is_admin(user: dict, supabase: Client) -> bool:
    res = supabase.table('staffs').select('roles(name)').eq('id', user['id']).execute()
    if not res.data:
        return False
    role_name = res.data[0].get('roles', {}).get('name', '')
    return role_name in ('superadmin', 'master_admin', 'admin')

@router.get('/orders')
async def list_orders(current_user: dict=Depends(get_current_user), supabase: Client=Depends(get_supabase_client)):
    admin = is_admin(current_user, supabase)
    query = '*, order_items(*), payments(*)'
    if admin:
        res = supabase.table('orders').select(query).order('created_at', desc=True).execute()
    else:
        leads_res = supabase.table('leads').select('id').eq('assigned_sales_rep_id', current_user['id']).execute()
        lead_ids = [lead['id'] for lead in leads_res.data] if leads_res.data else []
        if not lead_ids:
            return {'data': []}
        res = supabase.table('orders').select(query).in_('user_id', lead_ids).order('created_at', desc=True).execute()
    orders_data = res.data or []
    if orders_data:
        user_ids = [o['user_id'] for o in orders_data if o.get('user_id')]
        if user_ids:
            try:
                users_res = supabase.table('leads').select('id, name, email, phone_number, metadata').in_('id', user_ids).execute()
                users_map = {}
                if users_res.data:
                    for u in users_res.data:
                        u['phone'] = u.get('phone_number')
                        users_map[u['id']] = u
                missing_user_ids = [uid for uid in user_ids if uid not in users_map]
                if missing_user_ids:
                    patients_res = supabase.table('users').select('id, name, email, phone, metadata').in_('id', missing_user_ids).execute()
                    if patients_res.data:
                        for u in patients_res.data:
                            users_map[u['id']] = u
                for o in orders_data:
                    if o.get('user_id') in users_map:
                        o['user'] = users_map[o['user_id']]
            except Exception as e:
                import traceback
                print(f'Error enriching orders user data: {e}')
                traceback.print_exc()
    return {'data': orders_data}
@router.get('/carts')
async def list_carts(current_user: dict=Depends(get_current_user), supabase: Client=Depends(get_supabase_client)):
    admin = is_admin(current_user, supabase)
    if admin:
        res = supabase.table('cart').select('*').order('added_at', desc=True).execute()
    else:
        leads_res = supabase.table('leads').select('id').eq('assigned_sales_rep_id', current_user['id']).execute()
        lead_ids = [lead['id'] for lead in leads_res.data] if leads_res.data else []
        if not lead_ids:
            return {'data': []}
        res = supabase.table('cart').select('*').in_('user_id', lead_ids).order('added_at', desc=True).execute()
    carts_data = res.data or []
    if carts_data:
        user_ids = list(set([c['user_id'] for c in carts_data if c.get('user_id')]))
        if user_ids:
            try:
                users_res = supabase.table('leads').select('id, name, full_name, email, phone').in_('id', user_ids).execute()
                users_map = {u['id']: u for u in users_res.data}
                for c in carts_data:
                    if c.get('user_id') in users_map:
                        c['user'] = users_map[c['user_id']]
            except Exception:
                pass
        medicine_ids = list(set([c['medicine_id'] for c in carts_data if c.get('medicine_id')]))
        if medicine_ids:
            try:
                inv_res = supabase.table('inventory').select('id, name, price').in_('id', medicine_ids).execute()
                inv_map = {i['id']: i for i in inv_res.data}
                for c in carts_data:
                    if c.get('medicine_id') in inv_map:
                        c['inventory'] = inv_map[c['medicine_id']]
            except Exception:
                pass
    return {'data': carts_data}
