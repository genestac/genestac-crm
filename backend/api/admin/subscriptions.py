from fastapi import APIRouter, HTTPException, Depends
from supabase import Client
from db.supabase import get_supabase_client
from typing import Optional
from pydantic import BaseModel

router = APIRouter()

class SubscriptionCreate(BaseModel):
    user_id: str
    plan_id: Optional[str] = None
    variant_id: Optional[str] = None
    medicine_id: Optional[str] = None
    plan_type: str
    quantity: int = 1
    status: str = 'active'
    start_date: str
    end_date: Optional[str] = None
    next_delivery_date: Optional[str] = None

class SubscriptionUpdate(BaseModel):
    status: Optional[str] = None
    end_date: Optional[str] = None
    next_delivery_date: Optional[str] = None

@router.get("/")
async def list_subscriptions(
    status: Optional[str] = None,
    supabase: Client = Depends(get_supabase_client)
):
    """List all subscriptions, joined with users, plans, plan_variants, and inventory."""
    try:
        query = supabase.table("subscriptions").select(
            "*, users(name, phone, email), plans(name), plan_variants(duration_label), inventory(medicine_name)"
        ).order("created_at", desc=True)
        
        if status:
            query = query.eq("status", status)
            
        res = query.execute()
        return {"success": True, "data": res.data}
    except Exception as e:
        # Fallback if inventory or users relation fails
        try:
            query = supabase.table("subscriptions").select("*").order("created_at", desc=True)
            res = query.execute()
            return {"success": True, "data": res.data, "warning": "Failed to join relations. Did you run the SQL migration?"}
        except Exception as fallback_err:
            raise HTTPException(status_code=500, detail=str(fallback_err))

@router.post("/")
async def create_subscription(
    sub: SubscriptionCreate,
    supabase: Client = Depends(get_supabase_client)
):
    try:
        res = supabase.table("subscriptions").insert(sub.dict(exclude_none=True)).execute()
        return {"success": True, "data": res.data[0]}
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
