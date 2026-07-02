import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()
url = os.getenv("SUPABASE_URL")
key = os.getenv("SUPABASE_KEY")
supabase = create_client(url, key)

try:
    res = supabase.table("plans").select("*").limit(1).execute()
    if res.data:
        print("Keys:", res.data[0].keys())
    else:
        print("No data in plans table to infer keys")
except Exception as e:
    print("Error:", e)
