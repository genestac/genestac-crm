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
async def generate_payment_link(
    lead_id: str,
    # ── New cart-based params ─────────────────────────────────────────────────
    cart_id: Optional[str] = Form(None),          # use existing active cart
    inventory_id: Optional[str] = Form(None),     # quick: single inventory item
    inventory_quantity: int = Form(1),
    # ── Legacy plan-based params (backward-compatible) ────────────────────────
    plan_id: Optional[str] = Form(None),
    discount: float = Form(0),
    invoice_id: Optional[str] = Form(None),
    # ─────────────────────────────────────────────────────────────────────────
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client),
):
    try:
        from services.cart_service import (
            get_or_create_active_cart,
            add_inventory_to_cart,
            add_plan_to_cart,
            create_pi_from_cart,
            clear_cart_items,
        )

        # ── Path 1: Re-generate Razorpay link for existing invoice ────────────
        if invoice_id:
            inv_res = supabase.table('proforma_invoices').select('*').eq('id', invoice_id).execute()
            if not inv_res.data:
                raise HTTPException(status_code=404, detail='Invoice not found')
            existing_inv = inv_res.data[0]
            total_amount = existing_inv['total_amount']

            # Get item description
            item_name = 'Subscription'
            if existing_inv.get('cart_id'):
                items_res = supabase.table('cart_items').select('item_name').eq(
                    'cart_id', existing_inv['cart_id']
                ).limit(1).execute()
                if items_res.data:
                    item_name = items_res.data[0]['item_name']
            elif existing_inv.get('plan_id'):
                plan_res = supabase.table('plans').select('name').eq('id', existing_inv['plan_id']).execute()
                item_name = plan_res.data[0]['name'] if plan_res.data else 'Subscription'

            key_id = os.environ.get('RAZORPAY_KEY_ID')
            key_secret = os.environ.get('RAZORPAY_KEY_SECRET')
            if not key_id or not key_secret:
                raise HTTPException(status_code=500, detail='Razorpay keys not configured')
            client = razorpay.Client(auth=(key_id, key_secret))
            amount_in_paise = int(total_amount * 100)
            payment_link_data = {
                'amount': amount_in_paise, 'currency': 'INR',
                'accept_partial': False,
                'description': f'Payment for {item_name} (PI {existing_inv.get("invoice_number", "")})',
                'reference_id': invoice_id + '_ref',
                'reminder_enable': True,
            }
            user_res = supabase.table('leads').select('name, email, phone_number').eq('id', lead_id).execute()
            if not user_res.data:
                user_res = supabase.table('users').select('name, email, phone').eq('id', lead_id).execute()
            if user_res.data:
                u = user_res.data[0]
                payment_link_data['customer'] = {'name': u.get('name') or 'Customer'}
                if u.get('email'):
                    payment_link_data['customer']['email'] = u['email']
                phone_key = 'phone_number' if 'phone_number' in u else 'phone'
                if u.get(phone_key):
                    import re
                    payment_link_data['customer']['contact'] = re.sub(r'[^\d+]', '', u[phone_key])
            payment_link = client.payment_link.create(payment_link_data)
            supabase.table('proforma_invoices').update({
                'razorpay_link_id': payment_link['id'],
                'razorpay_url': payment_link['short_url'],
            }).eq('id', invoice_id).execute()
            return {
                'success': True, 'invoice_id': invoice_id,
                'payment_url': payment_link['short_url'],
            }

        # ── Path 2: Cart-based PI (new preferred flow) ────────────────────────
        if cart_id or inventory_id:
            # Get or create cart
            active_cart_id = cart_id
            if not active_cart_id:
                active_cart_id = get_or_create_active_cart(
                    supabase=supabase, lead_id=lead_id, source='sales_rep'
                )

            if inventory_id:
                # Clear existing items and add the new one
                clear_cart_items(supabase, active_cart_id)
                add_inventory_to_cart(
                    supabase=supabase,
                    cart_id=active_cart_id,
                    inventory_id=inventory_id,
                    quantity=inventory_quantity,
                    discount_pct=discount if discount else 10.0,
                )

            pi = create_pi_from_cart(
                supabase=supabase,
                cart_id=active_cart_id,
                lead_id=lead_id,
                source='sales_rep',
                sales_rep_id=current_user['id'],
            )
            return {
                'success': True,
                'invoice_id': pi['invoice_id'],
                'invoice_number': pi['invoice_number'],
                'payment_url': pi.get('razorpay_url'),
                'total_amount': pi['total_amount'],
                'base_price': pi['base_price'],
                'discount_amount': pi['discount_amount'],
                'gst_amount': pi['gst_amount'],
                'items': pi['items'],
            }

        # ── Path 3: Legacy plan_id flow (backward-compatible) ─────────────────
        if not plan_id:
            raise HTTPException(
                status_code=400,
                detail='Provide cart_id, inventory_id, or plan_id'
            )

        variant_id = None
        if '|' in plan_id:
            plan_id, variant_id = plan_id.split('|')

        # Create a cart and add the plan
        active_cart_id = get_or_create_active_cart(
            supabase=supabase, lead_id=lead_id, source='sales_rep'
        )
        clear_cart_items(supabase, active_cart_id)
        add_plan_to_cart(
            supabase=supabase,
            cart_id=active_cart_id,
            plan_id=plan_id,
            variant_id=variant_id,
            discount_pct=discount,
        )
        pi = create_pi_from_cart(
            supabase=supabase,
            cart_id=active_cart_id,
            lead_id=lead_id,
            source='sales_rep',
            sales_rep_id=current_user['id'],
        )
        return {
            'success': True,
            'invoice_id': pi['invoice_id'],
            'invoice_number': pi['invoice_number'],
            'payment_url': pi.get('razorpay_url'),
            'amount': pi['total_amount'],
            'base_price': pi['base_price'],
            'discount_percentage': discount,
            'plan_name': pi['items'][0]['item_name'] if pi['items'] else '',
        }

    except HTTPException:
        raise
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

        # Resolve cart metadata (addresses, items, notes)
        cart_id = invoice_data.get('cart_id')
        if cart_id:
            try:
                cart_res = supabase.table('cart').select('notes').eq('id', cart_id).execute()
                if cart_res.data and cart_res.data[0].get('notes'):
                    meta = json.loads(cart_res.data[0]['notes'])
                    invoice_data['metadata'] = meta
                    invoice_data['billing_address'] = meta.get('billing_address')
                    invoice_data['shipping_address'] = meta.get('shipping_address')
                    invoice_data['place_of_supply'] = meta.get('place_of_supply')
                    invoice_data['place_of_delivery'] = meta.get('place_of_delivery')
                    if meta.get('items'):
                        invoice_data['items'] = meta.get('items')
            except Exception as _m_err:
                print(f"Error parsing cart notes metadata: {_m_err}")

            if not invoice_data.get('items'):
                try:
                    items_res = supabase.table('cart_items').select('*').eq('cart_id', cart_id).execute()
                    if items_res.data:
                        invoice_data['items'] = items_res.data
                except Exception as _ci_err:
                    print(f"Error fetching cart items: {_ci_err}")

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

        # Resolve product name and metadata from cart → cart_items
        cart_id = invoice_data.get('cart_id')
        if cart_id:
            try:
                cart_res = supabase.table('cart').select('notes').eq('id', cart_id).execute()
                if cart_res.data and cart_res.data[0].get('notes'):
                    meta = json.loads(cart_res.data[0]['notes'])
                    invoice_data['metadata'] = meta
                    invoice_data['billing_address'] = meta.get('billing_address')
                    invoice_data['shipping_address'] = meta.get('shipping_address')
                    invoice_data['place_of_supply'] = meta.get('place_of_supply')
                    invoice_data['place_of_delivery'] = meta.get('place_of_delivery')
                    if meta.get('items'):
                        invoice_data['items'] = meta.get('items')
            except Exception as _m_err:
                print(f"Error parsing cart notes in PDF: {_m_err}")

            try:
                items_res = supabase.table('cart_items').select(
                    'item_name, item_description, inventory_id, quantity, unit_mrp, line_total'
                ).eq('cart_id', cart_id).execute()
                if items_res.data:
                    if not invoice_data.get('items'):
                        invoice_data['items'] = items_res.data
                    names = [i.get('item_name') or i.get('item_description', '') for i in items_res.data]
                    invoice_data['item_name'] = ', '.join(n for n in names if n)
            except Exception as _ce:
                print(f'[PDF] cart_items lookup failed: {_ce}')

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

        prefix = "INV" if invoice_data.get("status") == "PAID" else "PI"
        safe_name = str(invoice_data.get('invoice_number', 'Invoice')).replace('/', '-')
        return Response(content=pdf_bytes, media_type='application/pdf', headers={'Content-Disposition': f'attachment; filename="{prefix}_{safe_name}.pdf"'})
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
