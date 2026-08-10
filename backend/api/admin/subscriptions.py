from fastapi import APIRouter, HTTPException, Depends
from supabase import Client
from db.supabase import get_supabase_client
from typing import Optional
from pydantic import BaseModel
from datetime import date, timedelta

router = APIRouter()

class SubscriptionCreate(BaseModel):
    user_id: str
    plan_id: Optional[str] = None
    variant_id: Optional[str] = None
    medicine_id: Optional[str] = None
    plan_type: str
    quantity: int = 1
    status: str = 'active'
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    next_delivery_date: Optional[str] = None

class SubscriptionUpdate(BaseModel):
    status: Optional[str] = None
    end_date: Optional[str] = None
    next_delivery_date: Optional[str] = None

class SubscriptionUpgrade(BaseModel):
    plan_id: str
    variant_id: str

@router.get("/")
async def list_subscriptions(
    status: Optional[str] = None,
    supabase: Client = Depends(get_supabase_client)
):
    """List all subscriptions, joined with users, plans, plan_variants, and inventory."""
    try:
        query = supabase.table("subscriptions").select(
            "*, users(name, phone, email), plans(name), plan_variants(duration_label, duration_days), inventory(name)"
        ).order("created_at", desc=True)
        
        if status:
            query = query.eq("status", status)
            
        res = query.execute()
        return {"success": True, "data": res.data}
    except Exception as e:
        # Fallback if relation fails
        try:
            query = supabase.table("subscriptions").select("*").order("created_at", desc=True)
            res = query.execute()
            return {"success": True, "data": res.data, "warning": "Failed to join relations."}
        except Exception as fallback_err:
            raise HTTPException(status_code=500, detail=str(fallback_err))

@router.get("/plans-and-variants")
async def get_plans_and_variants(supabase: Client = Depends(get_supabase_client)):
    """Return all plans with their variants, for use in upgrade dropdowns."""
    plans_res = supabase.table("plans").select("id, name").execute()
    variants_res = supabase.table("plan_variants").select("id, plan_id, duration_label, duration_days, base_price").execute()
    return {"success": True, "plans": plans_res.data, "variants": variants_res.data}

@router.post("/")
async def create_subscription(
    sub: SubscriptionCreate,
    supabase: Client = Depends(get_supabase_client)
):
    """Create a subscription. Prevents duplicate active subscriptions per user per plan."""
    try:
        # Prevent duplicate: check if this user already has an active subscription for this plan
        if sub.plan_id:
            existing = supabase.table("subscriptions").select("id").eq("user_id", sub.user_id).eq("plan_id", sub.plan_id).eq("status", "active").execute()
            if existing.data:
                raise HTTPException(status_code=409, detail="User already has an active subscription for this plan. Use upgrade instead.")

        # Auto-calculate end_date from variant duration_days
        start = sub.start_date or str(date.today())
        end = sub.end_date
        if not end and sub.variant_id:
            variant_res = supabase.table("plan_variants").select("duration_days").eq("id", sub.variant_id).single().execute()
            if variant_res.data:
                duration = variant_res.data.get("duration_days", 30)
                end = str(date.fromisoformat(start) + timedelta(days=duration))

        data = sub.dict(exclude_none=True)
        data["start_date"] = start
        if end:
            data["end_date"] = end

        res = supabase.table("subscriptions").insert(data).execute()
        return {"success": True, "data": res.data[0]}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/{sub_id}")
async def update_subscription(
    sub_id: str,
    sub: SubscriptionUpdate,
    supabase: Client = Depends(get_supabase_client)
):
    try:
        res = supabase.table("subscriptions").update(sub.dict(exclude_unset=True)).eq("id", sub_id).execute()
        if not res.data:
            raise HTTPException(status_code=404, detail="Subscription not found")
        return {"success": True, "data": res.data[0]}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/{sub_id}/upgrade")
async def upgrade_subscription(
    sub_id: str,
    upgrade: SubscriptionUpgrade,
    supabase: Client = Depends(get_supabase_client)
):
    """Upgrade a subscription to a new plan/variant. Marks old as cancelled and creates new active one."""
    try:
        # Fetch the existing subscription
        existing = supabase.table("subscriptions").select("*").eq("id", sub_id).single().execute()
        if not existing.data:
            raise HTTPException(status_code=404, detail="Subscription not found")
        
        old_sub = existing.data

        # Cancel the old one
        supabase.table("subscriptions").update({"status": "cancelled"}).eq("id", sub_id).execute()

        # Calculate new end_date
        start = str(date.today())
        variant_res = supabase.table("plan_variants").select("duration_days").eq("id", upgrade.variant_id).single().execute()
        duration = variant_res.data.get("duration_days", 30) if variant_res.data else 30
        end = str(date.today() + timedelta(days=duration))

        # Create the new upgraded subscription
        new_sub = {
            "user_id": old_sub["user_id"],
            "plan_id": upgrade.plan_id,
            "variant_id": upgrade.variant_id,
            "plan_type": old_sub.get("plan_type", "Weight Loss Plan"),
            "quantity": old_sub.get("quantity", 1),
            "status": "active",
            "start_date": start,
            "end_date": end,
        }
        new_res = supabase.table("subscriptions").insert(new_sub).execute()
        return {"success": True, "data": new_res.data[0]}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
