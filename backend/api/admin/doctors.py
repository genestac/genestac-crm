from fastapi import APIRouter, Depends, HTTPException, Body
from supabase import Client
from db.supabase import get_supabase_client
from api.deps import get_current_user
from typing import Dict, Any

router = APIRouter()

def _check_admin(current_user: dict):
    role = current_user.get("role", "")
    if role not in ["admin", "superadmin", "master_admin", "SUPER_ADMIN"]:
        raise HTTPException(status_code=403, detail="Not authorized")

@router.get("/")
def get_doctors(
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    _check_admin(current_user)
    try:
        # Fetch all staffs with 'doctor' role
        res = supabase.table('staffs').select('*, roles!inner(name)').eq('roles.name', 'doctor').execute()
        doctors = res.data or []
        
        # Fetch their schedules
        sched_res = supabase.table('doctor_schedules').select('*').execute()
        schedules = {s["staff_id"]: s for s in sched_res.data} if sched_res.data else {}
        
        for doc in doctors:
            doc["schedule"] = schedules.get(doc["id"], None)
            
        return doctors
    except Exception as e:
        print(f"DEBUG: Error fetching admin doctors: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{doctor_id}")
def get_doctor_details(
    doctor_id: str,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    _check_admin(current_user)
    try:
        res = supabase.table('staffs').select('*, roles!inner(name)').eq('id', doctor_id).single().execute()
        if not res.data:
            raise HTTPException(status_code=404, detail="Doctor not found")
        
        doc = res.data
        sched_res = supabase.table('doctor_schedules').select('*').eq('staff_id', doctor_id).execute()
        doc["schedule"] = sched_res.data[0] if sched_res.data else None
        
        return doc
    except Exception as e:
        print(f"DEBUG: Error fetching doctor details: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{doctor_id}/schedule")
def update_doctor_schedule(
    doctor_id: str,
    payload: Dict[str, Any] = Body(...),
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    _check_admin(current_user)
    try:
        data_to_save = {
            "is_active": payload.get("is_active", False),
            "allow_ai_calls": payload.get("allow_ai_calls", True),
            "allow_scheduling": payload.get("allow_scheduling", True),
            "start_time": payload.get("start_time", "09:00:00"),
            "end_time": payload.get("end_time", "17:00:00"),
            "available_days": payload.get("available_days", []),
            "slot_duration_minutes": payload.get("slot_duration_minutes", 10),
            "buffer_minutes": payload.get("buffer_minutes", 0),
        }
        
        # Check if schedule exists
        existing = supabase.table("doctor_schedules").select("id").eq("staff_id", doctor_id).execute()
        
        if existing.data and len(existing.data) > 0:
            response = supabase.table("doctor_schedules").update(data_to_save).eq("staff_id", doctor_id).execute()
        else:
            data_to_save["staff_id"] = doctor_id
            response = supabase.table("doctor_schedules").insert(data_to_save).execute()
            
        if not response.data:
            raise HTTPException(status_code=500, detail="Failed to save availability")
            
        return response.data[0]
    except Exception as e:
        print(f"DEBUG: Error updating doctor schedule: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{doctor_id}/consultations")
def get_doctor_consultations(
    doctor_id: str,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    _check_admin(current_user)
    try:
        res = supabase.table('appointments').select(
            '*, patients:users!patient_id(id, name, email, phone)'
        ).eq('doctor_id', doctor_id).order('scheduled_at', desc=True).limit(50).execute()
        return res.data or []
    except Exception as e:
        print(f"DEBUG: Error fetching doctor consultations: {e}")
        raise HTTPException(status_code=500, detail=str(e))
