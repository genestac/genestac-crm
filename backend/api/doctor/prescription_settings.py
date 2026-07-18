from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Body
from supabase import Client
from db.supabase import get_supabase_client
from api.deps import get_current_user
from services.cloudinary_service import upload_file_to_cloudinary
import json

router = APIRouter()
SETTINGS_KEY_PREFIX = "prescription_settings_"


def _get_doc_settings(doctor_id: str, supabase: Client) -> dict:
    key = f"{SETTINGS_KEY_PREFIX}{doctor_id}"
    res = supabase.table("global_settings").select("settings_value").eq("settings_key", key).execute()
    if res.data:
        val = res.data[0]["settings_value"]
        if isinstance(val, str):
            try:
                return json.loads(val)
            except Exception:
                return {}
        return val or {}
    return {}


def _save_doc_settings(doctor_id: str, settings: dict, supabase: Client):
    key = f"{SETTINGS_KEY_PREFIX}{doctor_id}"
    supabase.table("global_settings").upsert(
        {"settings_key": key, "settings_value": settings},
        on_conflict="settings_key"
    ).execute()


@router.get("/prescription-settings")
async def get_prescription_settings(
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client),
):
    settings = _get_doc_settings(current_user["id"], supabase)
    return settings


@router.post("/prescription-settings")
async def save_prescription_settings(
    data: dict = Body(...),
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client),
):
    existing = _get_doc_settings(current_user["id"], supabase)
    existing.update(data)
    _save_doc_settings(current_user["id"], existing, supabase)
    return {"success": True, "settings": existing}


@router.post("/prescription-settings/signature")
async def upload_doctor_signature(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client),
):
    try:
        url = upload_file_to_cloudinary(file, folder="genestac/signatures")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    
    existing = _get_doc_settings(current_user["id"], supabase)
    existing["signature_url"] = url
    _save_doc_settings(current_user["id"], existing, supabase)
    return {"success": True, "signature_url": url}
