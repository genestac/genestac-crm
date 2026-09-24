"""
api/admin/exercises.py
======================
Admin API for managing Exercises & Yoga content library.

Endpoints:
  GET    /api/admin/exercises/                — List exercises (filterable)
  POST   /api/admin/exercises/                — Create exercise
  GET    /api/admin/exercises/{id}            — Get single exercise
  PUT    /api/admin/exercises/{id}            — Update exercise
  DELETE /api/admin/exercises/{id}            — Delete exercise
  POST   /api/admin/exercises/upload-video    — Upload video to Cloudinary (folder: exercises/videos)
  POST   /api/admin/exercises/upload-thumbnail — Upload thumbnail to Cloudinary (folder: exercises/thumbnails)
"""

import os
import logging
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from pydantic import BaseModel
from supabase import Client
from db.supabase import get_supabase_client
from api.deps import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter()

# ── Role Guard ─────────────────────────────────────────────────────────────────

ALLOWED_ROLES = {"superadmin", "master_admin", "admin", "digital_marketing"}

def require_admin(current_user: dict):
    role = current_user.get("role")
    if role not in ALLOWED_ROLES:
        raise HTTPException(status_code=403, detail="Access denied. Admin role required.")


# ── Pydantic Models ────────────────────────────────────────────────────────────

class ExerciseCreate(BaseModel):
    title: str
    description: Optional[str] = None
    category: str                           # yoga | strength | cardio | stretching | breathing | meditation
    type: str = "exercise"                  # exercise | yoga
    difficulty: str = "beginner"            # beginner | intermediate | advanced
    duration_minutes: Optional[int] = None
    video_url: Optional[str] = None
    thumbnail_url: Optional[str] = None
    tags: Optional[List[str]] = None
    instructions: Optional[str] = None     # step-by-step instructions
    benefits: Optional[List[str]] = None   # health benefits list
    equipment_needed: Optional[str] = None
    is_active: bool = True

class ExerciseUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    type: Optional[str] = None
    difficulty: Optional[str] = None
    duration_minutes: Optional[int] = None
    video_url: Optional[str] = None
    thumbnail_url: Optional[str] = None
    tags: Optional[List[str]] = None
    instructions: Optional[str] = None
    benefits: Optional[List[str]] = None
    equipment_needed: Optional[str] = None
    is_active: Optional[bool] = None


# ── Cloudinary Helper ──────────────────────────────────────────────────────────

def _configure_cloudinary():
    import cloudinary
    cloudinary.config(
        cloud_name=os.environ.get("CLOUDINARY_CLOUD_NAME"),
        api_key=os.environ.get("CLOUDINARY_API_KEY"),
        api_secret=os.environ.get("CLOUDINARY_API_SECRET"),
    )
    return cloudinary


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("/")
async def list_exercises(
    category: Optional[str] = Query(None),
    type: Optional[str] = Query(None),
    difficulty: Optional[str] = Query(None),
    is_active: Optional[bool] = Query(None),
    search: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client),
):
    """List all exercises with optional filters."""
    require_admin(current_user)

    offset = (page - 1) * limit
    q = supabase.table("exercises").select("*").order("created_at", desc=True)

    if category:
        q = q.eq("category", category)
    if type:
        q = q.eq("type", type)
    if difficulty:
        q = q.eq("difficulty", difficulty)
    if is_active is not None:
        q = q.eq("is_active", is_active)
    if search:
        q = q.ilike("title", f"%{search}%")

    q = q.range(offset, offset + limit - 1)
    res = q.execute()

    # Count
    count_q = supabase.table("exercises").select("id", count="exact")
    if category:
        count_q = count_q.eq("category", category)
    if type:
        count_q = count_q.eq("type", type)
    if difficulty:
        count_q = count_q.eq("difficulty", difficulty)
    if is_active is not None:
        count_q = count_q.eq("is_active", is_active)
    if search:
        count_q = count_q.ilike("title", f"%{search}%")

    count_res = count_q.execute()

    return {"exercises": res.data, "total": count_res.count, "page": page, "limit": limit}


@router.get("/stats")
async def get_exercise_stats(
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client),
):
    """Get summary stats for the exercise library."""
    require_admin(current_user)

    total_res = supabase.table("exercises").select("id", count="exact").execute()
    active_res = supabase.table("exercises").select("id", count="exact").eq("is_active", True).execute()
    yoga_res = supabase.table("exercises").select("id", count="exact").eq("type", "yoga").execute()
    exercise_res = supabase.table("exercises").select("id", count="exact").eq("type", "exercise").execute()

    # Category breakdown
    category_rows = supabase.table("exercises").select("category").execute()
    category_counts: dict = {}
    for row in (category_rows.data or []):
        cat = row.get("category", "other")
        category_counts[cat] = category_counts.get(cat, 0) + 1

    return {
        "total": total_res.count or 0,
        "active": active_res.count or 0,
        "yoga": yoga_res.count or 0,
        "exercises": exercise_res.count or 0,
        "by_category": category_counts,
    }


