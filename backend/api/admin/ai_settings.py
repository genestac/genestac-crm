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
                .select("id, name, phone_number")
                .in_("id", lead_ids)
                .execute()
            )
            lead_map = {l["id"]: l for l in (leads_res.data or [])}

        # Attach lead info to each log
        for log in logs:
            lead = lead_map.get(log.get("lead_id"), {})
            log["leads"] = {"name": lead.get("name"), "phone": lead.get("phone_number")}

        return {"data": logs}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
