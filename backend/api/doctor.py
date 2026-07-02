from fastapi import APIRouter, Depends, HTTPException, Form, Body
from supabase import Client
from db.supabase import get_supabase_client
from api.deps import get_current_user
from typing import Any, Dict, List
import datetime

router = APIRouter()

@router.get("/appointments")
async def get_appointments(current_user: dict = Depends(get_current_user), supabase: Client = Depends(get_supabase_client)):
    try:
        profile = supabase.table("staffs").select("roles(name)").eq("id", current_user["id"]).single().execute()
        role_name = profile.data.get("roles", {}).get("name") if profile.data and profile.data.get("roles") else None
        is_admin = role_name in ["superadmin", "master_admin", "admin"]
        
        print(f"DEBUG: User {current_user['id']} has role: {role_name}, is_admin: {is_admin}")
        
        query = supabase.table("appointments").select(
            "*, patients:users!patient_id(id, name, phone, email), sales:staffs!sales_rep_id(id, full_name)"
        )
        if not is_admin:
            query = query.eq("doctor_id", current_user["id"])
            
        response = query.order("scheduled_at", desc=False).execute()
        print(f"DEBUG: Retrieved {len(response.data)} appointments for user {current_user['id']}")
        return response.data
    except Exception as e:
        print(f"DEBUG: Error fetching appointments: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/appointments/{id}")
async def get_appointment_by_id(id: str, current_user: dict = Depends(get_current_user), supabase: Client = Depends(get_supabase_client)):
    response = supabase.table("appointments").select(
        "*, patients:users!patient_id(id, name, phone, email), sales:staffs!sales_rep_id(id, full_name)"
    ).eq("id", id).single().execute()
    return response.data

