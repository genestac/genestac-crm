from db.supabase import get_supabase_client
import sys

supabase = get_supabase_client()
res = supabase.table("global_settings").select("*").eq("settings_key", "ai_call_settings").execute()
if res.data:
    print(res.data[0])
else:
    print("No AI call settings found")
