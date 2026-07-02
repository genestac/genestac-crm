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
