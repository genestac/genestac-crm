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

@router.post('/leads/{lead_id}/generate-payment')
async def generate_payment_link(lead_id: str, plan_id: Optional[str]=Form(None), discount: float=Form(0), invoice_id: Optional[str]=Form(None), current_user: dict=Depends(get_current_user), supabase: Client=Depends(get_supabase_client)):
    try:
        if invoice_id:
            inv_res = supabase.table('proforma_invoices').select('*').eq('id', invoice_id).execute()
            if not inv_res.data:
                raise HTTPException(status_code=404, detail='Invoice not found')
            existing_inv = inv_res.data[0]
            plan_id = existing_inv['plan_id']
            base_price = existing_inv['base_price']
            discount = existing_inv['discount_percentage']
            total_amount = existing_inv['total_amount']
            plan_res = supabase.table('plans').select('*').eq('id', plan_id).execute()
            plan = plan_res.data[0] if plan_res.data else {'name': 'Subscription'}
        else:
            if not plan_id:
                raise HTTPException(status_code=400, detail='plan_id is required for new invoices')
            variant_id = None
            if '|' in plan_id:
                plan_id, variant_id = plan_id.split('|')
            plan_res = supabase.table('plans').select('*').eq('id', plan_id).execute()
            if not plan_res.data:
                raise HTTPException(status_code=404, detail='Plan not found')
            plan = plan_res.data[0]
            base_price = float(plan['price'])
            gst_percentage = float(plan.get('gst_percentage') or 0)
            if variant_id:
                var_res = supabase.table('plan_variants').select('*').eq('id', variant_id).execute()
                if var_res.data:
                    variant = var_res.data[0]
                    base_price = float(variant.get('discounted_price') or variant.get('base_price') or plan['price'])
                    plan['name'] = f"{plan['name']} - {variant.get('duration_label', '')}"
            discount_amount = base_price * (discount / 100.0)
            discounted_base = base_price - discount_amount
            gst_amount = discounted_base * (gst_percentage / 100.0)
            total_amount = discounted_base + gst_amount
        key_id = os.environ.get('RAZORPAY_KEY_ID')
        key_secret = os.environ.get('RAZORPAY_KEY_SECRET')
        if not key_id or not key_secret:
            raise HTTPException(status_code=500, detail='Razorpay keys not configured on server')
        client = razorpay.Client(auth=(key_id, key_secret))
        amount_in_paise = int(total_amount * 100)
        reference_id = invoice_id if invoice_id else str(uuid.uuid4())
        payment_link_data = {'amount': amount_in_paise, 'currency': 'INR', 'accept_partial': False, 'description': f"Payment for {plan['name']} (Proforma Invoice)", 'reference_id': reference_id + ('_ref' if invoice_id else ''), 'reminder_enable': True}
        user_res = supabase.table('users').select('name, email, phone').eq('id', lead_id).execute()
        if user_res.data:
            user = user_res.data[0]
            payment_link_data['customer'] = {'name': user.get('name') or 'Customer'}
            if user.get('email'):
                payment_link_data['customer']['email'] = user.get('email')
            if user.get('phone'):
                import re
                phone_clean = re.sub('[^\\d+]', '', user.get('phone'))
                if phone_clean:
                    payment_link_data['customer']['contact'] = phone_clean
        payment_link = client.payment_link.create(payment_link_data)
        if invoice_id:
            supabase.table('proforma_invoices').update({'razorpay_link_id': payment_link['id'], 'razorpay_url': payment_link['short_url']}).eq('id', invoice_id).execute()
            return {'success': True, 'invoice_id': invoice_id, 'payment_url': payment_link['short_url']}
        else:
            settings = get_global_settings_from_db(supabase)
            inv_settings = settings.get('invoice_settings', {})
            prefix = inv_settings.get('prefix', 'Gen/26-27/')
            seq = inv_settings.get('current_sequence', 1)
            invoice_number = f'{prefix}{str(seq).zfill(3)}'
            inv_settings['current_sequence'] = seq + 1
            settings['invoice_settings'] = inv_settings
            try:
                supabase.table('global_settings').upsert({'settings_key': 'invoice_settings', 'settings_value': inv_settings}, on_conflict='settings_key').execute()
            except Exception as e:
                print(f'Failed to save sequence to DB: {e}')
            invoice_data = {'id': reference_id, 'user_id': lead_id, 'sales_rep_id': current_user['id'], 'plan_id': plan_id, 'base_price': base_price, 'discount_percentage': discount, 'gst_percentage': gst_percentage, 'gst_amount': gst_amount, 'total_amount': total_amount, 'razorpay_link_id': payment_link['id'], 'razorpay_url': payment_link['short_url'], 'status': 'PENDING', 'invoice_number': invoice_number, 'invoice_date': datetime.now().strftime('%Y-%m-%d')}
            try:
                supabase.table('proforma_invoices').insert(invoice_data).execute()
            except Exception as db_err:
                print(f'Failed to insert proforma_invoices: {db_err}')
                raise HTTPException(status_code=500, detail=f"Database insert failed: {str(db_err)}. Please run the SQL script if you haven't.")
            return {'success': True, 'invoice_id': reference_id, 'payment_url': payment_link['short_url'], 'amount': total_amount, 'base_price': base_price, 'discount_percentage': discount, 'plan_name': plan['name'], 'invoice_number': invoice_number}
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
@router.get('/leads/{lead_id}/invoices')
async def get_proforma_invoices(lead_id: str, current_user: dict=Depends(get_current_user), supabase: Client=Depends(get_supabase_client)):
    try:
        res = supabase.table('proforma_invoices').select('*, plans:plan_id(name)').eq('user_id', lead_id).order('created_at', desc=True).execute()
        return {'success': True, 'data': res.data or []}
    except Exception as e:
        print(f'Error fetching invoices: {e}')
        return {'success': False, 'data': []}
