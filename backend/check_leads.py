import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()
url = os.getenv("SUPABASE_URL")
key = os.getenv("SUPABASE_KEY")
supabase = create_client(url, key)

try:
    l_res = supabase.table("leads").select("id, name, email, phone, status, created_at").is_("assigned_sales_rep_id", "null").execute()
    print("Success:", len(l_res.data), "records")
except Exception as e:
    print("Error:", e)
