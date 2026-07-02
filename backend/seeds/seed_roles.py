import os
from supabase import create_client, Client

url = "https://goxtfatewlmakqoohnrx.supabase.co"
key = "sb_secret_wky2UpIczUKLK2rl0kp8mQ_zZEnBGWD"
supabase: Client = create_client(url, key)

roles = [
    "superadmin",
    "master_admin",
    "admin",
    "doctor",
    "sales",
    "manager",
    "support"
]

for role in roles:
    res = supabase.table("roles").select("id").eq("name", role).execute()
    if not res.data:
        print(f"Creating role: {role}")
        supabase.table("roles").insert({"name": role}).execute()
    else:
        print(f"Role already exists: {role}")

print("Seeding complete.")
