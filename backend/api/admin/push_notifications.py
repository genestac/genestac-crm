"""
api/admin/push_notifications.py
================================
Admin API for sending push notifications to mobile app users.

Endpoints:
  POST /api/admin/push-notifications/send   — Send to all, subscribers, or specific users
  GET  /api/admin/push-notifications/history — List sent notifications
  GET  /api/admin/push-notifications/users   — List users with push tokens (for targeting)
"""

import os
import json
import logging
import httpx
from datetime import datetime, timezone
from typing import Optional, List
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from pydantic import BaseModel
from supabase import Client
from db.supabase import get_supabase_client

logger = logging.getLogger(__name__)
router = APIRouter()

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"


# ── Request Models ─────────────────────────────────────────────────────────────

class SendNotificationRequest(BaseModel):
    title: str
    body: str
    image_url: Optional[str] = None
    type: str = "general"          # general | offer | health_tip | system_update | reminder
    target: str = "all"            # all | subscribers | specific
    user_ids: Optional[List[str]] = None   # used when target = "specific"
    screen: Optional[str] = None           # deep link: "ai-doctor-chat" | "dashboard" | etc.
    data: Optional[dict] = None


# ── Helpers ────────────────────────────────────────────────────────────────────

async def _send_expo_batch(messages: list) -> dict:
    """Send a batch of Expo push notifications (max 100 per request)."""
    results = {"sent": 0, "failed": 0, "errors": []}
    chunks = [messages[i:i+100] for i in range(0, len(messages), 100)]

    async with httpx.AsyncClient(timeout=30) as client:
        for chunk in chunks:
            try:
                resp = await client.post(
                    EXPO_PUSH_URL,
                    json=chunk,
                    headers={
                        "Accept": "application/json",
                        "Accept-Encoding": "gzip, deflate",
                        "Content-Type": "application/json",
                    }
                )
                result = resp.json()
                for item in result.get("data", []):
                    if item.get("status") == "ok":
                        results["sent"] += 1
                    else:
                        results["failed"] += 1
                        results["errors"].append(item.get("message", "Unknown error"))
            except Exception as e:
                results["failed"] += len(chunk)
                results["errors"].append(str(e))

    return results


def _build_expo_message(token: str, title: str, body: str, image_url: str = None,
                        screen: str = None, extra_data: dict = None) -> dict:
    msg = {
        "to": token,
        "title": title,
        "body": body,
        "sound": "default",
        "priority": "high",
        "channelId": "default",   # Must match channel created in the mobile app
    }
    if image_url:
        msg["image"] = image_url   # Works on iOS natively
    data = extra_data or {}
    if screen:
        data["screen"] = screen
    if image_url:
        data["image_url"] = image_url  # Android: mobile app reads this to show image
    if data:
        msg["data"] = data
    return msg


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.post("/send")
async def send_push_notification(
    body: SendNotificationRequest,
    supabase: Client = Depends(get_supabase_client)
):
    """
    Send push notification to:
    - all: every user with a push token
    - subscribers: users with active subscriptions
    - specific: list of user IDs
    """
    try:
        # ── Fetch target users ───────────────────────────────────────────────
        tokens: List[dict] = []  # [{user_id, token, name}]

        if body.target == "specific" and body.user_ids:
            res = supabase.table("users").select("id, name, metadata").in_("id", body.user_ids).execute()
            for u in (res.data or []):
                token = ((u.get("metadata") or {}).get("expo_push_token"))
                if token and token.startswith("Exponent"):
                    tokens.append({"user_id": u["id"], "name": u.get("name"), "token": token})

        elif body.target == "subscribers":
            res = supabase.table("subscriptions").select(
                "user_id, users(id, name, metadata)"
            ).eq("status", "active").execute()
            for s in (res.data or []):
                u = s.get("users") or {}
                token = ((u.get("metadata") or {}).get("expo_push_token"))
                if token and token.startswith("Exponent"):
                    tokens.append({"user_id": s["user_id"], "name": u.get("name"), "token": token})

        else:  # all
            res = supabase.table("users").select("id, name, metadata").execute()
            for u in (res.data or []):
                token = ((u.get("metadata") or {}).get("expo_push_token"))
                if token and token.startswith("Exponent"):
                    tokens.append({"user_id": u["id"], "name": u.get("name"), "token": token})

        if not tokens:
            return {"success": False, "error": "No users with push tokens found for this target"}

        # ── Build messages ───────────────────────────────────────────────────
        messages = [
            _build_expo_message(
                token=t["token"],
                title=body.title,
                body=body.body,
                image_url=body.image_url,
                screen=body.screen,
                extra_data={**(body.data or {}), "notification_type": body.type},
            )
            for t in tokens
        ]

        # ── Send via Expo ────────────────────────────────────────────────────
        result = await _send_expo_batch(messages)

        # ── Save to notification_history table ───────────────────────────────
        try:
            supabase.table("notification_history").insert({
                "title": body.title,
                "body": body.body,
                "image_url": body.image_url,
                "type": body.type,
                "target": body.target,
                "target_user_ids": body.user_ids,
                "screen": body.screen,
                "recipients_count": len(tokens),
                "sent_count": result["sent"],
                "failed_count": result["failed"],
                "sent_at": datetime.now(timezone.utc).isoformat(),
            }).execute()
        except Exception as e:
            logger.warning(f"[PushNotif] Failed to save notification history: {e}")

        return {
            "success": True,
            "recipients": len(tokens),
            "sent": result["sent"],
            "failed": result["failed"],
            "errors": result["errors"][:5] if result["errors"] else [],
        }

    except Exception as e:
        logger.error(f"[PushNotif] Send failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/history")