@router.post("/upload-video")
async def upload_exercise_video(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    """Upload a video file to Cloudinary under the 'exercises/videos' folder."""
    require_admin(current_user)

    # Validate MIME type
    allowed_types = {"video/mp4", "video/webm", "video/quicktime", "video/avi", "video/x-msvideo"}
    if file.content_type not in allowed_types:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type '{file.content_type}'. Allowed: mp4, webm, mov, avi."
        )

    cloudinary = _configure_cloudinary()
    import cloudinary.uploader

    try:
        contents = await file.read()
        result = cloudinary.uploader.upload(
            contents,
            folder="exercises/videos",
            resource_type="video",
            # Generate a thumbnail automatically
            eager=[{"format": "webp", "transformation": [{"width": 640, "height": 360, "crop": "fill"}]}],
        )
        return {
            "success": True,
            "url": result["secure_url"],
            "public_id": result.get("public_id"),
            "duration": result.get("duration"),          # seconds (Cloudinary returns this for video)
            "thumbnail_url": (
                result.get("eager", [{}])[0].get("secure_url")
                if result.get("eager") else None
            ),
        }
    except Exception as e:
        logger.error(f"[Exercises] Video upload failed: {e}")
        raise HTTPException(status_code=500, detail=f"Video upload failed: {e}")


@router.post("/upload-thumbnail")
async def upload_exercise_thumbnail(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    """Upload a thumbnail image to Cloudinary under the 'exercises/thumbnails' folder."""
    require_admin(current_user)

    allowed_types = {"image/jpeg", "image/png", "image/webp", "image/gif"}
    if file.content_type not in allowed_types:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type '{file.content_type}'. Allowed: jpg, png, webp."
        )

    cloudinary = _configure_cloudinary()
    import cloudinary.uploader

    try:
        contents = await file.read()
        result = cloudinary.uploader.upload(
            contents,
            folder="exercises/thumbnails",
            resource_type="image",
            transformation=[{"width": 640, "height": 360, "crop": "fill", "quality": "auto", "fetch_format": "webp"}],
        )
        return {"success": True, "url": result["secure_url"], "public_id": result.get("public_id")}
    except Exception as e:
        logger.error(f"[Exercises] Thumbnail upload failed: {e}")
        raise HTTPException(status_code=500, detail=f"Thumbnail upload failed: {e}")


@router.post("/")
async def create_exercise(
    payload: ExerciseCreate,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client),
):
    """Create a new exercise entry."""
    require_admin(current_user)

    data = payload.model_dump(exclude_none=True)
    data["created_by"] = current_user.get("id")

    try:
        res = supabase.table("exercises").insert(data).execute()
        return {"success": True, "exercise": res.data[0] if res.data else {}}
    except Exception as e:
        logger.error(f"[Exercises] Create failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{exercise_id}")
async def get_exercise(
    exercise_id: str,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client),
):
    """Get a single exercise by ID."""
    require_admin(current_user)

    res = supabase.table("exercises").select("*").eq("id", exercise_id).single().execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Exercise not found")
    return {"exercise": res.data}


@router.put("/{exercise_id}")
async def update_exercise(
    exercise_id: str,
    payload: ExerciseUpdate,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client),
):
    """Update an exercise."""
    require_admin(current_user)

    data = payload.model_dump(exclude_none=True)
    if not data:
        raise HTTPException(status_code=400, detail="No fields to update")

    from datetime import datetime, timezone
    data["updated_at"] = datetime.now(timezone.utc).isoformat()

    try:
        res = supabase.table("exercises").update(data).eq("id", exercise_id).execute()
        if not res.data:
            raise HTTPException(status_code=404, detail="Exercise not found")
        return {"success": True, "exercise": res.data[0]}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[Exercises] Update failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{exercise_id}")
async def delete_exercise(
    exercise_id: str,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client),
):
    """Delete an exercise."""
    require_admin(current_user)

    try:
        res = supabase.table("exercises").delete().eq("id", exercise_id).execute()
        return {"success": True, "deleted": res.data}
    except Exception as e:
        logger.error(f"[Exercises] Delete failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
