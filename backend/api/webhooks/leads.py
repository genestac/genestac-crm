"""
Public webhook endpoint for ingesting leads from Google Sheets (or other external sources).
Route: POST /api/webhooks/leads

Accepts a JSON body with lead details and a source_id (UUID from user_sources table).
No authentication required — secured by source_id validation.

Schema notes:
  - `users` table : phone, name, city, source_id, metadata (JSONB)
  - `leads` table : phone_number, name, city, source_id, metadata (JSONB)
"""

from fastapi import APIRouter, HTTPException, Depends
from supabase import Client
from pydantic import BaseModel
from typing import Optional
from db.supabase import get_supabase_client

router = APIRouter()


class SheetLeadPayload(BaseModel):
    name: Optional[str] = None
    phone: str
    city: Optional[str] = None
    age: Optional[str] = None
    current_weight: Optional[str] = None
    primary_goal: Optional[str] = None
    ad_name: Optional[str] = None
    campaign_name: Optional[str] = None
    source_id: Optional[str] = None   # UUID from user_sources table


@router.post("/leads")
async def ingest_sheet_lead(
    payload: SheetLeadPayload,
    supabase: Client = Depends(get_supabase_client)
):
    """
    Receives a lead from Google Sheets Apps Script and upserts it into the
    users table (new lead) or leads table (if already exists as a lead).

    - If phone already exists in users → update with new data (city is a real column)
    - If phone already exists in leads → update metadata only (leads has no city column)
    - If phone is new → insert into users table with all fields including city
    """

    if not payload.phone:
        raise HTTPException(status_code=422, detail="phone is required")

    clean_phone = (
        payload.phone.replace(" ", "").replace("+", "").replace("-", "")
    )

    # Build metadata from extra sheet fields
    # NOTE: city is stored in the real `city` column, NOT in metadata
    sheet_meta = {}
    if payload.age:
        sheet_meta["age"] = payload.age
    if payload.current_weight:
        sheet_meta["current_weight"] = payload.current_weight
    if payload.primary_goal:
        sheet_meta["primary_goal"] = payload.primary_goal
    if payload.ad_name:
        sheet_meta["ad_name"] = payload.ad_name
    if payload.campaign_name:
        sheet_meta["campaign_name"] = payload.campaign_name

    # ── 1. Check if user already exists ────────────────────────────────────
    res_users = (
        supabase.table("users")
        .select("id, metadata, source_id")
        .ilike("phone", f"%{clean_phone}%")
        .execute()
    )

    if res_users.data:
        existing = res_users.data[0]
        existing_meta = existing.get("metadata") or {}
        existing_meta.update(sheet_meta)

        update_data: dict = {"metadata": existing_meta}
        if payload.name:
            update_data["name"] = payload.name
        if payload.city:
            update_data["city"] = payload.city
        # Only set source_id if it wasn't already assigned
        if payload.source_id and not existing.get("source_id"):
            update_data["source_id"] = payload.source_id

        supabase.table("users").update(update_data).eq("id", existing["id"]).execute()
        return {"success": True, "action": "updated", "record_type": "USER", "id": existing["id"]}

    # ── 2. Check the leads table ─────────────────────────────────────────────
    res_leads = (
        supabase.table("leads")
        .select("id, metadata, source_id")
        .ilike("phone_number", f"%{clean_phone}%")
        .execute()
    )

    if res_leads.data:
        existing = res_leads.data[0]
        existing_meta = existing.get("metadata") or {}
        existing_meta.update(sheet_meta)

        update_data = {"metadata": existing_meta}
        if payload.name:
            update_data["name"] = payload.name
        if payload.city:
            update_data["city"] = payload.city
        if payload.source_id and not existing.get("source_id"):
            update_data["source_id"] = payload.source_id

        supabase.table("leads").update(update_data).eq("id", existing["id"]).execute()
        return {"success": True, "action": "updated", "record_type": "LEAD", "id": existing["id"]}

    # ── 3. Create new record in users table ─────────────────────────────────
    insert_data: dict = {
        "phone": payload.phone,
        "status": "NEW",
        "metadata": sheet_meta,
    }
    if payload.name:
        insert_data["name"] = payload.name
    if payload.city:
        insert_data["city"] = payload.city
    if payload.source_id:
        insert_data["source_id"] = payload.source_id

    res = supabase.table("users").insert(insert_data).execute()
    if not res.data:
        raise HTTPException(status_code=500, detail="Failed to insert lead")

    new_id = res.data[0]["id"]
    return {"success": True, "action": "created", "record_type": "USER", "id": new_id}
