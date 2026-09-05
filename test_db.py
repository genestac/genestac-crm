import os
import asyncio
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv(os.path.join(os.path.dirname(__file__), "backend", ".env"))
supabase: Client = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])

def test():
    # check inventory
    res = supabase.table("inventory").select("*").ilike("name", "%Mounjaro%").execute()
    print("INVENTORY:", res.data)
    
    # check variants
    res2 = supabase.table("inventory_variants").select("*").ilike("inventory_id", res.data[0]['id']).execute()
    print("VARIANTS:", res2.data)

test()
