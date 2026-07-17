from fastapi import APIRouter, Depends, HTTPException, Body, Query
from supabase import Client
from db.supabase import get_supabase_client
from api.deps import get_current_user
from typing import Dict, Any, Optional

router = APIRouter()

def _check_admin(current_user: dict):
    role = current_user.get("role", "")
    if role not in ["admin", "superadmin", "master_admin", "SUPER_ADMIN"]:
        raise HTTPException(status_code=403, detail="Not authorized")

@router.get("/")
def get_consultations(
    status_filter: Optional[str] = Query(None, description="'upcoming', 'historical', or 'all'"),
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    _check_admin(current_user)
    try:
        # Note: Some patients are in `users` and some in `leads`. We try to join both.
        # However, PostgREST might complain if we join a table that patient_id doesn't link to.
        # If appointments.patient_id references auth.users, joining `leads` might fail.
        # But wait! I checked earlier and `patient_id` doesn't have an explicit FK to `leads`.
        # Let's just select `*` and fetch users and leads manually in python to avoid FK errors,
        # or rely on the fact that `appointments` is loosely coupled.
        
        # Actually, let's just do a basic select.
        res = supabase.table('appointments').select(
            '*, users!appointments_patient_id_fkey(id, name, email, phone), staffs!appointments_doctor_id_fkey(id, full_name)'
        ).order('scheduled_at', desc=True).limit(200).execute()
        
        data = res.data or []
        
        # We also want to fetch leads if they aren't in users
        patient_ids = [d["patient_id"] for d in data if d["patient_id"] and not d.get("users")]
        leads_map = {}
        if patient_ids:
            leads_res = supabase.table('leads').select('id, name, email, phone_number').in_('id', patient_ids).execute()
            if leads_res.data:
                leads_map = {l["id"]: l for l in leads_res.data}
                
        for d in data:
            if not d.get("users") and d.get("patient_id") in leads_map:
                lead = leads_map[d["patient_id"]]
                d["users"] = {
                    "id": lead["id"],
                    "name": lead.get("name"),
                    "email": lead.get("email"),
                    "phone": lead.get("phone_number")
                }
                
        return data
    except Exception as e:
        print(f"DEBUG: Error fetching admin consultations: {e}")
        
        # Fallback if the join fails (due to strict FKs not existing):
        try:
            res = supabase.table('appointments').select('*').order('scheduled_at', desc=True).limit(200).execute()
            data = res.data or []
            
            p_ids = [d["patient_id"] for d in data if d["patient_id"]]
            d_ids = [d["doctor_id"] for d in data if d["doctor_id"]]
            
            users_map = {}
            if p_ids:
                u_res = supabase.table('users').select('id, name, email, phone').in_('id', p_ids).execute()
                users_map.update({u["id"]: u for u in (u_res.data or [])})
                l_res = supabase.table('leads').select('id, name, email, phone_number').in_('id', p_ids).execute()
                for l in (l_res.data or []):
                    users_map[l["id"]] = {"id": l["id"], "name": l.get("name"), "email": l.get("email"), "phone": l.get("phone_number")}
            
            staffs_map = {}
            if d_ids:
                s_res = supabase.table('staffs').select('id, full_name').in_('id', d_ids).execute()
                staffs_map = {s["id"]: s for s in (s_res.data or [])}
                
            for d in data:
                d["users"] = users_map.get(d["patient_id"])
                d["staffs"] = staffs_map.get(d["doctor_id"])
                
            return data
        except Exception as e2:
            print(f"DEBUG: Fallback error: {e2}")
            raise HTTPException(status_code=500, detail=str(e2))

@router.get("/patients")
def get_patients(current_user: dict = Depends(get_current_user), supabase: Client = Depends(get_supabase_client)):
    _check_admin(current_user)
    try:
        # Fetch a combined list of users and leads to show in the dropdown
        users_res = supabase.table('users').select('id, name, email, phone').order('created_at', desc=True).limit(100).execute()
        leads_res = supabase.table('leads').select('id, name, email, phone_number').order('created_at', desc=True).limit(100).execute()
        
        patients = []
        for u in (users_res.data or []):
            patients.append({"id": u["id"], "name": u.get("name") or "Unknown", "phone": u.get("phone"), "type": "user"})
        for l in (leads_res.data or []):
            patients.append({"id": l["id"], "name": l.get("name") or "Unknown", "phone": l.get("phone_number"), "type": "lead"})
            
        return patients
    except Exception as e:
        print(f"DEBUG: Error fetching patients: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/{appointment_id}/assign")
def assign_consultation(
    appointment_id: str,
    payload: Dict[str, Any] = Body(...),
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    _check_admin(current_user)
    doctor_id = payload.get("doctor_id")
    if not doctor_id:
        raise HTTPException(status_code=400, detail="doctor_id is required")
        
    try:
        res = supabase.table('appointments').update({'doctor_id': doctor_id}).eq('id', appointment_id).execute()
        if not res.data:
            raise HTTPException(status_code=404, detail="Appointment not found or update failed")
        return res.data[0]
    except Exception as e:
        print(f"DEBUG: Error assigning consultation: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/")
def create_consultation(
    payload: Dict[str, Any] = Body(...),
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    _check_admin(current_user)
    try:
        # Expected fields: patient_id (could be user or lead), doctor_id, scheduled_at, duration_minutes, status, reason
        data_to_insert = {
            "patient_id": payload.get("patient_id"),
            "doctor_id": payload.get("doctor_id"),
            "sales_rep_id": payload.get("sales_rep_id") or current_user.get("id"),
            "scheduled_at": payload.get("scheduled_at"),
            "duration_minutes": payload.get("duration_minutes", 10),
            "status": payload.get("status", "pending"),
            "notes": payload.get("notes", "")
        }
        
        if not data_to_insert["patient_id"] or not data_to_insert["doctor_id"] or not data_to_insert["scheduled_at"]:
            raise HTTPException(status_code=400, detail="Missing required fields")
            
        res = supabase.table('appointments').insert(data_to_insert).execute()
        if not res.data:
            raise HTTPException(status_code=500, detail="Failed to create consultation")
        return res.data[0]
    except Exception as e:
        print(f"DEBUG: Error creating consultation: {e}")
        raise HTTPException(status_code=500, detail=str(e))
