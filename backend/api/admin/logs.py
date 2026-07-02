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
    res = supabase.rpc("get_audit_logs_with_users").execute()
    return {"data": res.data}
