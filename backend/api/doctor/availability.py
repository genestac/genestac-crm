from fastapi import APIRouter, Depends, HTTPException, Body
from supabase import Client
from db.supabase import get_supabase_client
from api.deps import get_current_user
from typing import Dict, Any

router = APIRouter()

@router.get("/availability")
async def get_availability(
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    try:
        response = supabase.table("doctor_schedules").select("*").eq("staff_id", current_user["id"]).single().execute()
        return response.data
    except Exception as e:
        if "contains 0 rows" in str(e) or "JSON object requested" in str(e):
            return {
                "is_active": False,
                "start_time": "09:00:00",
                "end_time": "17:00:00",
                "available_days": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
                "slot_duration_minutes": 10,
                "buffer_minutes": 0,
            }
        print(f"DEBUG: Error fetching doctor availability: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/availability")
async def update_availability(
    payload: Dict[str, Any] = Body(...),
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    try:
        is_active   = payload.get("is_active", False)
        start_time  = payload.get("start_time", "09:00:00")
        end_time    = payload.get("end_time", "17:00:00")
        available_days       = payload.get("available_days", [])
        slot_duration_minutes = payload.get("slot_duration_minutes", 10)
        buffer_minutes        = payload.get("buffer_minutes", 0)

        existing = supabase.table("doctor_schedules").select("id").eq("staff_id", current_user["id"]).execute()

        data_to_save = {
            "is_active":             is_active,
            "start_time":            start_time,
            "end_time":              end_time,
            "available_days":        available_days,
            "slot_duration_minutes": slot_duration_minutes,
            "buffer_minutes":        buffer_minutes,
        }

        if existing.data and len(existing.data) > 0:
            response = supabase.table("doctor_schedules").update(data_to_save).eq("staff_id", current_user["id"]).execute()
        else:
            data_to_save["staff_id"] = current_user["id"]
            data_to_save["exotel_number"] = "+910000000000"  # placeholder
            response = supabase.table("doctor_schedules").insert(data_to_save).execute()

        if not response.data:
            raise HTTPException(status_code=500, detail="Failed to save availability")

        return response.data[0]
    except Exception as e:
        print(f"DEBUG: Error updating doctor availability: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
