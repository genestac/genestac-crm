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

@router.post('/appointments')
async def book_appointment(lead_id: str=Form(...), doctor_id: str=Form(...), date: str=Form(...), time: str=Form(...), notes: Optional[str]=Form(None), current_user: dict=Depends(get_current_user), supabase: Client=Depends(get_supabase_client)):
    scheduled_at = f'{date}T{time}:00'
    payload = {'patient_id': lead_id, 'doctor_id': doctor_id, 'sales_rep_id': current_user['id'], 'scheduled_at': scheduled_at, 'notes': notes, 'status': 'pending', 'duration_minutes': 10}
    response = supabase.table('appointments').insert(payload).execute()
    return {'message': 'Appointment booked successfully', 'data': response.data}
