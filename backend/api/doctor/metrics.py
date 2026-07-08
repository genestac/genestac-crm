from fastapi import APIRouter, Depends, HTTPException, Form, Body
from supabase import Client
from db.supabase import get_supabase_client
from api.deps import get_current_user
from typing import Any, Dict, List
import datetime
router = APIRouter()


@router.get('/metrics')
async def get_doctor_metrics(current_user: dict=Depends(get_current_user), supabase: Client=Depends(get_supabase_client)):
    start_of_day = datetime.datetime.now().replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    end_of_day = datetime.datetime.now().replace(hour=23, minute=59, second=59, microsecond=999999).isoformat()
    profile = supabase.table('staffs').select('roles(name)').eq('id', current_user['id']).single().execute()
    role_name = profile.data.get('roles', {}).get('name') if profile.data and profile.data.get('roles') else None
    is_admin = role_name in ['superadmin', 'master_admin', 'admin']
    daily_query = supabase.table('appointments').select('id', count='exact').gte('scheduled_at', start_of_day).lte('scheduled_at', end_of_day)
    total_query = supabase.table('appointments').select('id', count='exact').eq('status', 'completed')
    patients_query = supabase.table('appointments').select('patient_id').eq('status', 'completed')
    if not is_admin:
        daily_query = daily_query.eq('doctor_id', current_user['id'])
        total_query = total_query.eq('doctor_id', current_user['id'])
        patients_query = patients_query.eq('doctor_id', current_user['id'])
    daily_res = daily_query.execute()
    total_res = total_query.execute()
    patients_data = patients_query.execute()
    unique_patients = set()
    for p in patients_data.data:
        if p.get('patient_id'):
            unique_patients.add(p['patient_id'])
    monthly_revenue = len(unique_patients) * 500
    return {'dailyQueue': daily_res.count or 0, 'totalConsultations': total_res.count or 0, 'activePatients': len(unique_patients), 'treatmentSuccessRate': 85, 'monthlyRevenue': monthly_revenue}
