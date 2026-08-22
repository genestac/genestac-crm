from fastapi import APIRouter, Depends, HTTPException, Query
from supabase import Client
from db.supabase import get_supabase_client
from api.deps import get_current_user
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

router = APIRouter()

ALLOWED_ROLES = {"superadmin", "master_admin", "admin", "manager", "doctor"}


def require_reviewer(current_user: dict):
    if current_user.get("role") not in ALLOWED_ROLES:
        raise HTTPException(status_code=403, detail="Insufficient permissions to moderate reviews.")


# ── Pydantic Models ───────────────────────────────────────────────────────────

class ModerateReviewRequest(BaseModel):
    status: str                          # "approved" | "rejected"
    admin_note: Optional[str] = None


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("")
async def list_reviews(
    status: Optional[str] = Query(None, description="Filter by status: pending | approved | rejected"),
    inventory_id: Optional[str] = Query(None, description="Filter by product UUID"),
    rating: Optional[int] = Query(None, ge=1, le=5),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client),
):
    require_reviewer(current_user)

    query = (
        supabase.table("product_reviews")
        .select(
            "id, created_at, updated_at, inventory_id, user_id, reviewer_name, reviewer_email, "
            "rating, title, body, status, verified_purchase, helpful_count, admin_note, moderated_by, moderated_at, "
            "inventory(name, slug)"
        )
        .order("created_at", desc=True)
        .range((page - 1) * page_size, page * page_size - 1)
    )

    if status:
        query = query.eq("status", status)
    if inventory_id:
        query = query.eq("inventory_id", inventory_id)
    if rating:
        query = query.eq("rating", rating)

    result = query.execute()

    # Get total count for pagination
    count_query = supabase.table("product_reviews").select("id", count="exact")
    if status:
        count_query = count_query.eq("status", status)
    if inventory_id:
        count_query = count_query.eq("inventory_id", inventory_id)
    if rating:
        count_query = count_query.eq("rating", rating)
    count_result = count_query.execute()
    total = count_result.count or 0

    return {
        "data": result.data or [],
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": (total + page_size - 1) // page_size,
    }


@router.get("/stats")
async def review_stats(
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client),
):
    """Per-status counts and overall average rating."""
    require_reviewer(current_user)

    all_reviews = supabase.table("product_reviews").select("rating, status").execute()
    rows = all_reviews.data or []

    pending = sum(1 for r in rows if r["status"] == "pending")
    approved = sum(1 for r in rows if r["status"] == "approved")
    rejected = sum(1 for r in rows if r["status"] == "rejected")
    approved_rows = [r for r in rows if r["status"] == "approved"]
    avg = (
        round(sum(r["rating"] for r in approved_rows) / len(approved_rows), 1)
        if approved_rows else 0.0
    )

    return {
        "total": len(rows),
        "pending": pending,
        "approved": approved,
        "rejected": rejected,
        "avg_rating": avg,
    }


@router.get("/{review_id}")
async def get_review(
    review_id: str,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client),
):
    require_reviewer(current_user)

    result = (
        supabase.table("product_reviews")
        .select("*, inventory(name, slug)")
        .eq("id", review_id)
        .single()
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Review not found.")
    return result.data


@router.patch("/{review_id}")
async def moderate_review(
    review_id: str,
    body: ModerateReviewRequest,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client),
):
    require_reviewer(current_user)

    if body.status not in ("approved", "rejected"):
        raise HTTPException(status_code=400, detail="status must be 'approved' or 'rejected'.")

    update_data = {
        "status": body.status,
        "admin_note": body.admin_note,
        "moderated_by": current_user.get("email") or current_user.get("name", "CRM"),
        "moderated_at": datetime.utcnow().isoformat(),
        "updated_at": datetime.utcnow().isoformat(),
    }

    result = (
        supabase.table("product_reviews")
        .update(update_data)
        .eq("id", review_id)
        .execute()
    )

    if not result.data:
        raise HTTPException(status_code=404, detail="Review not found.")

    return {"success": True, "review": result.data[0]}


@router.delete("/{review_id}")
async def delete_review(
    review_id: str,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client),
):
    if current_user.get("role") not in {"superadmin", "master_admin", "admin"}:
        raise HTTPException(status_code=403, detail="Only admins can permanently delete reviews.")

    supabase.table("product_reviews").delete().eq("id", review_id).execute()
    return {"success": True, "message": "Review permanently deleted."}
