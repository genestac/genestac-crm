"""
Public webhook endpoint for ingesting leads from Google Sheets (or other external sources).
Route: POST /api/webhooks/leads

All new leads are inserted into the `leads` table.
If the phone already exists in `leads`, we update it.
If it exists in `users` (a paid customer), we skip — don't overwrite customer records.

Schema:
  - `leads` table : phone_number, name, city, source_id, status, metadata (JSONB)
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
    Receives a lead from Google Sheets Apps Script and upserts into the leads table.

    Logic:
    1. Phone exists in leads → UPDATE leads record
    2. Phone exists in users (paying customer) → skip, return early (don't disturb)
    3. Phone not found anywhere → INSERT into leads table
    """

    if not payload.phone:
        raise HTTPException(status_code=422, detail="phone is required")

    clean_phone = (
        payload.phone.replace(" ", "").replace("+", "").replace("-", "")
    )

    # Build metadata from extra sheet fields
    # city is stored in metadata (no dedicated city column in leads table)
    sheet_meta = {}
    if payload.city:
        sheet_meta["city"] = payload.city
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

    # ── 1. Check the leads table first ───────────────────────────────────────
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

        update_data: dict = {"metadata": existing_meta}
        if payload.name:
            update_data["name"] = payload.name
        # Only set source_id if it wasn't already assigned
        if payload.source_id and not existing.get("source_id"):
            update_data["source_id"] = payload.source_id

        supabase.table("leads").update(update_data).eq("id", existing["id"]).execute()
        return {"success": True, "action": "updated", "record_type": "LEAD", "id": existing["id"]}

    # ── 2. Check users table — if they're a paying customer, skip ────────────
    res_users = (
        supabase.table("users")
        .select("id")
        .ilike("phone", f"%{clean_phone}%")
        .execute()
    )

    if res_users.data:
        # Phone belongs to an existing customer — don't create a duplicate lead
        return {
            "success": True,
            "action": "skipped",
            "record_type": "USER",
            "id": res_users.data[0]["id"],
            "reason": "Phone already exists as a customer in users table"
        }

    # ── 3. New phone — INSERT into leads table ────────────────────────────────
    insert_data: dict = {
        "phone_number": payload.phone,   # leads table uses phone_number, not phone
        "status": "NEW",
        "metadata": sheet_meta,
    }
    if payload.name:
        insert_data["name"] = payload.name
    if payload.source_id:
        insert_data["source_id"] = payload.source_id

    res = supabase.table("leads").insert(insert_data).execute()
    if not res.data:
        raise HTTPException(status_code=500, detail="Failed to insert lead")

    new_id = res.data[0]["id"]
    return {"success": True, "action": "created", "record_type": "LEAD", "id": new_id}
