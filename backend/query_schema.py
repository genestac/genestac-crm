import os
import asyncio
from supabase import create_client

url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
if not url or not key:
    from dotenv import load_dotenv
    load_dotenv('.env')
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

supabase = create_client(url, key)

res = supabase.table('cart').select('*').limit(1).execute()
print(res)
