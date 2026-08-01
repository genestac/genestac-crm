from fastapi import APIRouter, Depends
from supabase import Client
from db.supabase import get_supabase_client
from api.deps import get_current_user
from datetime import datetime, timezone

router = APIRouter()


@router.get("/")
async def get_scheduled_calls(
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client),
):
    """Returns all leads and users with an upcoming or past-due AI callback time, sorted ascending."""
    now_iso = datetime.now(timezone.utc).isoformat()

    leads_res = (
        supabase.table("leads")
        .select("id, name, phone_number, status, ai_callback_time, metadata, source")
        .not_.is_("ai_callback_time", "null")
        .order("ai_callback_time", desc=False)
        .limit(200)
        .execute()
    )

    users_res = (
        supabase.table("users")
        .select("id, name, phone, status, ai_callback_time, metadata, source")
        .not_.is_("ai_callback_time", "null")
        .order("ai_callback_time", desc=False)
        .limit(200)
        .execute()
    )

    rows = []
    for l in (leads_res.data or []):
        rows.append({
            "id": l["id"],
            "name": l.get("name") or "Unknown",
            "phone": l.get("phone_number") or "",
            "status": l.get("status") or "",
            "scheduled_at": l.get("ai_callback_time"),
            "is_overdue": l.get("ai_callback_time", "") < now_iso,
            "score_label": (l.get("metadata") or {}).get("lead_score_label"),
            "score": (l.get("metadata") or {}).get("lead_score"),
            "source": l.get("source") or "",
            "table": "leads",
        })
    for u in (users_res.data or []):
        rows.append({
            "id": u["id"],
            "name": u.get("name") or "Unknown",
            "phone": u.get("phone") or "",
            "status": u.get("status") or "",
            "scheduled_at": u.get("ai_callback_time"),
            "is_overdue": u.get("ai_callback_time", "") < now_iso,
            "score_label": (u.get("metadata") or {}).get("lead_score_label"),
            "score": (u.get("metadata") or {}).get("lead_score"),
            "source": u.get("source") or "",
            "table": "users",
        })

    rows.sort(key=lambda r: r["scheduled_at"] or "")
    return {"data": rows}
