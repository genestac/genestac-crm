from fastapi import APIRouter, Depends, HTTPException, Body
from pydantic import BaseModel
from supabase import Client
from db.supabase import get_supabase_client
from api.deps import get_current_user
from typing import Dict, Any, List, Optional
from services.whatsapp_service import send_whatsapp_text
from datetime import datetime, timezone

router = APIRouter()


@router.get("/conversations")
async def get_conversations(
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    """Get a list of all active conversations ordered by the most recent message."""
    try:
        # Fetch the most recent 1000 messages to extract active leads
        msg_res = supabase.table("whatsapp_messages") \
            .select("lead_id, user_id, message_body, sender_type, created_at") \
            .order("created_at", desc=True) \
            .limit(1000) \
            .execute()
            
        messages = msg_res.data or []
        
        # Deduplicate to find the latest message per person
        conversations_map = {}
        for msg in messages:
            person_id = msg.get("lead_id") or msg.get("user_id")
            if not person_id:
                continue
                
            if person_id not in conversations_map:
                conversations_map[person_id] = {
                    "id": person_id,
                    "is_user": bool(msg.get("user_id")),
                    "last_message": msg["message_body"],
                    "last_message_time": msg["created_at"],
                    "sender_type": msg["sender_type"]
                }
                
        # Now fetch the details for these leads and users
        lead_ids = [c["id"] for c in conversations_map.values() if not c["is_user"]]
        user_ids = [c["id"] for c in conversations_map.values() if c["is_user"]]
        
        leads_dict = {}
        if lead_ids:
            leads_res = supabase.table("leads").select("id, name, phone_number, metadata").in_("id", lead_ids).execute()
            for l in (leads_res.data or []):
                leads_dict[l["id"]] = l
                
        users_dict = {}
        if user_ids:
            users_res = supabase.table("users").select("id, name, phone, metadata").in_("id", user_ids).execute()
            for u in (users_res.data or []):
                users_dict[u["id"]] = u
                
        # Merge data
        final_list = []
        for person_id, conv in conversations_map.items():
            if conv["is_user"] and person_id in users_dict:
                user = users_dict[person_id]
                conv["name"] = user.get("name") or "Unknown User"
                conv["phone"] = user.get("phone")
                conv["bot_paused"] = (user.get("metadata") or {}).get("bot_paused", False)
                final_list.append(conv)
            elif not conv["is_user"] and person_id in leads_dict:
                lead = leads_dict[person_id]
                conv["name"] = lead.get("name") or "Unknown Lead"
                conv["phone"] = lead.get("phone_number")
                conv["bot_paused"] = (lead.get("metadata") or {}).get("bot_paused", False)
                final_list.append(conv)
                
        # They are already roughly ordered because we processed messages in DESC order,
        # but let's strictly sort them just in case.
        final_list.sort(key=lambda x: x["last_message_time"], reverse=True)
        
        return {"data": final_list}
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/reminder-subscribers")
async def get_reminder_subscribers(
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    """
    Returns active subscribed users who haven't sent any WhatsApp message
    since their subscription start date (i.e. they haven't 'logged in' / engaged
    via WhatsApp since subscribing).
    These are surfaced in the inbox as reminder entries.
    """
    try:
        # 1. Fetch all active subscriptions with user data and start_date
        subs_res = supabase.table("subscriptions") \
            .select("user_id, start_date, created_at, users(id, name, phone)") \
            .eq("status", "active") \
            .order("created_at", desc=True) \
            .execute()
        subs = subs_res.data or []

        if not subs:
            return {"data": []}

        # Build a map of user_id -> subscription info (keep earliest start_date per user)
        user_sub_map: Dict[str, dict] = {}
        for sub in subs:
            uid = sub.get("user_id")
            if not uid:
                continue
            # Use subscription start_date (or created_at as fallback) as threshold
            threshold = sub.get("start_date") or sub.get("created_at", "")[:10]
            if uid not in user_sub_map or threshold < user_sub_map[uid]["threshold"]:
                user_sub_map[uid] = {
                    "user_id": uid,
                    "threshold": threshold,
                    "user": sub.get("users") or {},
                }

        if not user_sub_map:
            return {"data": []}

        user_ids = list(user_sub_map.keys())

        # 2. For each subscribed user, find their latest WhatsApp message sent BY THEM
        #    (sender_type = 'lead' or 'user') since their subscription start date.
        #    Also fetch the latest reminder message (sender_type = 'bot') for preview.
        msgs_res = supabase.table("whatsapp_messages") \
            .select("user_id, message_body, sender_type, created_at, metadata") \
            .in_("user_id", user_ids) \
            .order("created_at", desc=True) \
            .limit(2000) \
            .execute()
        messages = msgs_res.data or []

        # Group by user_id: track latest user-sent message and latest bot/reminder message
        user_latest_user_msg: Dict[str, str] = {}   # user_id -> latest date they messaged
        user_latest_reminder: Dict[str, dict] = {}   # user_id -> latest reminder message row

        for msg in messages:
            uid = msg.get("user_id")
            if not uid or uid not in user_sub_map:
                continue
            sender = msg.get("sender_type", "")
            msg_date = (msg.get("created_at") or "")[:10]

            if sender in ("lead", "user"):
                if uid not in user_latest_user_msg:
                    user_latest_user_msg[uid] = msg_date
            elif sender in ("bot", "admin", "system"):
                if uid not in user_latest_reminder:
                    user_latest_reminder[uid] = msg

        # 3. Build the result: users whose latest user-message date is BEFORE their
        #    subscription threshold (or who have never messaged at all).
        result = []
        for uid, info in user_sub_map.items():
            threshold = info["threshold"]
            latest_user_msg_date = user_latest_user_msg.get(uid)

            # User has NOT engaged via WhatsApp since subscribing
            has_engaged = latest_user_msg_date and latest_user_msg_date >= threshold
            if has_engaged:
                continue

            user = info["user"]
            reminder_msg = user_latest_reminder.get(uid)

            # Calculate days since subscription started
            try:
                from datetime import date as _date
                sub_date = _date.fromisoformat(threshold)
                days_inactive = (datetime.now(timezone.utc).date() - sub_date).days
            except Exception:
                days_inactive = 0

            result.append({
                "id": uid,
                "is_user": True,
                "is_reminder_subscriber": True,
                "name": user.get("name") or "Unknown User",
                "phone": user.get("phone"),
                "subscription_start_date": threshold,
                "days_inactive": days_inactive,
                "last_message": reminder_msg["message_body"] if reminder_msg else "No messages yet",
                "last_message_time": reminder_msg["created_at"] if reminder_msg else info.get("threshold") + "T00:00:00Z",
                "sender_type": "bot" if reminder_msg else None,
                "bot_paused": False,
            })

        # Sort by days_inactive descending (most inactive first)
        result.sort(key=lambda x: x["days_inactive"], reverse=True)

        return {"data": result}
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{lead_id}")
async def get_whatsapp_chat(
    lead_id: str,
    current_user: dict = Depends(get_current_user),

    supabase: Client = Depends(get_supabase_client)
):
    """Get the full chat history for a lead/user, plus abuse-block status."""
    try:
        # Check if it's a lead or user and fetch metadata
        is_user = False
        metadata = {}
        lead_res = supabase.table("leads").select("id, metadata").eq("id", lead_id).execute()
        if not lead_res.data:
            user_res = supabase.table("users").select("id, metadata").eq("id", lead_id).execute()
            if not user_res.data:
                raise HTTPException(status_code=404, detail="Lead/User not found")
            is_user = True
            metadata = user_res.data[0].get("metadata") or {}
        else:
            metadata = lead_res.data[0].get("metadata") or {}

        lead_col = "user_id" if is_user else "lead_id"

        chat_res = supabase.table("whatsapp_messages") \
            .select("*") \
            .eq(lead_col, lead_id) \
            .order("created_at", desc=False) \
            .execute()

        return {
            "data": chat_res.data,
            "is_blocked": bool(metadata.get("abuse_blocked")),
            "abuse_strikes": int(metadata.get("abuse_strikes", 0)),
            # Return chat-specific score so the WhatsApp window shows what the
            # chatbot scored, independent of any call score.
            "score_label": metadata.get("chat_score_label") or metadata.get("lead_score_label"),
            "score": metadata.get("chat_score") if metadata.get("chat_score") is not None else metadata.get("lead_score"),
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/{lead_id}/unblock")
async def unblock_lead(
    lead_id: str,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    """Remove the abuse block from a lead/user so the AI bot can respond again."""
    try:
        # Try users table first, then leads
        for tbl in ("users", "leads"):
            res = supabase.table(tbl).select("id, metadata").eq("id", lead_id).execute()
            if res.data:
                metadata = res.data[0].get("metadata") or {}
                metadata.pop("abuse_blocked", None)
                metadata.pop("abuse_strikes", None)
                metadata["bot_paused"] = False
                supabase.table(tbl).update({"metadata": metadata}).eq("id", lead_id).execute()
                return {"success": True}
        raise HTTPException(status_code=404, detail="Lead/User not found")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/{lead_id}/send")
async def send_whatsapp_message(
    lead_id: str,
    payload: Dict[str, Any] = Body(...),
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    """Send a manual message from the admin dashboard to the lead."""
    message = payload.get("message")
    if not message:
        raise HTTPException(status_code=400, detail="Message is required")
        
    try:
        # 1. Fetch phone number and pause bot
        lead_res = supabase.table("leads").select("id, phone_number, metadata").eq("id", lead_id).execute()
        table = "leads"
        phone = None
        metadata = {}
        
        if lead_res.data:
            phone = lead_res.data[0].get("phone_number")
            metadata = lead_res.data[0].get("metadata") or {}
        else:
            user_res = supabase.table("users").select("id, phone, metadata").eq("id", lead_id).execute()
            if user_res.data:
                table = "users"
                phone = user_res.data[0].get("phone")
                metadata = user_res.data[0].get("metadata") or {}
            else:
                raise HTTPException(status_code=404, detail="Lead/User not found")
                
        if not phone:
            raise HTTPException(status_code=400, detail="No phone number found for this lead")
            
        # 2. Pause AI Bot
        metadata["bot_paused"] = True
        supabase.table(table).update({"metadata": metadata}).eq("id", lead_id).execute()
        
        # 3. Clean phone number
        clean_phone = ''.join(filter(str.isdigit, phone))
        
        # 4. Send Message via WhatsApp API
        await send_whatsapp_text(clean_phone, message)
        
        # 5. Save to DB
        lead_col = "user_id" if table == "users" else "lead_id"
        new_msg = {
            lead_col: lead_id,
            "message_body": message,
            "sender_type": "admin"
        }
        res = supabase.table("whatsapp_messages").insert(new_msg).execute()
        
        return {"success": True, "data": res.data[0] if res.data else None}
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/{lead_id}/resume-bot")
async def resume_bot(
    lead_id: str,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    """Resume the AI bot for this lead."""
    try:
        lead_res = supabase.table("leads").select("metadata").eq("id", lead_id).execute()
        table = "leads"
        if lead_res.data:
            metadata = lead_res.data[0].get("metadata") or {}
        else:
            user_res = supabase.table("users").select("metadata").eq("id", lead_id).execute()
            if user_res.data:
                table = "users"
                metadata = user_res.data[0].get("metadata") or {}
            else:
                raise HTTPException(status_code=404, detail="Lead/User not found")
                
        metadata["bot_paused"] = False
        supabase.table(table).update({"metadata": metadata}).eq("id", lead_id).execute()
        
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/{lead_id}/message/{message_id}")
async def delete_whatsapp_message(
    lead_id: str,
    message_id: str,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    """Delete a specific WhatsApp message by its ID."""
    try:
        # Note: Supabase delete does NOT reliably return rows when RLS policies are active,
        # so we don't check res.data for existence — we just fire the delete and trust it.
        supabase.table("whatsapp_messages").delete().eq("id", message_id).execute()
        return {"success": True, "deleted_id": message_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/{lead_id}/all")
async def delete_all_whatsapp_messages(
    lead_id: str,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    """Delete the entire chat history for a lead/user."""
    try:
        # Try deleting by lead_id first, then user_id
        res_lead = supabase.table("whatsapp_messages").delete().eq("lead_id", lead_id).execute()
        res_user = supabase.table("whatsapp_messages").delete().eq("user_id", lead_id).execute()
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class RenamePayload(BaseModel):
    name: str


@router.patch("/{lead_id}/rename")
async def rename_lead(
    lead_id: str,
    payload: RenamePayload,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    """Rename a lead or user directly from the chat UI."""
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name cannot be empty")
    try:
        # Try users table first, then leads
        res = supabase.table("users").update({"name": name}).eq("id", lead_id).execute()
        if not res.data:
            res = supabase.table("leads").update({"name": name}).eq("id", lead_id).execute()
        if not res.data:
            raise HTTPException(status_code=404, detail="Lead/User not found")
        return {"success": True, "name": name}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
