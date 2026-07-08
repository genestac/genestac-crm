import os
from supabase import create_client

url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_KEY")
client = create_client(url, key)

try:
    print("Testing users...")
    client.table("users").select("id", count="exact").limit(1).execute()
    print("Testing leads...")
    client.table("leads").select("id", count="exact").limit(1).execute()
    print("Testing staffs...")
    client.table("staffs").select("id", count="exact").eq("is_active", True).limit(1).execute()
    print("Testing orders...")
    client.table("orders").select("total_amount").limit(1).execute()
    print("Testing proforma_invoices...")
    client.table("proforma_invoices").select("id").limit(1).execute()
    print("ALL SUCCESS")
except Exception as e:
    import traceback
    traceback.print_exc()
