import asyncio
from db.supabase import get_supabase_client
supabase = get_supabase_client()
res = supabase.table('communications').select('*').limit(1).execute()
print(res.data)
