from fastapi import APIRouter, Depends, HTTPException, Form, UploadFile, File
from supabase import Client
from db.supabase import get_supabase_client
from api.deps import get_current_user
from services.cloudinary_service import upload_file_to_cloudinary
from typing import Optional

router = APIRouter()

@router.post("/leads")
async def create_lead(
    phone: str = Form(...),
    name: Optional[str] = Form(None),
    source_id: Optional[str] = Form(None),
    email: Optional[str] = Form(None),
    street_address: Optional[str] = Form(None),
    city: Optional[str] = Form(None),
    state: Optional[str] = Form(None),
    postal_code: Optional[str] = Form(None),
    country: Optional[str] = Form(None),
    interested_plan_id: Optional[str] = Form(None),
    priority: Optional[str] = Form(None),
    followup_notes: Optional[str] = Form(None),
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    payload = {
        "phone": phone,
        "name": name,
        "source_id": source_id,
        "status": "NEW",
        "assigned_sales_rep_id": current_user["id"],
    }
    
    optional_fields = {
        "email": email, "street_address": street_address, "city": city,
        "state": state, "postal_code": postal_code, "country": country,
        "interested_plan_id": interested_plan_id, "priority": priority,
        "followup_notes": followup_notes
    }
    
    for k, v in optional_fields.items():
        if v is not None and v != "":
            payload[k] = v
            
    response = supabase.table("users").insert(payload).execute()
    return {"message": "Lead created successfully", "data": response.data}

@router.put("/leads/{lead_id}")
async def update_lead_details(
    lead_id: str,
    status: Optional[str] = Form(None),
    priority: Optional[str] = Form(None),
    next_followup_date: Optional[str] = Form(None),
    followup_notes: Optional[str] = Form(None),
    name: Optional[str] = Form(None),
    email: Optional[str] = Form(None),
    street_address: Optional[str] = Form(None),
    city: Optional[str] = Form(None),
    state: Optional[str] = Form(None),
    postal_code: Optional[str] = Form(None),
    country: Optional[str] = Form(None),
    source_id: Optional[str] = Form(None),
    interested_plan_id: Optional[str] = Form(None),
    metadata_json: Optional[str] = Form(None),
    record_type: Optional[str] = Form("USER"),
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    payload = {}
    
    fields = {
        "status": status, "priority": priority, "next_followup_date": next_followup_date,
        "followup_notes": followup_notes, "name": name, "email": email, 
        "street_address": street_address, "city": city, "state": state, 
        "postal_code": postal_code, "country": country, "source_id": source_id, 
        "interested_plan_id": interested_plan_id
    }
    
    for k, v in fields.items():
        if v is not None:
            if v == "":
                payload[k] = None
            else:
                payload[k] = v
                
    if metadata_json:
        import json
        try:
            payload["metadata"] = json.loads(metadata_json)
        except Exception:
            pass
                
    table = "leads" if record_type == "LEAD" else "users"
    response = supabase.table(table).update(payload).eq("id", lead_id).execute()
    return {"message": "Lead updated successfully", "data": response.data}

@router.post("/leads/{lead_id}/documents")
async def upload_lead_document(
    lead_id: str,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    # Upload to cloudinary
    try:
        secure_url = upload_file_to_cloudinary(file, folder=f"genestac/leads/{lead_id}")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to upload file: {str(e)}")
        
    # Insert record into user_documents table
    document_data = {
        "user_id": lead_id,
        "file_name": file.filename,
        "storage_path": secure_url, # Now we store the cloudinary URL instead of supabase storage path
    }
    
    response = supabase.table("user_documents").insert(document_data).execute()
    
    return {"message": "Document uploaded successfully", "data": response.data, "url": secure_url}
@router.get("/metadata")
async def get_metadata(
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    sources = supabase.table("user_sources").select("*").execute()
    try:
        plans = supabase.table("plans").select("*").execute()
    except Exception:
        plans = type('obj', (object,), {'data': []})
    return {"sources": sources.data, "plans": plans.data}

@router.get("/metrics")
async def get_metrics(
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    user_id = current_user["id"]
    
    import datetime
    today = datetime.datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    tomorrow = today + datetime.timedelta(days=1)
    
    import json, os
    DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")
    GLOBAL_SETTINGS_FILE = os.path.join(DATA_DIR, "global_settings.json")
    shared_pool_enabled = False
    if os.path.exists(GLOBAL_SETTINGS_FILE):
        try:
            with open(GLOBAL_SETTINGS_FILE, "r") as f:
                shared_pool_enabled = json.load(f).get("shared_lead_pool", False)
        except:
            pass

    # 1. Helper function to fetch and count
    def fetch_and_combine(table1, table2, select_str, eq_filters=None, gte_filters=None, lt_filters=None, is_count=False):
        def build_query(t):
            q = supabase.table(t).select(select_str, count="exact" if is_count else None)
            
            # Special handling for assigned_sales_rep_id with shared pool
            has_assigned_filter = False
            assigned_val = None
            if eq_filters:
                for k, v in eq_filters.items():
                    if k == "assigned_sales_rep_id":
                        has_assigned_filter = True
                        assigned_val = v
                    else:
                        q = q.eq(k, v)
                        
            if has_assigned_filter:
                if shared_pool_enabled:
                    q = q.or_(f"assigned_sales_rep_id.eq.{assigned_val},assigned_sales_rep_id.is.null")
                else:
                    q = q.eq("assigned_sales_rep_id", assigned_val)

            if gte_filters:
                for k, v in gte_filters.items(): q = q.gte(k, v)
            if lt_filters:
                for k, v in lt_filters.items(): q = q.lt(k, v)
            return q
            
        res1 = build_query(table1).execute()
        count1 = res1.count or 0 if is_count else len(res1.data or [])
        data1 = res1.data or []
        for d in data1: d["record_type"] = "USER"
        
        count2, data2 = 0, []
        try:
            res2 = build_query(table2).execute()
            count2 = res2.count or 0 if is_count else len(res2.data or [])
            data2 = res2.data or []
            for d in data2: d["record_type"] = "LEAD"
        except Exception:
            pass
            
        return count1 + count2, data1 + data2

    # KPI Grid
    totalLeads, _ = fetch_and_combine("users", "leads", "id", eq_filters={"assigned_sales_rep_id": user_id}, is_count=True)
    newLeadsToday, _ = fetch_and_combine("users", "leads", "id", eq_filters={"assigned_sales_rep_id": user_id}, gte_filters={"created_at": today.isoformat()}, lt_filters={"created_at": tomorrow.isoformat()}, is_count=True)
    
    _, followUpsToday = fetch_and_combine("users", "leads", "id, name, phone, status, priority, followup_notes, next_followup_date", eq_filters={"assigned_sales_rep_id": user_id}, gte_filters={"next_followup_date": today.isoformat()}, lt_filters={"next_followup_date": tomorrow.isoformat()})
    followUpsDueCount = len(followUpsToday)
    
    appointments_res = supabase.table("appointments").select("id", count="exact").eq("sales_rep_id", user_id).execute()
    appointmentsBooked = appointments_res.count or 0
    
    convertedCount, _ = fetch_and_combine("users", "leads", "id", eq_filters={"assigned_sales_rep_id": user_id, "status": "CONVERTED"}, is_count=True)
    
    _, converted_leads_data = fetch_and_combine("users", "leads", "id, plans(price)", eq_filters={"assigned_sales_rep_id": user_id, "status": "CONVERTED"})
    revenueGenerated = sum(int(lead["plans"]["price"]) for lead in converted_leads_data if lead.get("plans") and lead["plans"].get("price"))
            
    monthlyTarget = 1000000
    achievementPercentage = round((revenueGenerated / monthlyTarget) * 100, 1) if monthlyTarget > 0 else 0
    
    # Charts Section
    _, all_leads_data = fetch_and_combine("users", "leads", "id, status, source_id, user_sources(name)", eq_filters={"assigned_sales_rep_id": user_id})
    
    leadsSummary = {
        "New Lead": 0, "Contacted": 0, "Interested": 0,
        "Follow-up Required": 0, "Consultation Scheduled": 0, "Others": 0
    }
    
    status_mapping = {
        "NEW": "New Lead", "UNREAD": "New Lead",
        "CONTACT_ATTEMPTED": "Contacted", "CONTACTED": "Contacted",
        "QUALIFIED": "Interested", "ASSIGNED": "Follow-up Required",
        "CONSULTATION_SCHEDULED": "Consultation Scheduled",
        "CONSULTATION_COMPLETED": "Others", "ON_HOLD": "Others",
        "LOST": "Others", "CONVERTED": "Others"
    }
    
    for lead in all_leads_data:
        st = lead.get("status")
        if st in status_mapping:
            leadsSummary[status_mapping[st]] += 1
        else:
            leadsSummary["Others"] += 1
            
    leadsSummaryArray = []
    colors = ["#3b82f6", "#8b5cf6", "#ec4899", "#f43f5e", "#f59e0b", "#d1d5db"]
    color_idx = 0
    for k, v in leadsSummary.items():
        if v > 0:
            percentage = round((v / totalLeads) * 100) if totalLeads > 0 else 0
            leadsSummaryArray.append({
                "label": k, "value": v, "percentage": percentage, "color": colors[color_idx % len(colors)]
            })
            color_idx += 1
            
    conic_segments = []
    current_pct = 0
    for item in leadsSummaryArray:
        next_pct = current_pct + item["percentage"]
        conic_segments.append(f"{item['color']} {current_pct}% {next_pct}%")
        current_pct = next_pct
    
    if current_pct < 100 and conic_segments:
        conic_segments[-1] = conic_segments[-1].rsplit(' ', 1)[0] + " 100%"
        
    conicGradient = "conic-gradient(" + ", ".join(conic_segments) + ")" if conic_segments else ""
    
    sources_count = {}
    for lead in all_leads_data:
        src = lead.get("user_sources")
        src_name = src.get("name") if src else "Others"
        sources_count[src_name] = sources_count.get(src_name, 0) + 1
        
    sorted_sources = sorted(sources_count.items(), key=lambda x: x[1], reverse=True)
    topLeadSources = []
    for k, v in sorted_sources[:5]:
        percentage = round((v / totalLeads) * 100) if totalLeads > 0 else 0
        topLeadSources.append({"label": k, "value": v, "percentage": percentage})
        
    others_sum = sum(x[1] for x in sorted_sources[5:])
    if others_sum > 0:
        percentage = round((others_sum / totalLeads) * 100) if totalLeads > 0 else 0
        topLeadSources.append({"label": "Others", "value": others_sum, "percentage": percentage})
        
    # My Recent Leads
    _, recent_leads_data = fetch_and_combine("users", "leads", "id, name, phone, status, next_followup_date, user_sources(name)", eq_filters={"assigned_sales_rep_id": user_id})
    recent_leads_data.sort(key=lambda x: x.get("created_at", "") or "", reverse=True)
    recentLeads = recent_leads_data[:5]
    
    # Follow-up Calendar / Timeline
    timelineEvents = []
    for f in followUpsToday:
        if f.get("next_followup_date"):
            try:
                dt = datetime.datetime.fromisoformat(f["next_followup_date"])
                timelineEvents.append({
                    "time": dt.strftime("%I:%M %p"),
                    "title": f"Follow-up: {f.get('name') or 'Lead'}",
                    "datetime": dt
                })
            except: pass
                
    today_appointments = supabase.table("appointments").select("*, patients:users!patient_id(name)").eq("sales_rep_id", user_id).gte("scheduled_at", today.isoformat()).lt("scheduled_at", tomorrow.isoformat()).execute()
    for a in today_appointments.data:
        if a.get("scheduled_at"):
            try:
                dt = datetime.datetime.fromisoformat(a["scheduled_at"])
                patient_name = a.get("patients", {}).get("name") or 'Patient'
                timelineEvents.append({
                    "time": dt.strftime("%I:%M %p"),
                    "title": f"Appointment: {patient_name}",
                    "datetime": dt
                })
            except: pass
                
    timelineEvents.sort(key=lambda x: x["datetime"])
    for t in timelineEvents:
        del t["datetime"]
        
    return {
        "untouchedCount": newLeadsToday, 
        "convertedCount": convertedCount,
        "followUpsToday": followUpsToday,
        "totalLeads": totalLeads,
        "newLeadsToday": newLeadsToday,
        "followUpsDueCount": followUpsDueCount,
        "appointmentsBooked": appointmentsBooked,
        "revenueGenerated": revenueGenerated,
        "monthlyTarget": monthlyTarget,
        "achievementPercentage": achievementPercentage,
        "leadsSummaryArray": leadsSummaryArray,
        "conicGradient": conicGradient,
        "topLeadSources": topLeadSources,
        "recentLeads": recentLeads,
        "timelineEvents": timelineEvents
    }

from fastapi import Query

@router.get("/leads")
async def get_leads(
    statuses: Optional[str] = Query(None),
    exclude_statuses: Optional[str] = Query(None),
    require_followup: Optional[bool] = Query(False),
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    try:
        user_id = current_user["id"]
        
        import json, os
        DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")
        GLOBAL_SETTINGS_FILE = os.path.join(DATA_DIR, "global_settings.json")
        shared_pool_enabled = False
        if os.path.exists(GLOBAL_SETTINGS_FILE):
            try:
                with open(GLOBAL_SETTINGS_FILE, "r") as f:
                    shared_pool_enabled = json.load(f).get("shared_lead_pool", False)
            except:
                pass
        
        # 1. Fetch Users
        u_query = supabase.table("users").select("*, user_sources(name), plans(name, price)")
        if shared_pool_enabled:
            u_query = u_query.or_(f"assigned_sales_rep_id.eq.{user_id},assigned_sales_rep_id.is.null")
        else:
            u_query = u_query.eq("assigned_sales_rep_id", user_id)
            
        if statuses:
            u_query = u_query.in_("status", statuses.split(","))
        if exclude_statuses:
            for st in exclude_statuses.split(","):
                u_query = u_query.neq("status", st)
        if require_followup:
            u_query = u_query.not_.is_("next_followup_date", "null")
            
        u_res = u_query.execute()
        users_data = u_res.data or []
        for u in users_data:
            u["record_type"] = "USER"
            
        # 2. Fetch Leads (wrapped in try-except in case table doesn't exist locally)
        leads_data = []
        try:
            l_query = supabase.table("leads").select("*, user_sources(name), plans(name, price)")
            if shared_pool_enabled:
                l_query = l_query.or_(f"assigned_sales_rep_id.eq.{user_id},assigned_sales_rep_id.is.null")
            else:
                l_query = l_query.eq("assigned_sales_rep_id", user_id)
                
            if statuses:
                l_query = l_query.in_("status", statuses.split(","))
            if exclude_statuses:
                for st in exclude_statuses.split(","):
                    l_query = l_query.neq("status", st)
            if require_followup:
                l_query = l_query.not_.is_("next_followup_date", "null")
                
            l_res = l_query.execute()
            leads_data = l_res.data or []
            for l in leads_data:
                l["record_type"] = "LEAD"
                if "phone_number" in l:
                    l["phone"] = l.pop("phone_number", None)
                if "metadata" not in l or not l["metadata"]:
                    l["metadata"] = {}
        except Exception as e:
            print(f"Skipping leads table fetch (may not exist): {e}")
            
        # 3. Combine and sort
        combined = users_data + leads_data
        
        if require_followup:
            combined.sort(key=lambda x: x.get("next_followup_date", "") or "", reverse=False)
        else:
            combined.sort(key=lambda x: x.get("created_at", "") or "", reverse=True)
            
        return {"data": combined}
    except Exception as e:
        import traceback, sys
        err = traceback.format_exc()
        print(f"get_leads error: {err}")
        sys.stdout.flush()
        raise HTTPException(status_code=500, detail=f"get_leads error: {str(e)}")

@router.get("/leads/{lead_id}/documents")
async def get_lead_documents(
    lead_id: str,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    response = supabase.table("user_documents").select("*").eq("user_id", lead_id).order("uploaded_at", desc=True).execute()
    return {"data": response.data}

@router.get("/leads/{lead_id}/notes")
async def get_lead_notes(
    lead_id: str,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    response = supabase.table("user_notes").select("*").eq("user_id", lead_id).order("created_at", desc=True).execute()
    return {"data": response.data}

from pydantic import BaseModel
class NoteCreate(BaseModel):
    content: str
    created_at: Optional[str] = None

@router.post("/leads/{lead_id}/notes")
async def create_lead_note(
    lead_id: str,
    note: NoteCreate,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    payload = {
        "user_id": lead_id,
        "author_id": current_user["id"],
        "content": note.content
    }
    if note.created_at:
        payload["created_at"] = note.created_at
    response = supabase.table("user_notes").insert(payload).execute()
    return {"message": "Note added successfully", "data": response.data}

@router.post("/appointments")
async def book_appointment(
    lead_id: str = Form(...),
    doctor_id: str = Form(...),
    date: str = Form(...),
    time: str = Form(...),
    notes: Optional[str] = Form(None),
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    scheduled_at = f"{date}T{time}:00"
    payload = {
        "patient_id": lead_id,
        "doctor_id": doctor_id,
        "sales_rep_id": current_user["id"],
        "scheduled_at": scheduled_at,
        "notes": notes,
        "status": "pending",
        "duration_minutes": 30
    }
    response = supabase.table("appointments").insert(payload).execute()
    return {"message": "Appointment booked successfully", "data": response.data}

def is_admin(user: dict, supabase: Client) -> bool:
    res = supabase.table("staffs").select("roles(name)").eq("id", user["id"]).execute()
    if not res.data:
        return False
    role_name = res.data[0].get("roles", {}).get("name", "")
    return role_name in ("superadmin", "master_admin", "admin")

@router.get("/orders")
async def list_orders(
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    admin = is_admin(current_user, supabase)
    
    query = "*, order_items(*), payments(*)"
    
    if admin:
        res = supabase.table("orders").select(query).order("created_at", desc=True).execute()
    else:
        leads_res = supabase.table("leads").select("id").eq("assigned_sales_rep_id", current_user["id"]).execute()
        lead_ids = [lead["id"] for lead in leads_res.data] if leads_res.data else []
        
        if not lead_ids:
            return {"data": []}
            
        res = supabase.table("orders").select(query).in_("user_id", lead_ids).order("created_at", desc=True).execute()
        
    # We might want to enrich the orders with lead/user data since user_id points to leads/users
    # Let's try to fetch user info for these orders
    orders_data = res.data or []
    if orders_data:
        user_ids = [o["user_id"] for o in orders_data if o.get("user_id")]
        if user_ids:
            try:
                users_res = supabase.table("leads").select("id, name, full_name, email, phone, metadata").in_("id", user_ids).execute()
                users_map = {u["id"]: u for u in users_res.data} if users_res.data else {}
                
                # Fetch missing users from the 'users' table (actual onboarded patients)
                missing_user_ids = [uid for uid in user_ids if uid not in users_map]
                if missing_user_ids:
                    patients_res = supabase.table("users").select("id, name, full_name, email, phone, metadata").in_("id", missing_user_ids).execute()
                    if patients_res.data:
                        for u in patients_res.data:
                            users_map[u["id"]] = u
                            
                for o in orders_data:
                    if o.get("user_id") in users_map:
                        o["user"] = users_map[o["user_id"]]
            except Exception as e:
                import traceback
                print(f"Error enriching orders user data: {e}")
                traceback.print_exc()
                
    return {"data": orders_data}

@router.get("/test_carts")
async def test_carts(supabase: Client = Depends(get_supabase_client)):
    try:
        res = supabase.table("inventory").select("*").limit(1).execute()
        return {"success": True, "data": res.data}
    except Exception as e:
        return {"success": False, "error": str(e)}

@router.get("/carts")
async def list_carts(
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    admin = is_admin(current_user, supabase)
    
    # 1. Fetch Carts
    if admin:
        res = supabase.table("cart").select("*").order("added_at", desc=True).execute()
    else:
        leads_res = supabase.table("leads").select("id").eq("assigned_sales_rep_id", current_user["id"]).execute()
        lead_ids = [lead["id"] for lead in leads_res.data] if leads_res.data else []
        
        if not lead_ids:
            return {"data": []}
            
        res = supabase.table("cart").select("*").in_("user_id", lead_ids).order("added_at", desc=True).execute()
        
    carts_data = res.data or []
    
    if carts_data:
        # 2. Fetch Users
        user_ids = list(set([c["user_id"] for c in carts_data if c.get("user_id")]))
        if user_ids:
            try:
                users_res = supabase.table("leads").select("id, name, full_name, email, phone").in_("id", user_ids).execute()
                users_map = {u["id"]: u for u in users_res.data}
                for c in carts_data:
                    if c.get("user_id") in users_map:
                        c["user"] = users_map[c["user_id"]]
            except Exception:
                pass
                
        # 3. Fetch Inventory (medicines)
        medicine_ids = list(set([c["medicine_id"] for c in carts_data if c.get("medicine_id")]))
        if medicine_ids:
            try:
                inv_res = supabase.table("inventory").select("id, name, price").in_("id", medicine_ids).execute()
                inv_map = {i["id"]: i for i in inv_res.data}
                for c in carts_data:
                    if c.get("medicine_id") in inv_map:
                        c["inventory"] = inv_map[c["medicine_id"]]
            except Exception:
                pass
                
    return {"data": carts_data}
