from fastapi import APIRouter, Depends
from supabase import Client
from db.supabase import get_supabase_client
from api.deps import get_current_user

router = APIRouter()


@router.post("/{lead_id}/score")
async def score_lead(
    lead_id: str,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client),
):
    """Manually trigger AI scoring for a lead based on their WhatsApp chat."""
    from services.lead_scoring_service import score_lead_from_chat

    # Determine which table this lead is in
    table = "leads"
    lead_name = "Lead"
    res = supabase.table("leads").select("id, name").eq("id", lead_id).execute()
    if res.data:
        lead_name = res.data[0].get("name") or "Lead"
    else:
        res2 = supabase.table("users").select("id, name").eq("id", lead_id).execute()
        if res2.data:
            table = "users"
            lead_name = res2.data[0].get("name") or "Lead"
        else:
            from fastapi import HTTPException
            raise HTTPException(status_code=404, detail="Lead not found")

    label = await score_lead_from_chat(lead_id, lead_name, supabase, table=table)
    return {"label": label, "lead_id": lead_id}
