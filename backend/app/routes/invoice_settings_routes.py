from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from supabase import Client
from typing import Dict, Any

from db.supabase import get_supabase_client
from api.deps import get_current_user
from services.cloudinary_service import upload_file_to_cloudinary
from api.admin.crm_settings import get_global_settings_from_db

router = APIRouter()

def require_admin(current_user: dict = Depends(get_current_user)):
    role = current_user.get("role")
    if role not in ["SUPER_ADMIN", "superadmin", "admin", "master_admin"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    return current_user

@router.post("/upload-assets")
async def upload_invoice_assets(
    logo: UploadFile = File(None),
    signature: UploadFile = File(None),
    admin_user: dict = Depends(require_admin),
    supabase: Client = Depends(get_supabase_client)
):
    """
    Uploads a logo and/or digital signature to Cloudinary and saves their URLs 
    in the global_settings under company_info.
    """
    try:
        settings = get_global_settings_from_db(supabase)
        company_info = settings.get("company_info", {})
        
        updates_made = False

        if logo:
            logo_url = upload_file_to_cloudinary(logo, folder="genestac/invoices")
            company_info["logo_url"] = logo_url
            updates_made = True
            
        if signature:
            signature_url = upload_file_to_cloudinary(signature, folder="genestac/invoices")
            company_info["signature_url"] = signature_url
            updates_made = True

        if updates_made:
            settings["company_info"] = company_info
            
            # Save back to db
            res = supabase.table("global_settings").upsert({
                "settings_key": "company_info",
                "settings_value": company_info
            }, on_conflict="settings_key").execute()
            
        return {"success": True, "company_info": company_info}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
