"""
Backfill Sarvam recording URLs by fetching call records from the Sarvam Outbound API.

The Sarvam post-call webhook does NOT include recording_url in its payload.
This script fetches all outbound calls from Sarvam's API, extracts the recording_url,
and updates the matching ai_call_logs row by lead_id + timestamp proximity.

Run inside Docker:
    docker exec backend-api-1 python scripts/backfill_sarvam_recordings.py
"""

import os
import sys
import json
import urllib.request as ur
import urllib.error as ue
from datetime import datetime, timedelta, timezone

# ── Env loader ─────────────────────────────────────────────────────────────────
def _load_env():
    env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env")
    env = {}
    if os.path.exists(env_path):
        with open(env_path) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, _, v = line.partition("=")
                    env[k.strip()] = v.strip().strip('"').strip("'")
    return env

ENV = _load_env()

SUPABASE_URL = ENV.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = ENV.get("SUPABASE_KEY", "")
SARVAM_API_KEY = ENV.get("SARVAM_API_KEY", "")
SARVAM_ORG_ID = ENV.get("SARVAM_ORG_ID", "")
SARVAM_WORKSPACE_ID = ENV.get("SARVAM_WORKSPACE_ID", "")

if not all([SUPABASE_URL, SUPABASE_KEY, SARVAM_API_KEY, SARVAM_ORG_ID, SARVAM_WORKSPACE_ID]):
    print("ERROR: Missing env vars. Check .env for SUPABASE_URL/KEY and SARVAM_* vars.")
    sys.exit(1)

SB_HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation",
}


# ── Supabase helpers ──────────────────────────────────────────────────────────
def sb_get(table, params=None):
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    qs = "&".join(f"{k}={v}" for k, v in (params or {}).items())
    if qs:
        url += "?" + qs
    req = ur.Request(url, headers=SB_HEADERS)
    with ur.urlopen(req, timeout=15) as r:
        return json.loads(r.read())


def sb_patch(table, row_id, data):
    url = f"{SUPABASE_URL}/rest/v1/{table}?id=eq.{row_id}"
    req = ur.Request(url, data=json.dumps(data).encode(), headers=SB_HEADERS, method="PATCH")
    with ur.urlopen(req, timeout=15) as r:
        return json.loads(r.read())


# ── Sarvam API helpers ────────────────────────────────────────────────────────
def sarvam_get(path, params=None):
    base = f"https://apps.sarvam.ai/api/outbounds/v1/orgs/{SARVAM_ORG_ID}/workspaces/{SARVAM_WORKSPACE_ID}"
    url = base + path
    if params:
        qs = "&".join(f"{k}={v}" for k, v in params.items())
        url += "?" + qs
    req = ur.Request(url, headers={"X-API-Key": SARVAM_API_KEY, "Content-Type": "application/json"})
    try:
        with ur.urlopen(req, timeout=20) as r:
            return json.loads(r.read())
    except ue.HTTPError as e:
        print(f"  Sarvam API error {e.code}: {e.read().decode()}")
        return None
    except Exception as e:
        print(f"  Sarvam API error: {e}")
        return None


def fetch_all_sarvam_calls():
    """Fetch all outbound call records from Sarvam API with pagination."""
    all_calls = []
    page = 1
    page_size = 100
    while True:
        print(f"  Fetching Sarvam calls page {page}...")
        result = sarvam_get("/outbounds", {"page": page, "page_size": page_size})
        if not result:
            break
        # Handle different response shapes from Sarvam API
        calls = (
            result.get("outbounds")
            or result.get("calls")
            or result.get("data")
            or (result if isinstance(result, list) else [])
        )
        if not calls:
            print(f"  No more calls on page {page}. Keys in response: {list(result.keys()) if isinstance(result, dict) else 'list'}")
            # Show sample of first response so we know the shape
            if page == 1:
                print(f"  Full response sample: {json.dumps(result)[:500]}")
            break
        all_calls.extend(calls)
        print(f"  Got {len(calls)} calls (total so far: {len(all_calls)})")
        if len(calls) < page_size:
            break
        page += 1
    return all_calls


