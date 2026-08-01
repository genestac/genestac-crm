from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from supabase import Client
from db.supabase import get_supabase_client
from api.deps import get_current_user
import asyncio, json
from fastapi import Request

router = APIRouter()


@router.get("/")
async def get_notifications(
    limit: int = Query(50, le=200),
    offset: int = Query(0),
    unread_only: bool = Query(False),
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client),
):
    q = (
        supabase.table("notifications")
        .select("*")
        .order("created_at", desc=True)
        .limit(limit)
        .offset(offset)
    )
    if unread_only:
        q = q.eq("is_read", False)

    res = q.execute()
    return {"data": res.data or []}


@router.get("/unread-count")
async def unread_count(
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client),
):
    res = supabase.table("notifications").select("id", count="exact").eq("is_read", False).execute()
    return {"count": res.count or 0}


@router.post("/{notification_id}/read")
async def mark_read(
    notification_id: str,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client),
):
    supabase.table("notifications").update({"is_read": True}).eq("id", notification_id).execute()
    return {"ok": True}


@router.post("/read-all")
async def mark_all_read(
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client),
):
    supabase.table("notifications").update({"is_read": True}).eq("is_read", False).execute()
    return {"ok": True}


@router.delete("/{notification_id}")
async def delete_notification(
    notification_id: str,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client),
):
    supabase.table("notifications").delete().eq("id", notification_id).execute()
    return {"ok": True}


# ── SSE stream: polls unread count every 5 s so the bell stays live ──────────
async def _notification_stream(request: Request, supabase: Client):
    yield ": connected\n\n"
    while not await request.is_disconnected():
        try:
            res = supabase.table("notifications").select("id", count="exact").eq("is_read", False).execute()
            count = res.count or 0
            yield f"data: {json.dumps({'unread': count})}\n\n"
        except Exception:
            pass
        await asyncio.sleep(5)


@router.get("/stream")
async def stream_notifications(
    request: Request,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client),
):
    return StreamingResponse(
        _notification_stream(request, supabase),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
