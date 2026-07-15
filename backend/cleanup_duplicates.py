import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()
url = os.getenv("SUPABASE_URL")
key = os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("SUPABASE_KEY")
supabase = create_client(url, key)

print("Fetching all users and leads...")
users_res = supabase.table("users").select("id, email, phone, created_at").execute()
leads_res = supabase.table("leads").select("id, email, phone_number, created_at").execute()

users = users_res.data or []
leads = leads_res.data or []

for u in users:
    u["record_type"] = "users"
for l in leads:
    l["record_type"] = "leads"
    l["phone"] = l.pop("phone_number", None)

combined = users + leads
# Sort by created_at desc so we keep the newest record
combined.sort(key=lambda x: x.get("created_at") or "", reverse=True)

seen_identifiers = set()
to_delete = []

for item in combined:
    phone_val = str(item.get("phone") or "")
    email_val = str(item.get("email") or "").lower().strip()
    
    clean_phone = "".join(filter(str.isdigit, phone_val))[-10:] if phone_val else ""
    identifier = clean_phone if clean_phone else email_val
    
    if identifier:
        if identifier in seen_identifiers:
            to_delete.append(item)
            continue
        seen_identifiers.add(identifier)

print(f"Found {len(to_delete)} duplicates out of {len(combined)} total records.")

deleted_users = 0
deleted_leads = 0

for item in to_delete:
    try:
        if item["record_type"] == "users":
            supabase.table("users").delete().eq("id", item["id"]).execute()
            deleted_users += 1
        else:
            supabase.table("leads").delete().eq("id", item["id"]).execute()
            deleted_leads += 1
    except Exception as e:
        print(f"Failed to delete {item['id']}: {e}")

print(f"Cleanup complete! Deleted {deleted_users} from users and {deleted_leads} from leads.")
