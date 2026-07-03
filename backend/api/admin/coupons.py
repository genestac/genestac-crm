from fastapi import APIRouter, Depends, HTTPException, Form
from supabase import Client
from db.supabase import get_supabase_client
from api.deps import get_current_user
import json

router = APIRouter()

def verify_manager_or_admin(current_user: dict, supabase: Client):
    role_name = current_user.get("role")
    if role_name not in ["superadmin", "master_admin", "admin", "manager"]:
        raise HTTPException(status_code=403, detail="Unauthorized. Manager or Admin access required.")

@router.get("/")
async def list_coupons(
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    verify_manager_or_admin(current_user, supabase)
    try:
        res = supabase.table("coupons").select("*").order("created_at", desc=True).execute()
        coupons_data = res.data
    except Exception as e:
        print(f"Skipping coupons table fetch (may not exist): {e}")
        coupons_data = []
        
    try:
        # Fetch plans
        plans_res = supabase.table("plans").select("id, name, price").execute()
        plans_data = plans_res.data or []
        
        # Fetch all variants
        variants_res = supabase.table("plan_variants").select("id, plan_id, duration_label, duration_days, base_price, discounted_price").execute()
        variants_data = variants_res.data or []
        
        # Join variants into plans
        for plan in plans_data:
            plan["plan_variants"] = [v for v in variants_data if v["plan_id"] == plan["id"]]
    except Exception as e:
        print(f"Error fetching plans or variants: {e}")
        plans_data = []
    
    return {"data": coupons_data, "plans": plans_data}

from pydantic import BaseModel
from typing import Optional, Dict

class CreateCouponRequest(BaseModel):
    influencer_name: str
    influencer_email: Optional[str] = None
    influencer_phone: Optional[str] = None
    coupon_code: str
    start_date: str
    end_date: Optional[str] = None
    plan_discounts: Dict[str, float]
    max_uses: Optional[int] = None

@router.post("/")
async def create_coupon(
    request: CreateCouponRequest,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    verify_manager_or_admin(current_user, supabase)
    
    try:
        # Check if code exists
        existing = supabase.table("coupons").select("id").eq("coupon_code", request.coupon_code.upper()).execute()
        if existing.data:
            raise HTTPException(status_code=400, detail="Coupon code already exists")
            
        data = {
            "influencer_name": request.influencer_name,
            "influencer_email": request.influencer_email,
            "influencer_phone": request.influencer_phone,
            "coupon_code": request.coupon_code.upper(),
            "start_date": request.start_date,
            "end_date": request.end_date,
            "plan_discounts": request.plan_discounts,
            "max_uses": request.max_uses,
            "is_active": True
        }
        
        response = supabase.table("coupons").insert(data).execute()
        return {"success": True, "message": "Coupon created", "data": response.data}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.put("/{coupon_id}/toggle")
async def toggle_coupon(
    coupon_id: str,
    is_active: bool = Form(...),
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    verify_manager_or_admin(current_user, supabase)
    supabase.table("coupons").update({"is_active": is_active}).eq("id", coupon_id).execute()
    return {"success": True, "message": "Coupon status updated"}

class UpdateCouponRequest(BaseModel):
    influencer_name: Optional[str] = None
    influencer_email: Optional[str] = None
    influencer_phone: Optional[str] = None
    coupon_code: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    plan_discounts: Optional[Dict[str, float]] = None
    max_uses: Optional[int] = None
    is_active: Optional[bool] = None

@router.put("/{coupon_id}")
async def update_coupon(
    coupon_id: str,
    request: UpdateCouponRequest,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    verify_manager_or_admin(current_user, supabase)

    # Build payload with only the fields that were provided
    payload = {k: v for k, v in request.dict().items() if v is not None}

    if "coupon_code" in payload:
        new_code = payload["coupon_code"].upper()
        # Check uniqueness (excluding self)
        existing = supabase.table("coupons").select("id").eq("coupon_code", new_code).neq("id", coupon_id).execute()
        if existing.data:
            raise HTTPException(status_code=400, detail="Coupon code already exists")
        payload["coupon_code"] = new_code

    if not payload:
        raise HTTPException(status_code=400, detail="No fields to update")

    response = supabase.table("coupons").update(payload).eq("id", coupon_id).execute()
    return {"success": True, "message": "Coupon updated", "data": response.data}

@router.delete("/{coupon_id}")
async def delete_coupon(
    coupon_id: str,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    verify_manager_or_admin(current_user, supabase)
    supabase.table("coupons").delete().eq("id", coupon_id).execute()
    return {"success": True, "message": "Coupon deleted"}

