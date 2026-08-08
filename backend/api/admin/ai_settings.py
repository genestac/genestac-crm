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


@router.get("/eligible-leads-preview")
async def get_eligible_leads_preview(
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    """Preview how many leads currently match the auto-call filter settings."""
    try:
        import datetime as dt

        # Load current settings
        res = supabase.table("global_settings").select("settings_value").eq("settings_key", "ai_call_settings").execute()
        settings = res.data[0]["settings_value"] if res.data else {}

        enabled_statuses     = settings.get("enabled_statuses", [])
        filter_created_from  = settings.get("filter_created_from")
        filter_created_to    = settings.get("filter_created_to")
        filter_sources_raw   = settings.get("filter_sources", "")
        filter_sources       = [s.strip().lower() for s in filter_sources_raw.split(",") if s.strip()] if filter_sources_raw else []
        max_calls_per_lead   = int(settings.get("max_calls_per_lead") or 3)
        skip_not_interested  = settings.get("skip_not_interested", True)
        skip_consultation    = settings.get("skip_consultation_scheduled", True)

        if not enabled_statuses:
            return {
                "total_eligible": 0,
                "expected_calls_today": 0,
                "already_called_today": 0,
                "status_breakdown": [],
                "filter_active": False,
                "message": "No statuses selected — no leads will be auto-called."
            }

        today_str = dt.datetime.now().date().isoformat()

        def build_query(table: str, phone_col: str):
            q = supabase.table(table).select(f"id, {phone_col}, status, source, created_at").in_("status", enabled_statuses)
            if filter_created_from:
                q = q.gte("created_at", filter_created_from)
            if filter_created_to:
                q = q.lte("created_at", filter_created_to + "T23:59:59")
            if skip_not_interested:
                q = q.neq("status", "NOT_INTERESTED")
            if skip_consultation:
                q = q.neq("status", "CONSULTATION_SCHEDULED")
            return q.execute().data or []

        leads_raw   = build_query("leads", "phone_number")
        users_raw   = build_query("users", "phone")

        leads_ids = {l["id"] for l in leads_raw}
        all_records = [
            {"id": l["id"], "phone": l.get("phone_number"), "status": l.get("status"), "source": l.get("source", "")}
            for l in leads_raw if l.get("phone_number")
        ] + [
            {"id": u["id"], "phone": u.get("phone"), "status": u.get("status"), "source": u.get("source", "")}
            for u in users_raw if u.get("phone") and u["id"] not in leads_ids
        ]

        # Apply source filter
        if filter_sources:
            all_records = [r for r in all_records if any(fs in (r.get("source") or "").lower() for fs in filter_sources)]

        # Get all lead ids that have been called today
        today_called_res = supabase.table("ai_call_logs").select("lead_id").gte("created_at", today_str).execute()
        today_called_ids = {row["lead_id"] for row in (today_called_res.data or [])}

        # Get leads that have already hit max call limit
        all_ids = [r["id"] for r in all_records]
        max_reached_ids = set()
        if all_ids:
            # Batch count per lead
            logs_res = supabase.table("ai_call_logs").select("lead_id").in_("lead_id", all_ids).execute()
            from collections import Counter
            call_counts = Counter(row["lead_id"] for row in (logs_res.data or []))
            max_reached_ids = {lid for lid, cnt in call_counts.items() if cnt >= max_calls_per_lead}

        # Build final eligible list and breakdown
        status_counts: Dict[str, int] = {}
        eligible = []
        already_called_today = 0
        for r in all_records:
            if r["id"] in max_reached_ids:
                continue
            if r["id"] in today_called_ids:
                already_called_today += 1
                continue
            eligible.append(r)
            s = r.get("status") or "UNKNOWN"
            status_counts[s] = status_counts.get(s, 0) + 1

        status_breakdown = [{"status": k, "count": v} for k, v in sorted(status_counts.items())]

        return {
            "total_eligible": len(eligible),
            "expected_calls_today": len(eligible),
            "already_called_today": already_called_today,
            "max_calls_per_lead": max_calls_per_lead,
            "status_breakdown": status_breakdown,
            "filter_active": bool(filter_created_from or filter_created_to or filter_sources),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/call-logs")
async def get_all_call_logs(
    page: int = 1,
    limit: int = 50,
    status_filter: str = None,       # Filter by call status: completed, no-answer, failed, etc.
    crm_status: str = None,          # Filter by lead CRM status after call
    date_from: str = None,           # ISO date string e.g. 2026-07-01
    date_to: str = None,             # ISO date string e.g. 2026-07-31
    score_label: str = None,         # Hot, Warm, Cold
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    """Get all AI call logs across all leads for admin dashboard with pagination and filters."""
    try:
        start = (page - 1) * limit
        end = start + limit - 1

        query = (
            supabase.table("ai_call_logs")
            .select("*", count="exact")
            .order("created_at", desc=True)
        )

        # Apply filters
        if status_filter:
            query = query.eq("status", status_filter)
        if score_label:
            query = query.eq("score_label", score_label)
        if date_from:
            query = query.gte("created_at", date_from)
        if date_to:
            # Add one day to make it inclusive of the end date
            from datetime import datetime, timedelta
            try:
                dt_to = datetime.fromisoformat(date_to) + timedelta(days=1)
                query = query.lt("created_at", dt_to.isoformat())
            except Exception:
                query = query.lte("created_at", date_to)

        logs_res = query.range(start, end).execute()
        logs = logs_res.data or []
        total_count = logs_res.count if hasattr(logs_res, 'count') and logs_res.count is not None else len(logs)

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
                    lead_map[u["id"]] = {
                        "id": u["id"],
                        "name": u.get("name") or "Unknown",
                        "phone_number": u.get("phone"),
                        "crm_status": u.get("status")
                    }

        # Attach lead info to each log; apply crm_status filter post-join
        result_logs = []
        for log in logs:
            lead = lead_map.get(log.get("lead_id"), {})
            current_crm_status = lead.get("status") or lead.get("crm_status")
            log["leads"] = {
                "name": lead.get("name"),
                "phone": lead.get("phone_number"),
                "crm_status": current_crm_status
            }
            # Post-join filter on CRM status (can't do server-side easily across two tables)
            if crm_status and current_crm_status != crm_status:
                continue
            result_logs.append(log)

        return {"data": result_logs, "total": total_count}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/stats")
async def get_ai_call_stats(
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    """Get global statistics for AI call logs."""
    try:
        import datetime
        now = datetime.datetime.now()
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
        month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()

        # Total calls
        total_res = supabase.table("ai_call_logs").select("id", count="exact").execute()
        total_calls = total_res.count if hasattr(total_res, 'count') and total_res.count is not None else 0

        # Monthly calls
        monthly_res = supabase.table("ai_call_logs").select("id", count="exact").gte("created_at", month_start).execute()
        monthly_calls = monthly_res.count if hasattr(monthly_res, 'count') and monthly_res.count is not None else 0

        # Today's calls
        todays_res = supabase.table("ai_call_logs").select("id", count="exact").gte("created_at", today_start).execute()
        todays_calls = todays_res.count if hasattr(todays_res, 'count') and todays_res.count is not None else 0

        # Today's picked up (completed)
        picked_up_res = supabase.table("ai_call_logs").select("id", count="exact").gte("created_at", today_start).eq("status", "completed").execute()
        todays_picked_up = picked_up_res.count if hasattr(picked_up_res, 'count') and picked_up_res.count is not None else 0

        return {
            "total_calls": total_calls,
            "monthly_calls": monthly_calls,
            "todays_calls": todays_calls,
            "todays_picked_up": todays_picked_up
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/queue")
async def get_ai_call_queue(
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    """Get the AI call queue from global settings (limited to recent items)."""
    try:
        res = supabase.table("global_settings").select("settings_value").eq("settings_key", "ai_call_queue").execute()
        queue = []
        if res.data:
            queue = res.data[0]["settings_value"] or []

        # Show pending first (up to 50), then recent history (up to 50)
        pending_items = [q for q in queue if q.get("status") == "pending"][-50:]
        history_items = [q for q in queue if q.get("status") != "pending"][-50:]
        display_queue = pending_items + history_items

        # Enrich with lead data
        if display_queue:
            lead_ids = list({item["lead_id"] for item in display_queue if "lead_id" in item})
            if lead_ids:
                leads_res = supabase.table("leads").select("id, name, phone_number, status").in_("id", lead_ids).execute()
                users_res = supabase.table("users").select("id, name, phone, status").in_("id", lead_ids).execute()

                lead_map = {l["id"]: l for l in (leads_res.data or [])}
                for u in (users_res.data or []):
                    if u["id"] not in lead_map:
                        lead_map[u["id"]] = {"id": u["id"], "name": u.get("name") or "Unknown", "phone_number": u.get("phone"), "status": u.get("status")}

                for item in display_queue:
                    lead = lead_map.get(item.get("lead_id"), {})
                    item["leads"] = {
                        "name": lead.get("name"),
                        "phone": lead.get("phone_number"),
                        "crm_status": lead.get("status")
                    }

        return {"data": display_queue, "total": len(queue), "pending_count": len([q for q in queue if q.get("status") == "pending"])}
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

@router.delete("/queue")
async def clear_ai_call_queue(
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    """Clear the entire AI call queue."""
    try:
        supabase.table("global_settings").upsert({
            "settings_key": "ai_call_queue",
            "settings_value": []
        }, on_conflict="settings_key").execute()
        return {"success": True, "message": "Call queue cleared successfully."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/queue/build-from-filters")
async def build_queue_from_filters(
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    """Build a new call queue from the current trigger/filter settings."""
    try:
        import uuid
        import datetime as dt
        from collections import Counter

        # Load settings
        res = supabase.table("global_settings").select("settings_value").eq("settings_key", "ai_call_settings").execute()
        settings = res.data[0]["settings_value"] if res.data else {}

        enabled_statuses    = settings.get("enabled_statuses", [])
        filter_created_from = settings.get("filter_created_from")
        filter_created_to   = settings.get("filter_created_to")
        filter_sources_raw  = settings.get("filter_sources", "")
        filter_sources      = [s.strip().lower() for s in filter_sources_raw.split(",") if s.strip()] if filter_sources_raw else []
        max_calls_per_lead  = int(settings.get("max_calls_per_lead") or 3)
        skip_not_interested = settings.get("skip_not_interested", True)
        skip_consultation   = settings.get("skip_consultation_scheduled", True)

        if not enabled_statuses:
            return {"success": False, "message": "No lead statuses selected in Trigger & Scheduling settings. Please configure and save settings first."}

        def build_query(table: str, phone_col: str):
            q = supabase.table(table).select(f"id, {phone_col}, status, source, created_at").in_("status", enabled_statuses)
            if filter_created_from:
                q = q.gte("created_at", filter_created_from)
            if filter_created_to:
                q = q.lte("created_at", filter_created_to + "T23:59:59")
            if skip_not_interested:
                q = q.neq("status", "NOT_INTERESTED")
            if skip_consultation:
                q = q.neq("status", "CONSULTATION_SCHEDULED")
            return q.execute().data or []

        leads_raw = build_query("leads", "phone_number")
        users_raw = build_query("users", "phone")

        leads_ids = {l["id"] for l in leads_raw}
        all_records = [
            {"id": l["id"], "phone": l.get("phone_number"), "status": l.get("status"), "source": l.get("source", "")}
            for l in leads_raw if l.get("phone_number")
        ] + [
            {"id": u["id"], "phone": u.get("phone"), "status": u.get("status"), "source": u.get("source", "")}
            for u in users_raw if u.get("phone") and u["id"] not in leads_ids
        ]

        if filter_sources:
            all_records = [r for r in all_records if any(fs in (r.get("source") or "").lower() for fs in filter_sources)]

        # Exclude leads that already hit max call limit
        all_ids = [r["id"] for r in all_records]
        max_reached_ids = set()
        if all_ids:
            logs_res = supabase.table("ai_call_logs").select("lead_id").in_("lead_id", all_ids).execute()
            call_counts = Counter(row["lead_id"] for row in (logs_res.data or []))
            max_reached_ids = {lid for lid, cnt in call_counts.items() if cnt >= max_calls_per_lead}

        eligible = [r for r in all_records if r["id"] not in max_reached_ids]

        if not eligible:
            return {"success": False, "message": "No eligible leads found matching your current filters."}

        now_iso = dt.datetime.now().isoformat()
        new_queue = [
            {
                "id": str(uuid.uuid4()),
                "lead_id": r["id"],
                "status": "pending",
                "created_at": now_iso
            }
            for r in eligible
        ]

        supabase.table("global_settings").upsert({
            "settings_key": "ai_call_queue",
            "settings_value": new_queue
        }, on_conflict="settings_key").execute()

        return {
            "success": True,
            "message": f"Queue built with {len(new_queue)} leads matching your filters.",
            "count": len(new_queue)
        }
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
            # Mark as bot_called (keep in queue for status tracking)
            queue[pending_idx]["status"] = "bot_called"
            queue[pending_idx]["call_log_id"] = call_log_id
            queue[pending_idx]["call_sid"] = call_sid
            queue[pending_idx]["called_at"] = __import__('datetime').datetime.utcnow().isoformat()
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
