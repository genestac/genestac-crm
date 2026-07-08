from fastapi import APIRouter, Depends, HTTPException, Form, Body
from supabase import Client
from db.supabase import get_supabase_client
from api.deps import get_current_user
from typing import Any, Dict, List
import datetime
router = APIRouter()


@router.post('/assessments')
async def add_clinical_assessment(data: dict=Body(...), current_user: dict=Depends(get_current_user), supabase: Client=Depends(get_supabase_client)):
    payload = {'patient_id': data.get('patientId'), 'recorded_by': current_user['id'], 'weight_kg': float(data.get('weight')) if data.get('weight') else None, 'conditions': data.get('conditions', {}), 'doctor_timeline_notes': data.get('notes')}
    supabase.table('clinical_assessments').insert(payload).execute()
    return {'success': True}