def main():
    print("=== Sarvam Recording URL Backfill ===\n")

    # ── Step 1: Fetch rows that need recording_url ─────────────────────────────
    print("[Step 1] Fetching ai_call_logs rows missing recording_url...")
    rows = sb_get("ai_call_logs", {
        "transcript": "not.is.null",
        "lead_id": "not.is.null",
        "recording_url": "is.null",
        "order": "created_at.asc",
        "limit": "10000"
    })
    print(f"  Found {len(rows)} rows with transcript but no recording_url")

    if not rows:
        print("\n✅ Nothing to backfill — all transcript rows already have recording_url!")
        return

    # ── Step 2: Fetch all calls from Sarvam API ────────────────────────────────
    print("\n[Step 2] Fetching outbound call history from Sarvam API...")
    sarvam_calls = fetch_all_sarvam_calls()
    print(f"  Total Sarvam calls fetched: {len(sarvam_calls)}")

    if not sarvam_calls:
        print("\n⚠️  Sarvam API returned no calls. Possible reasons:")
        print("    1. Recording is not enabled in your Sarvam dashboard")
        print("    2. The API endpoint/format may have changed")
        print("    3. API key doesn't have permission to list calls")
        print("\n📋 What you can do:")
        print("    → Log in to https://console.sarvam.ai → Calls → Export CSV")
        print("    → Each call should have a recording_url — share that CSV and we can import it")
        return

    # ── Step 3: Match Sarvam calls to DB rows by lead_id and timestamp ─────────
    print(f"\n[Step 3] Matching {len(sarvam_calls)} Sarvam calls to {len(rows)} DB rows...")

    # Build an index of Sarvam calls that have recording_url
    sarvam_with_recording = []
    for call in sarvam_calls:
        rec_url = (
            call.get("recording_url")
            or call.get("recording")
            or call.get("media_url")
            or call.get("audio_url")
        )
        lead_id = (
            (call.get("metadata") or {}).get("lead_id")
            or (call.get("agent_variables") or {}).get("lead_id")
            or (call.get("custom_data") or {}).get("lead_id")
            or call.get("lead_id")
        )
        created = call.get("created_at") or call.get("started_at") or call.get("timestamp")
        if rec_url:
            sarvam_with_recording.append({
                "lead_id": lead_id,
                "recording_url": rec_url,
                "created_at": created,
                "call_id": call.get("id") or call.get("call_id"),
            })

    print(f"  Sarvam calls with recording_url: {len(sarvam_with_recording)}")

    if not sarvam_with_recording:
        print("\n⚠️  None of the Sarvam calls have a recording_url field.")
        print("    Recording may not be enabled. Check Sarvam dashboard → Agent → Settings → Enable Recording")
        return

    # Match by lead_id first, then by timestamp proximity
    updated = 0
    unmatched_db = []
    used_sarvam_ids = set()

    for db_row in rows:
        db_lead_id = db_row.get("lead_id")
        try:
            db_time = datetime.fromisoformat((db_row.get("created_at") or "").replace("Z", "+00:00"))
        except Exception:
            db_time = None

        best_match = None
        best_delta = timedelta(hours=6)

        for s in sarvam_with_recording:
            if s["call_id"] in used_sarvam_ids:
                continue
            # Lead ID match (strongest signal)
            if db_lead_id and s.get("lead_id") == db_lead_id:
                # Also check timestamp if available
                if db_time and s.get("created_at"):
                    try:
                        s_time = datetime.fromisoformat(s["created_at"].replace("Z", "+00:00"))
                        delta = abs(db_time - s_time)
                    except Exception:
                        delta = timedelta(0)
                else:
                    delta = timedelta(0)
                if delta < best_delta:
                    best_delta = delta
                    best_match = s
            # Fallback: timestamp-only match (for rows without lead_id in Sarvam)
            elif not s.get("lead_id") and db_time and s.get("created_at"):
                try:
                    s_time = datetime.fromisoformat(s["created_at"].replace("Z", "+00:00"))
                    delta = abs(db_time - s_time)
                    if delta < best_delta:
                        best_delta = delta
                        best_match = s
                except Exception:
                    pass

        if best_match:
            sb_patch("ai_call_logs", db_row["id"], {
                "recording_url": best_match["recording_url"],
                "status": "completed",
            })
            used_sarvam_ids.add(best_match["call_id"])
            updated += 1
            print(f"  ✔ Updated row {db_row['id'][:8]}... lead={db_lead_id or '?'[:8]} | url={best_match['recording_url'][:60]}...")
        else:
            unmatched_db.append(db_row)

    # ── Summary ────────────────────────────────────────────────────────────────
    print(f"\n=== Results ===")
    print(f"  ✅ Updated:    {updated} rows with recording_url from Sarvam")
    print(f"  ⚠️  Unmatched: {len(unmatched_db)} rows (no Sarvam call found)")
    if unmatched_db:
        print(f"     These calls may not have been recorded (missed/too short).")
    print(f"\n✅ Done! Refresh the AI Voice Calling panel to see recordings.")


if __name__ == "__main__":
    main()
