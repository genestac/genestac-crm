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
    res = supabase.table("plans").select("*").order("created_at", desc=True).execute()
    return {"data": res.data}

@router.get("/sources")
async def list_sources(
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    res = supabase.table("user_sources").select("*").order("created_at", desc=True).execute()
    return {"data": res.data}

@router.post("/plans")
async def add_plan(
    name: str = Form(...),
    price: float = Form(...),
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    response = supabase.table("plans").insert({"name": name, "price": price}).execute()
    return {"success": True, "message": "Plan added successfully", "data": response.data}

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
