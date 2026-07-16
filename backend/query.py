import os
from supabase import create_client

url = os.environ.get("VITE_SUPABASE_URL") or os.environ.get("SUPABASE_URL")
key = os.environ.get("VITE_SUPABASE_ANON_KEY") or os.environ.get("SUPABASE_KEY")
supabase = create_client(url, key)

res = supabase.table('user_sources').select('*').execute()
print(res.data)
