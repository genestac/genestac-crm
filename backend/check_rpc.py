import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()
url = os.getenv("SUPABASE_URL")
key = os.getenv("SUPABASE_KEY")
supabase = create_client(url, key)

try:
    res = supabase.rpc("get_audit_logs_with_users").execute()
    print("Success:", res.data)
except Exception as e:
    print("Error:", e)
