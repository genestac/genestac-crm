from fastapi import APIRouter, Depends, HTTPException, Form
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

def load_global_settings():
    if not os.path.exists(GLOBAL_SETTINGS_FILE):
        return {"shared_lead_pool": False}
    try:
        with open(GLOBAL_SETTINGS_FILE, "r") as f:
            return json.load(f)
    except:
        return {"shared_lead_pool": False}

@router.get("/global")
async def get_global_settings(
    current_user: dict = Depends(get_current_user)
):
    return {"data": load_global_settings()}

from pydantic import BaseModel
class GlobalSettingsUpdate(BaseModel):
    shared_lead_pool: bool

@router.put("/global")
async def update_global_settings(
    settings: GlobalSettingsUpdate,
    current_user: dict = Depends(get_current_user)
):
    if not os.path.exists(DATA_DIR):
        os.makedirs(DATA_DIR)
        
    current = load_global_settings()
    current["shared_lead_pool"] = settings.shared_lead_pool
    
    with open(GLOBAL_SETTINGS_FILE, "w") as f:
        json.dump(current, f, indent=2)
        
    return {"success": True, "message": "Settings updated", "data": current}