async def get_notification_history(
    limit: int = 50,
    supabase: Client = Depends(get_supabase_client)
):
    """Get list of previously sent notifications."""
    try:
        res = supabase.table("notification_history").select("*").order(
            "sent_at", desc=True
        ).limit(limit).execute()
        return {"success": True, "data": res.data or []}
    except Exception as e:
        # If table doesn't exist yet, return empty
        logger.warning(f"[PushNotif] History fetch failed (table may not exist): {e}")
        return {"success": True, "data": []}


@router.get("/users")
async def get_users_with_tokens(
    supabase: Client = Depends(get_supabase_client)
):
    """Get list of users who have registered push tokens (for specific targeting)."""
    try:
        res = supabase.table("users").select("id, name, email, phone, metadata").execute()
        users_with_tokens = [
            {
                "id": u["id"],
                "name": u.get("name"),
                "email": u.get("email"),
                "phone": u.get("phone"),
                "has_token": bool(((u.get("metadata") or {}).get("expo_push_token")))
            }
            for u in (res.data or [])
            if ((u.get("metadata") or {}).get("expo_push_token"))
        ]
        return {"success": True, "data": users_with_tokens, "total": len(users_with_tokens)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/stats")
async def get_notification_stats(
    supabase: Client = Depends(get_supabase_client)
):
    """Get quick stats: total users, users with tokens, subscribers with tokens."""
    try:
        all_users = supabase.table("users").select("id, metadata").execute()
        total_users = len(all_users.data or [])
        users_with_tokens = sum(
            1 for u in (all_users.data or [])
            if ((u.get("metadata") or {}).get("expo_push_token"))
        )

        subs = supabase.table("subscriptions").select("user_id").eq("status", "active").execute()
        subscriber_ids = {s["user_id"] for s in (subs.data or [])}
        subscribers_with_tokens = sum(
            1 for u in (all_users.data or [])
            if u["id"] in subscriber_ids and ((u.get("metadata") or {}).get("expo_push_token"))
        )

        return {
            "success": True,
            "total_users": total_users,
            "users_with_tokens": users_with_tokens,
            "subscribers_with_tokens": subscribers_with_tokens,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ── Open / Click Tracking (called by mobile app) ──────────────────────────────

class TrackOpenRequest(BaseModel):
    notification_id: str
    user_id: Optional[str] = None
    screen: Optional[str] = None


@router.post("/track-open")
async def track_notification_open(body: TrackOpenRequest, supabase: Client = Depends(get_supabase_client)):
    """Called by the mobile app when the user taps a push notification."""
    try:
        supabase.table("notification_events").insert({
            "notification_id": body.notification_id,
            "user_id": body.user_id,
            "event_type": "open",
            "screen": body.screen,
            "occurred_at": datetime.now(timezone.utc).isoformat(),
        }).execute()
        # Increment open_count on notification_history
        existing = supabase.table("notification_history").select("open_count").eq("id", body.notification_id).limit(1).execute()
        existing_row = existing.data[0] if existing.data else {}
        current = (existing_row or {}).get("open_count", 0) or 0
        supabase.table("notification_history").update({"open_count": current + 1}).eq("id", body.notification_id).execute()
        return {"success": True}
    except Exception as e:
        logger.warning(f"[PushNotif] Track open failed: {e}")
        return {"success": False}


# ── Analytics ─────────────────────────────────────────────────────────────────

@router.get("/analytics")
async def get_notification_analytics(supabase: Client = Depends(get_supabase_client)):
    """Aggregate analytics: overall rates, by type, daily trend, top performers."""
    try:
        from collections import defaultdict
        history = (supabase.table("notification_history").select("*").order("sent_at", desc=True).limit(500).execute()).data or []
        if not history:
            return {"success": True, "overall": {}, "by_type": [], "daily_trend": [], "top_notifications": []}

        total_sent = len(history)
        total_recipients = sum(n.get("recipients_count", 0) or 0 for n in history)
        total_delivered = sum(n.get("sent_count", 0) or 0 for n in history)
        total_failed = sum(n.get("failed_count", 0) or 0 for n in history)
        total_opened = sum(n.get("open_count", 0) or 0 for n in history)

        # By type
        type_map: dict = defaultdict(lambda: {"type": "", "count": 0, "delivered": 0, "opened": 0, "recipients": 0})
        for n in history:
            t = n.get("type", "general")
            type_map[t]["type"] = t
            type_map[t]["count"] += 1
            type_map[t]["delivered"] += n.get("sent_count", 0) or 0
            type_map[t]["opened"] += n.get("open_count", 0) or 0
            type_map[t]["recipients"] += n.get("recipients_count", 0) or 0
        by_type = []
        for t, d in type_map.items():
            d["open_rate"] = round(d["opened"] / d["delivered"] * 100, 1) if d["delivered"] > 0 else 0
            d["delivery_rate"] = round(d["delivered"] / d["recipients"] * 100, 1) if d["recipients"] > 0 else 0
            by_type.append(dict(d))
        by_type.sort(key=lambda x: x["delivered"], reverse=True)

        # Daily trend
        daily: dict = defaultdict(lambda: {"date": "", "sent": 0, "delivered": 0, "opened": 0})
        for n in history:
            date_str = (n.get("sent_at") or "")[:10]
            if not date_str:
                continue
            daily[date_str]["date"] = date_str
            daily[date_str]["sent"] += 1
            daily[date_str]["delivered"] += n.get("sent_count", 0) or 0
            daily[date_str]["opened"] += n.get("open_count", 0) or 0
        daily_trend = sorted(daily.values(), key=lambda x: x["date"])[-30:]

        # Top performers
        top_notifications = sorted([
            {"id": n.get("id"), "title": n.get("title"), "type": n.get("type", "general"),
             "recipients": n.get("recipients_count", 0), "delivered": n.get("sent_count", 0),
             "opened": n.get("open_count", 0) or 0,
             "open_rate": round(((n.get("open_count", 0) or 0) / max(n.get("sent_count", 1), 1)) * 100, 1),
             "sent_at": n.get("sent_at")}
            for n in history if (n.get("sent_count", 0) or 0) >= 1
        ], key=lambda x: x["open_rate"], reverse=True)[:5]

        return {
            "success": True,
            "overall": {
                "total_notifications_sent": total_sent,
                "total_recipients": total_recipients,
                "total_delivered": total_delivered,
                "total_failed": total_failed,
                "total_opened": total_opened,
                "delivery_rate": round(total_delivered / total_recipients * 100, 1) if total_recipients > 0 else 0,
                "open_rate": round(total_opened / total_delivered * 100, 1) if total_delivered > 0 else 0,
            },
            "by_type": by_type,
            "daily_trend": daily_trend,
            "top_notifications": top_notifications,
        }
    except Exception as e:
        logger.error(f"[PushNotif] Analytics failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ── Image Upload ───────────────────────────────────────────────────────────────

@router.post("/upload-image")
async def upload_notification_image(file: UploadFile = File(...)):
    """Upload an image to Cloudinary for use in push notifications."""
    import cloudinary
    import cloudinary.uploader

    cloudinary.config(
        cloud_name=os.environ.get("CLOUDINARY_CLOUD_NAME") or os.environ.get("EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME"),
        api_key=os.environ.get("CLOUDINARY_API_KEY") or os.environ.get("EXPO_PUBLIC_CLOUDINARY_API_KEY"),
        api_secret=os.environ.get("CLOUDINARY_API_SECRET") or os.environ.get("EXPO_PUBLIC_CLOUDINARY_API_SECRET"),
    )

    try:
        contents = await file.read()
        result = cloudinary.uploader.upload(
            contents,
            folder="push-notifications",
            resource_type="image",
        )
        return {"success": True, "url": result["secure_url"]}
    except Exception as e:
        logger.error(f"[PushNotif] Image upload failed: {e}")
        raise HTTPException(status_code=500, detail=f"Image upload failed: {e}")
