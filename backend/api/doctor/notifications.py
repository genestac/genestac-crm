from fastapi import APIRouter, Depends, HTTPException
from supabase import Client
from db.supabase import get_supabase_client
from api.deps import get_current_user

router = APIRouter()

@router.get("/notifications")
async def get_notifications(
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    try:
        # Assuming target_id is the staff_id or user_id
        res = supabase.table("system_notifications").select("*").eq("target_id", current_user["id"]).order("created_at", desc=True).limit(50).execute()
        return res.data
    except Exception as e:
        print(f"DEBUG: Error fetching notifications: {str(e)}")
        # If table doesn't exist yet, return empty list safely
        if "Could not find the table" in str(e):
            return []
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/notifications/{notification_id}/read")
async def mark_notification_read(
    notification_id: str,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    try:
        res = supabase.table("system_notifications").update({"is_read": True}).eq("id", notification_id).eq("target_id", current_user["id"]).execute()
        if not res.data:
            raise HTTPException(status_code=404, detail="Notification not found")
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