@router.put("/appointments/{id}/status")
async def update_appointment_status(
    id: str,
    status: str = Body(embed=True),
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    supabase.table("appointments").update({"status": status}).eq("id", id).execute()
    return {"success": True}

@router.put("/appointments/{id}/details")
async def update_appointment_details(
    id: str,
    data: dict = Body(...),
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    supabase.table("appointments").update({
        "title": data.get("title"),
        "type": data.get("type"),
        "related_to": data.get("related_to"),
        "location": data.get("location"),
        "meeting_link": data.get("link"),
        "notes": data.get("description"),
        "duration_minutes": data.get("duration"),
        "scheduled_at": data.get("scheduled_at"),
    }).eq("id", id).execute()
    return {"success": True}

@router.post("/appointments")
async def create_next_appointment(
    data: dict = Body(...),
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    sales_rep_id = data.get("sales_rep_id")
    if not sales_rep_id:
        admin_res = supabase.table("staffs").select("id").eq("email", "admin@example.com").single().execute()
        sales_rep_id = admin_res.data.get("id") if admin_res.data else current_user["id"]
        
    payload = {
        "title": data.get("title"),
        "type": data.get("type"),
        "patient_id": data.get("patient_id"),
        "doctor_id": current_user["id"],
        "sales_rep_id": sales_rep_id,
        "scheduled_at": data.get("scheduled_at"),
        "duration_minutes": data.get("duration", 30),
        "notes": data.get("description"),
        "location": data.get("location"),
        "meeting_link": data.get("link"),
        "status": "pending"
    }
    
    supabase.table("appointments").insert(payload).execute()
    return {"success": True}

@router.post("/appointments/{id}/payment-link")
async def generate_payment_link(
    id: str,
    planData: dict = Body(...),
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    import random, string
    mock_link = "https://rzp.io/i/" + ''.join(random.choices(string.ascii_lowercase + string.digits, k=8))
    
    supabase.table("appointments").update({
        "plan_details": {
            "products": planData.get("products"),
            "discount": planData.get("discount"),
            "total": planData.get("total"),
            "payment_link": mock_link,
            "generated_at": datetime.datetime.now().isoformat()
        },
        "plan_id": planData.get("plan_id")
    }).eq("id", id).execute()
    return {"success": True, "payment_link": mock_link}

@router.get("/metrics")
async def get_doctor_metrics(current_user: dict = Depends(get_current_user), supabase: Client = Depends(get_supabase_client)):
    start_of_day = datetime.datetime.now().replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    end_of_day = datetime.datetime.now().replace(hour=23, minute=59, second=59, microsecond=999999).isoformat()
    
    profile = supabase.table("staffs").select("roles(name)").eq("id", current_user["id"]).single().execute()
    role_name = profile.data.get("roles", {}).get("name") if profile.data and profile.data.get("roles") else None
    is_admin = role_name in ["superadmin", "master_admin", "admin"]
    
    daily_query = supabase.table("appointments").select("id", count="exact").gte("scheduled_at", start_of_day).lte("scheduled_at", end_of_day)
    total_query = supabase.table("appointments").select("id", count="exact").eq("status", "completed")
    patients_query = supabase.table("appointments").select("patient_id").eq("status", "completed")
    
    if not is_admin:
        daily_query = daily_query.eq("doctor_id", current_user["id"])
        total_query = total_query.eq("doctor_id", current_user["id"])
        patients_query = patients_query.eq("doctor_id", current_user["id"])
        
    daily_res = daily_query.execute()
    total_res = total_query.execute()
    patients_data = patients_query.execute()
    unique_patients = set()
    for p in patients_data.data:
        if p.get("patient_id"):
            unique_patients.add(p["patient_id"])
            
    monthly_revenue = len(unique_patients) * 500
    
    return {
        "dailyQueue": daily_res.count or 0,
        "totalConsultations": total_res.count or 0,
        "activePatients": len(unique_patients),
        "treatmentSuccessRate": 85,
        "monthlyRevenue": monthly_revenue
    }

@router.get("/patients/{patient_id}/history")
async def get_patient_history(patient_id: str, current_user: dict = Depends(get_current_user), supabase: Client = Depends(get_supabase_client)):
    response = supabase.table("clinical_assessments").select("*").eq("patient_id", patient_id).order("created_at", desc=False).execute()
    return response.data

@router.get("/patients/{patient_id}/prescriptions")
async def get_recent_prescriptions(patient_id: str, current_user: dict = Depends(get_current_user), supabase: Client = Depends(get_supabase_client)):
    response = supabase.table("prescriptions").select(
        "*, prescription_items(id, dosage, frequency, duration_days, total_quantity_prescribed, inventory(name, sku))"
    ).eq("patient_id", patient_id).order("created_at", desc=True).execute()
    return response.data

@router.get("/prescriptions/{id}")
async def get_prescription_by_id(id: str, current_user: dict = Depends(get_current_user), supabase: Client = Depends(get_supabase_client)):
    response = supabase.table("prescriptions").select(
        "*, patients:users!patient_id(id, name, phone, email), doctors:staffs!doctor_id(id, full_name, email, phone), prescription_items(id, dosage, frequency, duration_days, total_quantity_prescribed, time, before_lunch, after_lunch, inventory(name, sku))"
    ).eq("id", id).single().execute()
    return response.data

@router.post("/prescriptions")
async def write_prescription(
    data: dict = Body(...),
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    rx_payload = {
        "patient_id": data.get("patientId"),
        "doctor_id": current_user["id"],
        "general_instructions": data.get("instructions"),
        "valid_until": data.get("validUntil"),
        "status": "active"
    }
    rx_res = supabase.table("prescriptions").insert(rx_payload).execute()
    rx_id = rx_res.data[0]["id"]
    
    items = data.get("items", [])
    if items:
        items_payload = []
        for item in items:
            items_payload.append({
                "prescription_id": rx_id,
                "inventory_id": item.get("inventoryId"),
                "dosage": item.get("dosage"),
                "frequency": item.get("frequency"),
                "duration_days": int(item.get("durationDays", 30)),
                "total_quantity_prescribed": int(item.get("quantity", 1)),
                "before_lunch": bool(item.get("beforeLunch", False)),
                "after_lunch": bool(item.get("afterLunch", False)),
                "time": item.get("time")
            })
        supabase.table("prescription_items").insert(items_payload).execute()
        
    return {"success": True}

@router.post("/assessments")
async def add_clinical_assessment(
    data: dict = Body(...),
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    payload = {
        "patient_id": data.get("patientId"),
        "recorded_by": current_user["id"],
        "weight_kg": float(data.get("weight")) if data.get("weight") else None,
        "conditions": data.get("conditions", {}),
        "doctor_timeline_notes": data.get("notes")
    }
    supabase.table("clinical_assessments").insert(payload).execute()
    return {"success": True}

@router.post("/patients/{patient_id}/adverse-events")
async def log_adverse_event(
    patient_id: str,
    eventDetails: str = Body(embed=True),
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    payload = {
        "patient_id": patient_id,
        "recorded_by": current_user["id"],
        "conditions": {"adverse_event": True, "details": eventDetails},
        "doctor_timeline_notes": f"[ADVERSE EVENT LOGGED]: {eventDetails}"
    }
    supabase.table("clinical_assessments").insert(payload).execute()
    return {"success": True}

@router.get("/patients/{patient_id}/timeline")
async def fetch_patient_timeline(patient_id: str, current_user: dict = Depends(get_current_user), supabase: Client = Depends(get_supabase_client)):
    assessments_res = supabase.table("clinical_assessments").select(
        "id, created_at, doctor_timeline_notes, conditions, recorded_by, staffs!recorded_by(full_name, roles!inner(name))"
    ).eq("patient_id", patient_id).order("created_at", desc=False).execute()
    
    comms_res = supabase.table("communications").select(
        "id, created_at, content, type, sender_id, staffs!sender_id(full_name, roles!inner(name))"
    ).eq("lead_id", patient_id).order("created_at", desc=False).execute()
    
    return {
        "assessments": assessments_res.data or [],
        "communications": comms_res.data or []
    }

@router.post("/patients/{patient_id}/timeline")
async def add_timeline_entry(
    patient_id: str,
    type: str = Body(embed=True),
    content: str = Body(embed=True),
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    if type == "clinical":
        supabase.table("clinical_assessments").insert({
            "patient_id": patient_id,
            "recorded_by": current_user["id"],
            "doctor_timeline_notes": content
        }).execute()
    else:
        supabase.table("communications").insert({
            "lead_id": patient_id,
            "sender_id": current_user["id"],
            "content": content,
            "type": "note"
        }).execute()
    return {"success": True}

@router.post("/patients/{patient_id}/reports")
async def upload_patient_report(
    patient_id: str,
    appointmentId: str = Body(embed=True),
    fileData: dict = Body(embed=True),
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    supabase.table("patient_reports").insert({
        "patient_id": patient_id,
        "appointment_id": appointmentId,
        "uploaded_by": current_user["id"],
        "title": fileData.get("title"),
        "file_url": fileData.get("url"),
        "file_type": fileData.get("type")
    }).execute()
    return {"success": True}

@router.get("/inventory")
async def get_inventory(current_user: dict = Depends(get_current_user), supabase: Client = Depends(get_supabase_client)):
    response = supabase.table("inventory").select("*").execute()
    return response.data

@router.get("/")
async def get_all_doctors(
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    response = supabase.table("staffs").select("id, full_name, roles!inner(name)").eq("roles.name", "doctor").execute()
    return {"data": response.data}