@router.get('/invoices/{invoice_id}')
async def get_invoice_by_id(invoice_id: str, supabase: Client=Depends(get_supabase_client)):
    try:
        inv_res = supabase.table('proforma_invoices').select('*').eq('id', invoice_id).execute()
        if not inv_res.data:
            raise HTTPException(status_code=404, detail='Invoice not found')
        invoice_data = inv_res.data[0]
        plan_id = invoice_data.get('plan_id')
        if plan_id:
            plan_res = supabase.table('plans').select('*').eq('id', plan_id).execute()
            invoice_data['plans'] = plan_res.data[0] if plan_res.data else None
        user_id = invoice_data.get('user_id')
        if user_id:
            user_res = supabase.table('users').select('*').eq('id', user_id).execute()
            if not user_res.data:
                user_res = supabase.table('leads').select('*').eq('id', user_id).execute()
            invoice_data['users'] = user_res.data[0] if user_res.data else None
        settings = get_global_settings_from_db(supabase)
        return {'success': True, 'data': invoice_data, 'settings': settings}
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
@router.get('/invoices/{invoice_id}/pdf')
async def get_invoice_pdf(invoice_id: str, supabase: Client=Depends(get_supabase_client)):
    try:
        inv_res = supabase.table('proforma_invoices').select('*').eq('id', invoice_id).execute()
        if not inv_res.data:
            raise HTTPException(status_code=404, detail='Invoice not found')
        invoice_data = inv_res.data[0]
        plan_id = invoice_data.get('plan_id')
        if plan_id:
            plan_res = supabase.table('plans').select('*').eq('id', plan_id).execute()
            invoice_data['plans'] = plan_res.data[0] if plan_res.data else {}
        user_id = invoice_data.get('user_id')
        if user_id:
            user_res = supabase.table('users').select('*').eq('id', user_id).execute()
            if not user_res.data:
                user_res = supabase.table('leads').select('*').eq('id', user_id).execute()
            invoice_data['users'] = user_res.data[0] if user_res.data else {}
        settings = get_global_settings_from_db(supabase)
        user = invoice_data.get('users', {})
        plan = invoice_data.get('plans', {})
        company_info = settings.get('company_info', {})
        bank_details = settings.get('bank_details', {})
        inv_settings = settings.get('invoice_settings', {})
        pdf_bytes = generate_invoice_pdf(invoice_data, user, plan, company_info, bank_details, inv_settings)
        safe_name = str(invoice_data.get('invoice_number', 'Invoice')).replace('/', '-')
        return Response(content=pdf_bytes, media_type='application/pdf', headers={'Content-Disposition': f'attachment; filename="PI_{safe_name}.pdf"'})
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
