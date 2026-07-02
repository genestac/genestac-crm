from fastapi import APIRouter, Depends
from supabase import Client
from db.supabase import get_supabase_client
from api.deps import get_current_user

router = APIRouter()

@router.get("/")
async def get_audit_logs(
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    try:
        # Fetch logs directly using service key (bypassing RPC that checks JWT)
        logs_res = supabase.table("audit_logs").select("*").order("created_at", desc=True).limit(500).execute()
        logs_data = logs_res.data or []
        
        # Get unique actor IDs
        actor_ids = list(set([log["actor_id"] for log in logs_data if log.get("actor_id")]))
        
        # Fetch staff details for these actors
        staffs_dict = {}
        if actor_ids:
            staffs_res = supabase.table("staffs").select("id, full_name, email").in_("id", actor_ids).execute()
            staffs_dict = {s["id"]: s for s in (staffs_res.data or [])}
            
        # Merge staff data into logs
        for log in logs_data:
            actor_id = log.get("actor_id")
            if actor_id and actor_id in staffs_dict:
                log["actor_name"] = staffs_dict[actor_id].get("full_name")
                log["actor_email"] = staffs_dict[actor_id].get("email")
            else:
                log["actor_name"] = "System / Unknown"
                log["actor_email"] = ""
                
        return {"data": logs_data}
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
