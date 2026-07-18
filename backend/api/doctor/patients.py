from fastapi import APIRouter, Depends, HTTPException, Form, Body
from supabase import Client
from db.supabase import get_supabase_client
from api.deps import get_current_user
from typing import Any, Dict, List
import datetime
router = APIRouter()


@router.get('/patients/{patient_id}/history')
async def get_patient_history(patient_id: str, current_user: dict=Depends(get_current_user), supabase: Client=Depends(get_supabase_client)):
    if patient_id == 'null' or patient_id == 'None' or not patient_id:
        return []
    response = supabase.table('clinical_assessments').select('*').eq('patient_id', patient_id).order('created_at', desc=False).execute()
    return response.data
@router.post('/patients/{patient_id}/adverse-events')
async def log_adverse_event(patient_id: str, eventDetails: str=Body(embed=True), current_user: dict=Depends(get_current_user), supabase: Client=Depends(get_supabase_client)):
    payload = {'patient_id': patient_id, 'recorded_by': current_user['id'], 'conditions': {'adverse_event': True, 'details': eventDetails}, 'doctor_timeline_notes': f'[ADVERSE EVENT LOGGED]: {eventDetails}'}
    supabase.table('clinical_assessments').insert(payload).execute()
    return {'success': True}
@router.get('/patients/{patient_id}/timeline')
async def fetch_patient_timeline(patient_id: str, current_user: dict=Depends(get_current_user), supabase: Client=Depends(get_supabase_client)):
    if patient_id == 'null' or patient_id == 'None' or not patient_id:
        return {'assessments': [], 'communications': []}
    assessments_res = supabase.table('clinical_assessments').select('id, created_at, doctor_timeline_notes, conditions, recorded_by, staffs!recorded_by(full_name, roles!inner(name))').eq('patient_id', patient_id).order('created_at', desc=False).execute()
    try:
        comms_res = supabase.table('communications').select('id, created_at, sales_rep_id, lead_id').eq('lead_id', patient_id).order('created_at', desc=False).execute()
        comms_data = comms_res.data or []
        sender_ids = list(set([c.get('sales_rep_id') for c in comms_data if c.get('sales_rep_id')]))
        staffs_dict = {}
        if sender_ids:
            staffs_res = supabase.table('staffs').select('id, full_name, roles!inner(name)').in_('id', sender_ids).execute()
            for s in (staffs_res.data or []):
                staffs_dict[s['id']] = s
        for c in comms_data:
            c['staffs'] = staffs_dict.get(c.get('sales_rep_id'))
    except Exception:
        comms_data = []
    return {'assessments': assessments_res.data or [], 'communications': comms_data}


@router.post('/patients/{patient_id}/timeline')
async def add_timeline_entry(patient_id: str, type: str=Body(embed=True), content: str=Body(embed=True), current_user: dict=Depends(get_current_user), supabase: Client=Depends(get_supabase_client)):
    if patient_id == 'null' or patient_id == 'None' or not patient_id:
        raise HTTPException(status_code=400, detail="Cannot add notes to an appointment without a registered patient profile.")
        
    if type == 'clinical':
        supabase.table('clinical_assessments').insert({'patient_id': patient_id, 'recorded_by': current_user['id'], 'doctor_timeline_notes': content}).execute()
    else:
        supabase.table('communications').insert({'lead_id': patient_id, 'sender_id': current_user['id'], 'content': content, 'type': 'note'}).execute()
    return {'success': True}
@router.post('/patients/{patient_id}/reports')
async def upload_patient_report(patient_id: str, appointmentId: str=Body(embed=True), fileData: dict=Body(embed=True), current_user: dict=Depends(get_current_user), supabase: Client=Depends(get_supabase_client)):
    supabase.table('patient_reports').insert({'patient_id': patient_id, 'appointment_id': appointmentId, 'uploaded_by': current_user['id'], 'title': fileData.get('title'), 'file_url': fileData.get('url'), 'file_type': fileData.get('type')}).execute()
    return {'success': True}
