from fastapi import APIRouter, Depends, HTTPException, Body
from supabase import Client
from db.supabase import get_supabase_client
from api.deps import get_current_user

router = APIRouter()

def verify_admin(current_user: dict, supabase: Client):
    role_name = current_user.get("role")
    if role_name not in ["superadmin", "master_admin", "admin"]:
        raise HTTPException(status_code=403, detail="Unauthorized. Admin access required.")

@router.get("/")
async def get_unassigned_leads(
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    verify_admin(current_user, supabase)
    
    u_res = supabase.table("users").select("id, name, email, phone, status, created_at").is_("assigned_sales_rep_id", "null").execute()
    users_data = u_res.data or []
    for u in users_data: u["record_type"] = "USER"
    
    leads_data = []
    try:
        l_res = supabase.table("leads").select("id, name, email, phone_number, status, created_at").is_("assigned_sales_rep_id", "null").execute()
        leads_data = l_res.data or []
        for l in leads_data:
            l["record_type"] = "LEAD"
            # Map phone_number to phone for frontend consistency
            l["phone"] = l.pop("phone_number", None)
    except Exception as e:
        print(f"Error fetching leads: {e}")
        pass
        
    combined = users_data + leads_data
    combined.sort(key=lambda x: x.get("created_at", "") or "", reverse=True)
    return {"data": combined}

@router.get("/sales-reps")
async def get_sales_reps(
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    verify_admin(current_user, supabase)
    
    staff_roles = ["sales_rep", "sales", "master_admin", "superadmin", "admin"]
    res = supabase.table("staffs").select("id, full_name, email, roles!inner(name)").in_("roles.name", staff_roles).execute()
    return {"data": res.data}

from pydantic import BaseModel
class AssignLeadRequest(BaseModel):
    lead_id: str
    record_type: str
    sales_rep_id: str

@router.post("/assign")
async def assign_lead(
    request: AssignLeadRequest,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    verify_admin(current_user, supabase)
    
    table = "leads" if request.record_type == "LEAD" else "users"
    
    # Assign it and also update status to ASSIGNED if it's new
    response = supabase.table(table).update({
        "assigned_sales_rep_id": request.sales_rep_id,
        "status": "ASSIGNED"
    }).eq("id", request.lead_id).execute()
    
    return {"success": True, "message": "Lead assigned successfully", "data": response.data}

from typing import List

class LeadIdentifier(BaseModel):
    lead_id: str
    record_type: str

class AssignBulkRequest(BaseModel):
    leads: List[LeadIdentifier]
    sales_rep_id: str

@router.post("/assign-bulk")
async def assign_leads_bulk(
    request: AssignBulkRequest,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    verify_admin(current_user, supabase)
    
    if not request.leads:
        raise HTTPException(status_code=400, detail="No leads provided")
        
    lead_ids = [L.lead_id for L in request.leads if L.record_type == "LEAD"]
    user_ids = [L.lead_id for L in request.leads if L.record_type == "USER"]
    
    # Update leads table
    if lead_ids:
        supabase.table("leads").update({
            "assigned_sales_rep_id": request.sales_rep_id,
            "status": "ASSIGNED"
        }).in_("id", lead_ids).execute()
        
    # Update users table
    if user_ids:
        supabase.table("users").update({
            "assigned_sales_rep_id": request.sales_rep_id,
            "status": "ASSIGNED"
        }).in_("id", user_ids).execute()
        
    return {"success": True, "message": f"Successfully assigned {len(request.leads)} leads"}
