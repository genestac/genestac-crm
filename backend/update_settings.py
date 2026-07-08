from db.supabase import get_supabase_client
import json

supabase = get_supabase_client()

# Fetch existing settings to preserve other keys if any
res = supabase.table("global_settings").select("*").eq("settings_key", "ai_call_settings").execute()
existing_data = res.data[0]["settings_value"] if res.data else {}

settings_data = {
    **existing_data,
    "exotel_caller_id": "+9101141189316"
}

supabase.table("global_settings").upsert({
    "settings_key": "ai_call_settings",
    "settings_value": settings_data
}).execute()
print("Updated successfully!")
