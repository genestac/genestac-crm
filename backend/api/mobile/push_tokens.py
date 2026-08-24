"""
api/mobile/push_tokens.py
==========================
Register the mobile app user's Expo push token in the DB.

POST /api/mobile/register-push-token
  Auth: Supabase JWT (Bearer)
  Body: { "expo_push_token": "ExponentPushToken[...]" }

The token is stored in users.metadata.expo_push_token so the
AI Health Coach scheduler can send push notifications to each user.
"""

import os
import logging
from pydantic import BaseModel
from fastapi import APIRouter, HTTPException, Request
from supabase import create_client

logger = logging.getLogger(__name__)
router = APIRouter()


class PushTokenRequest(BaseModel):
    expo_push_token: str


def _verify_supabase_jwt(token: str) -> str | None:
    try:
        sb = create_client(os.getenv("SUPABASE_URL", ""), os.getenv("SUPABASE_KEY", ""))
        resp = sb.auth.get_user(token)
        if resp and resp.user:
            return resp.user.id
    except Exception as e:
        logger.warning(f"[PushToken] JWT verification failed: {e}")
    return None


@router.post("")
async def register_push_token(body: PushTokenRequest, request: Request):
    """
    POST /api/mobile/register-push-token
    Saves the Expo push token to users.metadata for future push notifications.
    """
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing Authorization header")

    token = auth_header.removeprefix("Bearer ").strip()
    user_id = _verify_supabase_jwt(token)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    if not body.expo_push_token or not body.expo_push_token.startswith("Exponent"):
        raise HTTPException(status_code=400, detail="Invalid Expo push token format")

    try:
        sb = create_client(os.getenv("SUPABASE_URL", ""), os.getenv("SUPABASE_KEY", ""))

        # Merge into existing metadata (don't overwrite other metadata fields)
        existing_res = sb.table("users").select("metadata").eq("id", user_id).maybeSingle().execute()
        existing_meta = (existing_res.data or {}).get("metadata") or {}
        merged_meta = {**existing_meta, "expo_push_token": body.expo_push_token}

        sb.table("users").update({"metadata": merged_meta}).eq("id", user_id).execute()
        logger.info(f"[PushToken] Saved token for user {user_id}")
        return {"success": True}
    except Exception as e:
        logger.error(f"[PushToken] Failed to save token: {e}")
        raise HTTPException(status_code=500, detail="Failed to save push token")
