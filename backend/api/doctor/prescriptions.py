from fastapi import APIRouter, Depends, HTTPException, Form, Body
from supabase import Client
from db.supabase import get_supabase_client
from api.deps import get_current_user
from typing import Any, Dict, List
import datetime
router = APIRouter()


@router.get('/patients/{patient_id}/prescriptions')
async def get_recent_prescriptions(patient_id: str, current_user: dict=Depends(get_current_user), supabase: Client=Depends(get_supabase_client)):
    response = supabase.table('prescriptions').select('*, prescription_items(id, dosage, frequency, duration_days, total_quantity_prescribed, inventory(name, sku))').eq('patient_id', patient_id).order('created_at', desc=True).execute()
    return response.data
@router.get('/prescriptions/{id}')
async def get_prescription_by_id(id: str, current_user: dict=Depends(get_current_user), supabase: Client=Depends(get_supabase_client)):
    response = supabase.table('prescriptions').select('*, patients:users!patient_id(id, name, phone, email), doctors:staffs!doctor_id(id, full_name, email, phone), prescription_items(id, dosage, frequency, duration_days, total_quantity_prescribed, time, before_lunch, after_lunch, inventory(name, sku))').eq('id', id).single().execute()
    return response.data
@router.post('/prescriptions')
async def write_prescription(data: dict=Body(...), current_user: dict=Depends(get_current_user), supabase: Client=Depends(get_supabase_client)):
    rx_payload = {'patient_id': data.get('patientId'), 'doctor_id': current_user['id'], 'general_instructions': data.get('instructions'), 'valid_until': data.get('validUntil'), 'status': 'active'}
    rx_res = supabase.table('prescriptions').insert(rx_payload).execute()
    rx_id = rx_res.data[0]['id']
    items = data.get('items', [])
    if items:
        items_payload = []
        for item in items:
            items_payload.append({'prescription_id': rx_id, 'inventory_id': item.get('inventoryId'), 'dosage': item.get('dosage'), 'frequency': item.get('frequency'), 'duration_days': int(item.get('durationDays', 30)), 'total_quantity_prescribed': int(item.get('quantity', 1)), 'before_lunch': bool(item.get('beforeLunch', False)), 'after_lunch': bool(item.get('afterLunch', False)), 'time': item.get('time')})
        supabase.table('prescription_items').insert(items_payload).execute()
    return {'success': True}
