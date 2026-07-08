from fastapi import APIRouter, Depends, HTTPException, Form, Body
from supabase import Client
from db.supabase import get_supabase_client
from api.deps import get_current_user
from typing import Any, Dict, List
import datetime
router = APIRouter()


@router.get('/appointments')
async def get_appointments(current_user: dict=Depends(get_current_user), supabase: Client=Depends(get_supabase_client)):
    try:
        profile = supabase.table('staffs').select('roles(name)').eq('id', current_user['id']).single().execute()
        role_name = profile.data.get('roles', {}).get('name') if profile.data and profile.data.get('roles') else None
        is_admin = role_name in ['superadmin', 'master_admin', 'admin']
        print(f"DEBUG: User {current_user['id']} has role: {role_name}, is_admin: {is_admin}")
        query = supabase.table('appointments').select('*, patients:users!patient_id(id, name, phone, email), sales:staffs!sales_rep_id(id, full_name)')
        if not is_admin:
            query = query.eq('doctor_id', current_user['id'])
        response = query.order('scheduled_at', desc=False).execute()
        print(f"DEBUG: Retrieved {len(response.data)} appointments for user {current_user['id']}")
        return response.data
    except Exception as e:
        print(f'DEBUG: Error fetching appointments: {str(e)}')
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
@router.get('/appointments/{id}')
async def get_appointment_by_id(id: str, current_user: dict=Depends(get_current_user), supabase: Client=Depends(get_supabase_client)):
    response = supabase.table('appointments').select('*, patients:users!patient_id(id, name, phone, email), sales:staffs!sales_rep_id(id, full_name)').eq('id', id).single().execute()
    return response.data
@router.put('/appointments/{id}/status')
async def update_appointment_status(id: str, status: str=Body(embed=True), current_user: dict=Depends(get_current_user), supabase: Client=Depends(get_supabase_client)):
    supabase.table('appointments').update({'status': status}).eq('id', id).execute()
    return {'success': True}
@router.put('/appointments/{id}/details')
async def update_appointment_details(id: str, data: dict=Body(...), current_user: dict=Depends(get_current_user), supabase: Client=Depends(get_supabase_client)):
    supabase.table('appointments').update({'title': data.get('title'), 'type': data.get('type'), 'related_to': data.get('related_to'), 'location': data.get('location'), 'meeting_link': data.get('link'), 'notes': data.get('description'), 'duration_minutes': data.get('duration'), 'scheduled_at': data.get('scheduled_at')}).eq('id', id).execute()
    return {'success': True}
@router.post('/appointments')
async def create_next_appointment(data: dict=Body(...), current_user: dict=Depends(get_current_user), supabase: Client=Depends(get_supabase_client)):
    sales_rep_id = data.get('sales_rep_id')
    if not sales_rep_id:
        admin_res = supabase.table('staffs').select('id').eq('email', 'admin@example.com').single().execute()
        sales_rep_id = admin_res.data.get('id') if admin_res.data else current_user['id']
    payload = {'title': data.get('title'), 'type': data.get('type'), 'patient_id': data.get('patient_id'), 'doctor_id': current_user['id'], 'sales_rep_id': sales_rep_id, 'scheduled_at': data.get('scheduled_at'), 'duration_minutes': data.get('duration', 30), 'notes': data.get('description'), 'location': data.get('location'), 'meeting_link': data.get('link'), 'status': 'pending'}
    supabase.table('appointments').insert(payload).execute()
    return {'success': True}
@router.post('/appointments/{id}/payment-link')
async def generate_payment_link(id: str, planData: dict=Body(...), current_user: dict=Depends(get_current_user), supabase: Client=Depends(get_supabase_client)):
    import random, string
    mock_link = 'https://rzp.io/i/' + ''.join(random.choices(string.ascii_lowercase + string.digits, k=8))
    supabase.table('appointments').update({'plan_details': {'products': planData.get('products'), 'discount': planData.get('discount'), 'total': planData.get('total'), 'payment_link': mock_link, 'generated_at': datetime.datetime.now().isoformat()}, 'plan_id': planData.get('plan_id')}).eq('id', id).execute()
    return {'success': True, 'payment_link': mock_link}
@router.get('/')
async def get_all_doctors(current_user: dict=Depends(get_current_user), supabase: Client=Depends(get_supabase_client)):
    response = supabase.table('staffs').select('id, full_name, roles!inner(name)').eq('roles.name', 'doctor').execute()
    return {'data': response.data}
