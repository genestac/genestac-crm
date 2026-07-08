from fastapi import APIRouter, Depends, HTTPException, Form, Request
from supabase import Client
from db.supabase import get_supabase_client
from api.deps import get_current_user

router = APIRouter()

@router.get("/plans")
async def list_plans(
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    # Fetch plans with their variants
    try:
        res = supabase.table("plans").select("*, plan_variants(*)").order("created_at", desc=True).execute()
        return {"data": res.data}
    except Exception:
        # Fallback if plan_variants table isn't created yet
        res = supabase.table("plans").select("*").order("created_at", desc=True).execute()
        return {"data": res.data}

@router.get("/sources")
async def list_sources(
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    res = supabase.table("user_sources").select("*").order("created_at", desc=True).execute()
    return {"data": res.data}

from pydantic import BaseModel
from typing import Optional, List

class VariantRequest(BaseModel):
    id: Optional[str] = None
    duration_label: str
    duration_days: int
    base_price: float
    discounted_price: Optional[float] = None
    discount_text: Optional[str] = None
    discount_end_date: Optional[str] = None
    is_active: Optional[bool] = True

class PlanCreateRequest(BaseModel):
    name: str
    description: Optional[str] = None
    cart_name: Optional[str] = None
    cadence: Optional[str] = None
    term: Optional[str] = None
    cta: Optional[str] = None
    features: Optional[List[str]] = []
    is_featured: Optional[bool] = False
    note: Optional[str] = None
    is_entry_level: Optional[bool] = False
    duration_value: Optional[int] = None
    duration_unit: Optional[str] = None
    price: Optional[float] = None
    gst_percentage: Optional[float] = 5.0
    variants: Optional[List[VariantRequest]] = []

class PlanUpdateRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    cart_name: Optional[str] = None
    cadence: Optional[str] = None
    term: Optional[str] = None
    cta: Optional[str] = None
    features: Optional[List[str]] = None
    is_featured: Optional[bool] = None
    note: Optional[str] = None
    is_entry_level: Optional[bool] = None
    is_active: Optional[bool] = None
    duration_value: Optional[int] = None
    duration_unit: Optional[str] = None
    price: Optional[float] = None
    gst_percentage: Optional[float] = None
    variants: Optional[List[VariantRequest]] = None

@router.post("/plans")
async def add_plan(
    request: PlanCreateRequest,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    data = request.dict(exclude_none=True)
    variants = data.pop("variants", [])
    
    response = supabase.table("plans").insert(data).execute()
    plan_id = response.data[0]["id"]
    
    if variants:
        variants_payload = []
        for v in variants:
            v["plan_id"] = plan_id
            if "id" in v: del v["id"]
            variants_payload.append(v)
        supabase.table("plan_variants").insert(variants_payload).execute()
        
    return {"success": True, "message": "Plan added successfully", "data": response.data}

@router.put("/plans/{plan_id}")
async def update_plan(
    plan_id: str,
    request: PlanUpdateRequest,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    try:
        data = request.dict(exclude_none=True)
        variants = None
        if request.variants is not None:
            variants = [v.dict() for v in request.variants]
            data.pop("variants", None)
            
        if data:
            response = supabase.table("plans").update(data).eq("id", plan_id).execute()
            
        if variants is not None:
            # Get existing variants
            existing = supabase.table("plan_variants").select("id").eq("plan_id", plan_id).execute()
            existing_ids = set([v["id"] for v in (existing.data or [])])
            
            new_ids = set([v["id"] for v in variants if v.get("id")])
            
            # Delete removed variants
            to_delete = existing_ids - new_ids
            if to_delete:
                supabase.table("plan_variants").delete().in_("id", list(to_delete)).execute()
                
            # Upsert remaining
            for v in variants:
                v["plan_id"] = plan_id
                v_id = v.get("id")
                if v_id:
                    supabase.table("plan_variants").update(v).eq("id", v_id).execute()
                else:
                    v.pop("id", None)
                    supabase.table("plan_variants").insert(v).execute()
                
        return {"success": True, "message": "Plan updated successfully"}
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/sources")
async def add_source(
    name: str = Form(...),
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    response = supabase.table("user_sources").insert({"name": name}).execute()
    return {"success": True, "message": "Source added successfully", "data": response.data}

@router.put("/plans/{plan_id}/toggle")
async def toggle_plan(
    plan_id: str,
    is_active: bool = Form(...),
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    supabase.table("plans").update({"is_active": is_active}).eq("id", plan_id).execute()
    return {"success": True, "message": "Plan toggled successfully"}

@router.put("/sources/{source_id}/toggle")
async def toggle_source(
    source_id: str,
    is_active: bool = Form(...),
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    supabase.table("user_sources").update({"is_active": is_active}).eq("id", source_id).execute()
    return {"success": True, "message": "Source toggled successfully"}

import os
import json

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "data")
GLOBAL_SETTINGS_FILE = os.path.join(DATA_DIR, "global_settings.json")

def get_global_settings_from_db(supabase: Client):
    default_settings = {
        "shared_lead_pool": False,
        "company_info": {
            "name": "GENESTAC THERAPEUTICS LLP",
            "address": "1st Floor, 106 Block-A, Unitech Business Zone,\\nSouth City-2, Gurugram, Haryana, 122018",
            "gstin": "06AAWFG7278E1ZU",
            "state_name": "Haryana",
            "state_code": "06",
            "logo_text": "[ Company Logo Space ]"
        },
        "bank_details": {
            "bank_name": "Hdfc Bank",
            "account_no": "50200101417442",
            "branch_ifsc": "EMAAR MGF EMERALD HILLS & HDFC0006067"
        },
        "invoice_settings": {
            "prefix": "Gen/26-27/",
            "current_sequence": 2,
            "declaration": "We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct."
        },
        "lead_statuses": [
            {"value": "NEW", "label": "New"},
            {"value": "UNREAD", "label": "Unread"},
            {"value": "CONTACT_ATTEMPTED", "label": "Contact Attempted"},
            {"value": "ASSIGNED", "label": "Assigned"},
            {"value": "QUALIFIED", "label": "Qualified"},
            {"value": "CONSULTATION_SCHEDULED", "label": "Consultation Scheduled"},
            {"value": "SPAM", "label": "Spam"},
            {"value": "DEAD", "label": "Dead"}
        ]
    }
    
    try:
        res = supabase.table("global_settings").select("*").execute()
        data = default_settings.copy()
        if res.data:
            for row in res.data:
                key = row["settings_key"]
                val = row["settings_value"]
                
                # Merge logic
                if key in data and isinstance(data[key], dict) and isinstance(val, dict):
                    data[key].update(val)
                else:
                    data[key] = val
        return data
    except Exception as e:
        print(f"Failed to load settings from DB: {e}")
        return default_settings

@router.get("/global")
async def get_global_settings(
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    return {"data": get_global_settings_from_db(supabase)}

from pydantic import BaseModel
from typing import Optional, Dict, Any, List

class GlobalSettingsUpdate(BaseModel):
    shared_lead_pool: Optional[bool] = None
    company_info: Optional[Dict[str, Any]] = None
    bank_details: Optional[Dict[str, Any]] = None
    invoice_settings: Optional[Dict[str, Any]] = None
    lead_statuses: Optional[List[Dict[str, Any]]] = None

@router.put("/global")
async def update_global_settings(
    request: Request,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    try:
        if current_user.get("role") not in ["SUPER_ADMIN", "superadmin", "master_admin"]:
            raise HTTPException(status_code=403, detail="Not authorized")
            
        data = await request.json()
        settings = get_global_settings_from_db(supabase)
        
        # Deep merge
        def deep_update(d, u):
            for k, v in u.items():
                if isinstance(v, dict):
                    d[k] = deep_update(d.get(k, {}), v)
                else:
                    d[k] = v
            return d
            
        updated = deep_update(settings, data)
        
        # Save to DB
        for key, val in updated.items():
            supabase.table("global_settings").upsert({
                "settings_key": key,
                "settings_value": val
            }, on_conflict="settings_key").execute()
            
        return {"success": True, "data": updated}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/invoices/{invoice_id}")
async def delete_proforma_invoice(
    invoice_id: str,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    if current_user.get("role") not in ["SUPER_ADMIN", "superadmin", "master_admin"]:
        raise HTTPException(status_code=403, detail="Only Super Admins can delete invoices")
        
    try:
        supabase.table("proforma_invoices").delete().eq("id", invoice_id).execute()
        return {"success": True, "message": "Invoice deleted"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
