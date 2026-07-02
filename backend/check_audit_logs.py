import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()
url = os.getenv("SUPABASE_URL")
key = os.getenv("SUPABASE_KEY")
supabase = create_client(url, key)

try:
    res = supabase.table("audit_logs").select("*, staffs(id, full_name)").limit(2).execute()
    print("Success:", res.data)
except Exception as e:
    print("Error:", e)
