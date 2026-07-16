from fastapi import APIRouter, HTTPException, Query
from supabase import Client
import datetime

router = APIRouter()

# Note: We create a fresh anonymous client or use a service role if needed.
# For public read of active coupons, the anon key is fine.
# We will inject the client directly or import get_supabase_client without user auth.
from db.supabase import get_supabase_client
from fastapi import Depends

@router.get("/validate-coupon")
async def validate_coupon(
    code: str = Query(..., description="The coupon code"),
    plan_id: str = Query(..., description="The ID of the plan the user is purchasing"),
    supabase: Client = Depends(get_supabase_client)
):
    """
    Public endpoint to validate a coupon code against a specific plan.
    Does NOT require authentication.
    """
    code = code.upper()
    
    # Fetch the coupon
    res = supabase.table("coupons").select("*").eq("coupon_code", code).single().execute()
    coupon = res.data
    
    if not coupon:
        raise HTTPException(status_code=404, detail="Invalid coupon code")
        
    if not coupon.get("is_active"):
        raise HTTPException(status_code=400, detail="This coupon is no longer active")
        
    now = datetime.datetime.now(datetime.timezone.utc)
    
    # Check dates
    start_date = datetime.datetime.fromisoformat(coupon["start_date"].replace('Z', '+00:00'))
    if now < start_date:
        raise HTTPException(status_code=400, detail="This coupon is not yet active")
        
    if coupon.get("end_date"):
        end_date = datetime.datetime.fromisoformat(coupon["end_date"].replace('Z', '+00:00'))
        if now > end_date:
            raise HTTPException(status_code=400, detail="This coupon has expired")
            
    # Check usage limit
    max_uses = coupon.get("max_uses")
    if max_uses is not None:
        usage_count = coupon.get("usage_count") or 0
        if usage_count >= max_uses:
            raise HTTPException(status_code=400, detail="This coupon has reached its maximum usage limit")
            
    # Check plan validity
    plan_discounts = coupon.get("plan_discounts") or {}
    
    # It might be stored as string if it's JSON encoded, but Supabase JSONB comes as dict
    if isinstance(plan_discounts, str):
        import json
        try:
            plan_discounts = json.loads(plan_discounts)
        except:
            plan_discounts = {}
            
    if plan_id not in plan_discounts:
        raise HTTPException(status_code=400, detail="This coupon is not valid for the selected plan")
        
    discount_percentage = float(plan_discounts[plan_id])
    
    return {
        "success": True,
        "valid": True,
        "discount_percentage": discount_percentage,
        "coupon_id": coupon["id"]
    }

from pydantic import BaseModel
from typing import Optional, Any

class WhatsAppLeadUpdate(BaseModel):
    phone_number: str
    name: Optional[str] = None
    medical_condition: Optional[str] = None
    step: Optional[str] = None
    wants_call: Optional[bool] = None
    metadata: Optional[dict] = None

@router.get("/whatsapp-lead/{phone_number}")
async def get_whatsapp_lead(phone_number: str, supabase: Client = Depends(get_supabase_client)):
    """
    Fetch a lead by phone number to personalize WhatsApp messages.
    Checks users table first, then leads table.
    """
    clean_phone = phone_number.replace("+", "").replace(" ", "").replace("-", "")
    
    # Check users table
    res_users = supabase.table("users").select("*").ilike("phone", f"%{clean_phone}%").execute()
    if res_users.data:
        return {"exists": True, "record_type": "USER", "data": res_users.data[0]}
        
    # Check leads table
    res_leads = supabase.table("leads").select("*").ilike("phone_number", f"%{clean_phone}%").execute()
    if res_leads.data:
        return {"exists": True, "record_type": "LEAD", "data": res_leads.data[0]}
        
    return {"exists": False, "data": None}

@router.post("/whatsapp-lead")
async def update_whatsapp_lead(payload: WhatsAppLeadUpdate, supabase: Client = Depends(get_supabase_client)):
    """
    Create or update a lead from WhatsApp bot.
    """
    clean_phone = payload.phone_number.replace("+", "").replace(" ", "").replace("-", "")
    
    # 1. Find existing
    existing = None
    table = "leads"
    phone_field = "phone_number"
    
    res_users = supabase.table("users").select("id, metadata").ilike("phone", f"%{clean_phone}%").execute()
    if res_users.data:
        existing = res_users.data[0]
        table = "users"
        phone_field = "phone"
    else:
        res_leads = supabase.table("leads").select("id, metadata").ilike("phone_number", f"%{clean_phone}%").execute()
        if res_leads.data:
            existing = res_leads.data[0]
            table = "leads"
            phone_field = "phone_number"

    # 2. Build update payload
    update_data = {}
    if payload.name:
        update_data["name"] = payload.name
        
    # Handle metadata for custom fields like step, condition, wants_call
    metadata = existing.get("metadata", {}) if existing else {}
    if payload.step:
        metadata["whatsapp_step"] = payload.step
    if payload.medical_condition:
        metadata["medical_condition"] = payload.medical_condition
    if payload.wants_call is not None:
        metadata["wants_call"] = payload.wants_call
    if payload.metadata:
        metadata.update(payload.metadata)
        
    update_data["metadata"] = metadata
    
    # 3. Update or Insert
    if existing:
        res = supabase.table(table).update(update_data).eq("id", existing["id"]).execute()
        return {"success": True, "action": "updated", "data": res.data[0] if res.data else None}
    else:
        # Create new lead
        update_data[phone_field] = payload.phone_number
        update_data["status"] = "NEW"
        
        # Optionally link to WhatsApp source if we know the ID, or let them pass it in metadata
        whatsapp_source_id = "936ddc7e-f841-41f8-bccc-06820a5d33c4" # From earlier query
        update_data["source_id"] = whatsapp_source_id
        
        res = supabase.table("leads").insert(update_data).execute()
        return {"success": True, "action": "created", "data": res.data[0] if res.data else None}

