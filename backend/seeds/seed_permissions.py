import os
import sys

# Add parent directory to path so we can import from core (if needed)
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from supabase import create_client, Client

url = "https://goxtfatewlmakqoohnrx.supabase.co"
key = "sb_secret_wky2UpIczUKLK2rl0kp8mQ_zZEnBGWD"
supabase: Client = create_client(url, key)

modules = [
    "Staffs",
    "Roles",
    "Inventory",
    "Logistics",
    "Doctors",
    "Analytics",
    "Coupons",
    "Logs",
    "Lead Assignment",
    "CRM Settings",
    "Custom Fields",
    "Sales",
    "Patients",
    "Appointments",
    "Prescriptions"
]

actions = ["create", "read", "update", "delete"]

print("Seeding permissions...")
for module in modules:
    for action in actions:
        action_name = f"{module}:{action}"
        
        # Check if permission exists
        res = supabase.table("permissions").select("id").eq("action", action_name).execute()
        
        if not res.data:
            print(f"Creating permission: {action_name}")
            supabase.table("permissions").insert({
                "action": action_name,
                "description": f"Can {action} {module}",
                "module": module
            }).execute()

print("Permissions seeded.")

print("Assigning all permissions to master admins...")
# Fetch roles
roles_to_grant = ["superadmin", "master_admin", "admin"]
role_ids = []
for r in roles_to_grant:
    res = supabase.table("roles").select("id").eq("name", r).execute()
    if res.data:
        role_ids.append(res.data[0]["id"])

# Fetch all permissions
perms_res = supabase.table("permissions").select("id").execute()
perm_ids = [p["id"] for p in perms_res.data]

# Assign all permissions to these roles
for role_id in role_ids:
    # First, fetch existing role_permissions to avoid duplicates
    existing_rp = supabase.table("role_permissions").select("permission_id").eq("role_id", role_id).execute()
    existing_perm_ids = {rp["permission_id"] for rp in existing_rp.data}
    
    inserts = []
    for p_id in perm_ids:
        if p_id not in existing_perm_ids:
            inserts.append({
                "role_id": role_id,
                "permission_id": p_id
            })
            
    if inserts:
        # Supabase insert accepts a list of dicts for bulk insert
        print(f"Assigning {len(inserts)} permissions to role {role_id}...")
        supabase.table("role_permissions").insert(inserts).execute()

print("Seeding complete!")
