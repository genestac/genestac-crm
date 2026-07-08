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

@router.post('/leads/{lead_id}/documents')
async def upload_lead_document(lead_id: str, file: UploadFile=File(...), current_user: dict=Depends(get_current_user), supabase: Client=Depends(get_supabase_client)):
    try:
        secure_url = upload_file_to_cloudinary(file, folder=f'genestac/leads/{lead_id}')
    except Exception as e:
        raise HTTPException(status_code=400, detail=f'Failed to upload file: {str(e)}')
    document_data = {'user_id': lead_id, 'file_name': file.filename, 'storage_path': secure_url}
    response = supabase.table('user_documents').insert(document_data).execute()
    return {'message': 'Document uploaded successfully', 'data': response.data, 'url': secure_url}
@router.get('/leads/{lead_id}/documents')
async def get_lead_documents(lead_id: str, current_user: dict=Depends(get_current_user), supabase: Client=Depends(get_supabase_client)):
    response = supabase.table('user_documents').select('*').eq('user_id', lead_id).order('uploaded_at', desc=True).execute()
    return {'data': response.data}
