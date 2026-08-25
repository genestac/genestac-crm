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

import logging
from pydantic import BaseModel
from fastapi import APIRouter, HTTPException, Request
from db.supabase import get_supabase_client

logger = logging.getLogger(__name__)
router = APIRouter()


class PushTokenRequest(BaseModel):
    expo_push_token: str


def _verify_supabase_jwt(token: str):
    """
    Verify a Supabase user JWT and return the full auth User object.
    Uses the shared service-role Supabase client.
    Returns None if invalid or verification fails.
    """
    try:
        sb = get_supabase_client()
        resp = sb.auth.get_user(token)
        if resp and resp.user:
            return resp.user
        logger.warning("[PushToken] JWT verified but no user returned")
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

    jwt_token = auth_header.removeprefix("Bearer ").strip()
    auth_user = _verify_supabase_jwt(jwt_token)
    if not auth_user:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    user_id = auth_user.id

    if not body.expo_push_token or not body.expo_push_token.startswith("Exponent"):
        raise HTTPException(status_code=400, detail="Invalid Expo push token format")

    try:
        sb = get_supabase_client()

        # Fetch existing row to avoid overwriting other metadata fields
        existing_res = (
            sb.table("users")
            .select("metadata")
            .eq("id", user_id)
            .maybeSingle()
            .execute()
        )

        if existing_res.data is None:
            # Mobile user exists in Supabase Auth but has no row in users table yet.
            # This happens for Google/Apple OAuth sign-ups. Create a minimal row.
            logger.info(f"[PushToken] No users row for {user_id} — creating one from auth profile")

            # Extract profile info from Supabase auth user metadata
            user_meta = auth_user.user_metadata or {}
            name = user_meta.get("full_name") or user_meta.get("name") or ""
            email = auth_user.email or user_meta.get("email") or ""
            phone = auth_user.phone or "0000000000"  # phone is NOT NULL in users table

            sb.table("users").insert({
                "id": user_id,
                "name": name,
                "email": email,
                "phone": phone,
                "metadata": {"expo_push_token": body.expo_push_token},
            }).execute()
            logger.info(f"[PushToken] ✅ Created users row + saved token for {user_id} ({email})")
        else:
            existing_meta = existing_res.data.get("metadata") or {}
            merged_meta = {**existing_meta, "expo_push_token": body.expo_push_token}
            sb.table("users").update({"metadata": merged_meta}).eq("id", user_id).execute()
            logger.info(f"[PushToken] ✅ Updated token for existing user {user_id}")

        return {"success": True}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[PushToken] ❌ Failed to save token for user {user_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to save push token: {str(e)}")
