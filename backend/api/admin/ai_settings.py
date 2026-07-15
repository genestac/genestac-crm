from fastapi import APIRouter, Depends, HTTPException, Body
from supabase import Client
from db.supabase import get_supabase_client
from api.deps import get_current_user
from typing import Dict, Any, List

router = APIRouter()

@router.get("/")
async def get_ai_settings(
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    """Get the global AI Call settings."""
    try:
        # We store AI settings in the global_settings table as JSON
        res = supabase.table("global_settings").select("*").eq("settings_key", "ai_call_settings").execute()
        if res.data:
            return {"data": res.data[0]["settings_value"]}
        else:
            # Default empty settings
            return {"data": {
                "enabled_statuses": [],
                "base_prompt": "You are a helpful AI assistant for Genestac CRM. Be concise and polite.",
                "allowed_time_windows": [{"start": "09:00", "end": "18:00", "days": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]}],
                "exotel_number": ""
            }}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/")
async def update_ai_settings(
    data: Dict[str, Any] = Body(...),
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    """Update the global AI Call settings."""
    # Ensure user is admin
    profile = supabase.table("staffs").select("roles(name)").eq("id", current_user["id"]).single().execute()
    role_name = profile.data.get("roles", {}).get("name") if profile.data and profile.data.get("roles") else None
    if role_name not in ["superadmin", "master_admin", "admin"]:
        raise HTTPException(status_code=403, detail="Not authorized")

    try:
        supabase.table("global_settings").upsert({
            "settings_key": "ai_call_settings",
            "settings_value": data
        }, on_conflict="settings_key").execute()
        return {"success": True, "data": data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/knowledge-base")
async def get_knowledge_base(
    category: str = None,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    """List knowledge base articles."""
    try:
        query = supabase.table("ai_knowledge_base").select("id, category, title, content, created_at, updated_at")
        if category:
            query = query.eq("category", category)
        res = query.order("created_at", desc=False).execute()
        return {"data": res.data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/knowledge-base")
async def add_knowledge_base_item(
    data: Dict[str, Any] = Body(...),
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    """Add a new knowledge base item."""
    try:
        # Generate vector embedding using OpenAI text-embedding-3-small (1536 dims)
        import openai as _openai
        import os
        try:
            oai_client = _openai.OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
            text_to_embed = f"Title: {data.get('title')}\nContent: {data.get('content')}"
            embed_res = oai_client.embeddings.create(
                model="text-embedding-3-small",
                input=text_to_embed,
            )
            embedding = embed_res.data[0].embedding
        except Exception as embed_err:
            print(f"Embedding generation failed: {embed_err}")
            embedding = None

        # ---------------------------------------------------------------------------
        # COMMENTED OUT: Gemini embedding path
        # ---------------------------------------------------------------------------
        # from google import genai
        # client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
        # embed_res = client.models.embed_content(model="text-embedding-004", contents=text_to_embed)
        # embedding = embed_res.embeddings[0].values

        payload = {
            "category": data.get("category", "FAQ"),
            "title": data.get("title"),
            "content": data.get("content"),
            "embedding": embedding
        }
        res = supabase.table("ai_knowledge_base").insert(payload).execute()
        return {"success": True, "data": res.data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/knowledge-base/{item_id}")
async def delete_knowledge_base_item(
    item_id: str,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    """Delete a knowledge base item."""
    try:
        supabase.table("ai_knowledge_base").delete().eq("id", item_id).execute()
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/call-logs")
async def get_all_call_logs(
    limit: int = 50,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    """Get all AI call logs across all leads for admin dashboard."""
    try:
        logs_res = (
            supabase.table("ai_call_logs")
            .select("*")
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        logs = logs_res.data or []

        # Batch-fetch lead names for all unique lead_ids
        lead_ids = list({l["lead_id"] for l in logs if l.get("lead_id")})
        lead_map: dict = {}
        if lead_ids:
            leads_res = (
                supabase.table("leads")
                .select("id, name, phone_number, status")
                .in_("id", lead_ids)
                .execute()
            )
            lead_map = {l["id"]: l for l in (leads_res.data or [])}

            # Check users table for missing IDs (as many "leads" are actually registered users)
            missing_ids = [lid for lid in lead_ids if lid not in lead_map]
            if missing_ids:
                users_res = (
                    supabase.table("users")
                    .select("id, name, phone, status")
                    .in_("id", missing_ids)
                    .execute()
                )
                for u in (users_res.data or []):
                    # Normalize the user data to match lead structure
                    lead_map[u["id"]] = {
                        "id": u["id"],
                        "name": u.get("name") or "Unknown",
                        "phone_number": u.get("phone"),
                        "crm_status": u.get("status")
                    }

        # Attach lead info to each log
        for log in logs:
            lead = lead_map.get(log.get("lead_id"), {})
            log["leads"] = {
                "name": lead.get("name"), 
                "phone": lead.get("phone_number"),
                "crm_status": lead.get("status") or lead.get("crm_status")
            }

        return {"data": logs}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/queue")
async def get_ai_call_queue(
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    """Get the AI call queue from global settings."""
    try:
        res = supabase.table("global_settings").select("*").eq("settings_key", "ai_call_queue").execute()
        queue = []
        if res.data:
            queue = res.data[0]["settings_value"]
            
        # Enrich queue with lead data
        if queue:
            lead_ids = [item["lead_id"] for item in queue if "lead_id" in item]
            if lead_ids:
                leads_res = supabase.table("leads").select("id, name, phone_number, status").in_("id", lead_ids).execute()
                users_res = supabase.table("users").select("id, name, phone, status").in_("id", lead_ids).execute()
                
                lead_map = {l["id"]: l for l in (leads_res.data or [])}
                for u in (users_res.data or []):
                    if u["id"] not in lead_map:
                        lead_map[u["id"]] = {"id": u["id"], "name": u.get("name") or "Unknown", "phone_number": u.get("phone"), "status": u.get("status")}
                        
                for item in queue:
                    lead = lead_map.get(item.get("lead_id"), {})
                    item["leads"] = {
                        "name": lead.get("name"), 
                        "phone": lead.get("phone_number"),
                        "crm_status": lead.get("status")
                    }
                    
        return {"data": queue}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/queue")
async def update_ai_call_queue(
    data: List[Dict[str, Any]] = Body(...),
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    """Update the entire AI call queue (for reordering)."""
    try:
        supabase.table("global_settings").upsert({
            "settings_key": "ai_call_queue",
            "settings_value": data
        }, on_conflict="settings_key").execute()
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/queue/enqueue")
async def enqueue_ai_call(
    payload: Dict[str, Any] = Body(...),
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    """Manually add a lead to the call queue."""
    lead_id = payload.get("lead_id")
    if not lead_id:
        raise HTTPException(status_code=400, detail="lead_id is required")
        
    try:
        import uuid
        from datetime import datetime
        new_item = {
            "id": str(uuid.uuid4()),
            "lead_id": lead_id,
            "status": "pending",
            "created_at": datetime.now().isoformat()
        }
        
        res = supabase.table("global_settings").select("*").eq("settings_key", "ai_call_queue").execute()
        queue = res.data[0]["settings_value"] if res.data else []
        
        # Check if already in queue
        if any(item.get("lead_id") == lead_id for item in queue):
            return {"success": True, "message": "Lead is already in the queue."}
            
        queue.append(new_item)
        
        supabase.table("global_settings").upsert({
            "settings_key": "ai_call_queue",
            "settings_value": queue
        }, on_conflict="settings_key").execute()
        return {"success": True, "data": new_item}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/queue/process-next")
async def process_next_in_queue(
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    """Process the next pending call in the queue."""
    try:
        res = supabase.table("global_settings").select("*").eq("settings_key", "ai_call_queue").execute()
        queue = res.data[0]["settings_value"] if res.data else []
        
        # Find first pending
        pending_idx = next((i for i, item in enumerate(queue) if item.get("status") == "pending"), -1)
        if pending_idx == -1:
            return {"success": False, "message": "No pending calls in queue."}
            
        next_call = queue[pending_idx]
        lead_id = next_call["lead_id"]
        
        # Mark as processing
        queue[pending_idx]["status"] = "processing"
        supabase.table("global_settings").upsert({
            "settings_key": "ai_call_queue",
            "settings_value": queue
        }, on_conflict="settings_key").execute()
        
        # We need to trigger the call using the existing logic in sales/leads.py or exotel_service
        from services.exotel_service import initiate_ai_call
        
        phone = None
        user_res = supabase.table("users").select("phone").eq("id", lead_id).execute()
        if user_res.data and user_res.data[0].get("phone"):
            phone = user_res.data[0]["phone"]
        else:
            lead_res = supabase.table("leads").select("phone_number").eq("id", lead_id).execute()
            if lead_res.data and lead_res.data[0].get("phone_number"):
                phone = lead_res.data[0]["phone_number"]
                
        if not phone:
            queue[pending_idx]["status"] = "failed"
            supabase.table("global_settings").upsert({"settings_key": "ai_call_queue", "settings_value": queue}, on_conflict="settings_key").execute()
            return {"success": False, "message": "Lead phone not found"}
            
        settings_res = supabase.table("global_settings").select("settings_value").eq("settings_key", "ai_call_settings").execute()
        ai_settings = settings_res.data[0]["settings_value"] if settings_res.data else {}
        exotel_number = ai_settings.get("exotel_caller_id") or ai_settings.get("exotel_number")
        
        if not exotel_number:
            queue[pending_idx]["status"] = "failed"
            supabase.table("global_settings").upsert({"settings_key": "ai_call_queue", "settings_value": queue}, on_conflict="settings_key").execute()
            return {"success": False, "message": "Exotel caller ID not configured"}
            
        log_res = supabase.table("ai_call_logs").insert({"lead_id": lead_id, "status": "initiating"}).execute()
        call_log_id = log_res.data[0]["id"]
        
        exotel_res = initiate_ai_call(from_number=exotel_number, to_number=phone, lead_id=lead_id)
        
        if exotel_res and "Call" in exotel_res:
            call_sid = exotel_res["Call"].get("Sid")
            supabase.table("ai_call_logs").update({"call_sid": call_sid, "status": "ringing"}).eq("id", call_log_id).execute()
            # Remove from queue or mark completed
            queue.pop(pending_idx)
            supabase.table("global_settings").upsert({"settings_key": "ai_call_queue", "settings_value": queue}, on_conflict="settings_key").execute()
            return {"success": True, "message": "Call initiated"}
        else:
            supabase.table("ai_call_logs").update({"status": "failed_to_initiate"}).eq("id", call_log_id).execute()
            queue[pending_idx]["status"] = "failed"
            supabase.table("global_settings").upsert({"settings_key": "ai_call_queue", "settings_value": queue}, on_conflict="settings_key").execute()
            return {"success": False, "message": "Failed to initiate Exotel call"}
            
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
