import os
import sys
import json
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()
url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_KEY")
supabase: Client = create_client(url, key)

def main():
    print("Fetching all users...")
    res = supabase.table("users").select("*").execute()
    users = res.data or []
    
    # Get a valid author (admin/staff)
    staff_res = supabase.table("staffs").select("id").limit(1).execute()
    system_author_id = staff_res.data[0]["id"] if staff_res.data else None

    
    # Group users by email, or phone if email is missing
    groups = {}
    for u in users:
        # Normalize keys
        email = (u.get("email") or "").strip().lower()
        phone = (u.get("phone") or "").strip().lower()
        
        # Determine grouping key
        if email:
            key = f"email:{email}"
        elif phone:
            key = f"phone:{phone}"
        else:
            continue
            
        if key not in groups:
            groups[key] = []
        groups[key].append(u)
        
    for key, group in groups.items():
        if len(group) > 1:
            print(f"Found {len(group)} users for {key}")
            # Sort by created_at so the oldest is the master
            group.sort(key=lambda x: x.get("created_at") or "")
            master = group[0]
            duplicates = group[1:]
            
            for dup in duplicates:
                print(f"  Merging duplicate {dup['id']} into master {master['id']}")
                
                # 1. Save duplicate data as a note in master
                details_str = json.dumps(dup, indent=2)
                note_content = f"**Merged Duplicate Record**\n\nA duplicate record was merged into this master record. Previous details:\n```json\n{details_str}\n```"
                supabase.table("user_notes").insert({
                    "user_id": master["id"],
                    "author_id": system_author_id, 
                    "content": note_content
                }).execute()
                
                # 2. Re-link related tables
                # user_notes (where user_id = dup['id'])
                supabase.table("user_notes").update({"user_id": master["id"]}).eq("user_id", dup["id"]).execute()
                
                # user_documents
                supabase.table("user_documents").update({"user_id": master["id"]}).eq("user_id", dup["id"]).execute()
                
                # appointments
                supabase.table("appointments").update({"patient_id": master["id"]}).eq("patient_id", dup["id"]).execute()
                
                # orders
                supabase.table("orders").update({"user_id": master["id"]}).eq("user_id", dup["id"]).execute()
                
                # cart
                supabase.table("cart").update({"user_id": master["id"]}).eq("user_id", dup["id"]).execute()
                
                # 3. Delete the duplicate
                try:
                    supabase.table("users").delete().eq("id", dup["id"]).execute()
                    print(f"  Successfully deleted {dup['id']}")
                except Exception as e:
                    print(f"  Failed to delete {dup['id']}: {e}")

if __name__ == "__main__":
    main()
