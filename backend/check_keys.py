import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()
url = os.getenv("SUPABASE_URL")
key = os.getenv("SUPABASE_KEY")

supabase = create_client(url, key)

res = supabase.table("staffs").select("*").limit(1).execute()
if res.data:
    print(res.data[0].keys())
else:
    print("No data")
