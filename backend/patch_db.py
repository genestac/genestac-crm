import os
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()

url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_KEY")
supabase = create_client(url, key)

res = supabase.table("global_settings").select("*").eq("settings_key", "lead_statuses").execute()
if res.data:
    statuses = res.data[0]["settings_value"]
    has_contacted = any(s["value"] == "CONTACTED" for s in statuses)
    if not has_contacted:
        idx = next((i for i, s in enumerate(statuses) if s["value"] == "CONTACT_ATTEMPTED"), -1)
        if idx != -1:
            statuses.insert(idx + 1, {"value": "CONTACTED", "label": "Contacted"})
        else:
            statuses.append({"value": "CONTACTED", "label": "Contacted"})
        supabase.table("global_settings").update({"settings_value": statuses}).eq("settings_key", "lead_statuses").execute()
        print("Patched DB")
    else:
        print("Already has CONTACTED")
else:
    print("No DB entry, using defaults")
