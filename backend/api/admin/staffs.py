from fastapi import APIRouter, Depends, HTTPException, Form
from supabase import Client
from db.supabase import get_supabase_client
from api.deps import get_current_user

router = APIRouter()

@router.get("/")
async def list_staffs(
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    # Fetch ALL staff profiles regardless of role — no whitelist so custom roles are included
    res = supabase.table("staffs").select(
        "id, full_name, email, phone, address, city, state, pincode, date_of_birth, gender, avatar_url, is_active, roles(name), created_at"
    ).order("created_at", desc=True).execute()
    # Fetch all roles
    roles_res = supabase.table("roles").select("id, name").order("name").execute()

    return {"profiles": res.data, "roles": roles_res.data}

@router.get("/me")
async def get_me(
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    currentUserProfile = {"roles": current_user.get("roles")}
    return {"data": currentUserProfile}

@router.post("/")
async def admin_create_user(
    email: str = Form(...),
    password: str = Form(...),
    full_name: str = Form(...),
    role_id: str = Form(...),
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    # Verify current user is master_admin
    role_name = current_user.get("role")
    if role_name not in ["master_admin", "superadmin"]:
        raise HTTPException(status_code=403, detail="Unauthorized. Master Admin access required.")
        
    # Create user in auth
    try:
        user_response = supabase.auth.admin.create_user({
            "email": email,
            "password": password,
            "email_confirm": True,
            "user_metadata": {"full_name": full_name}
        })
        
        # Note: In the frontend, there was a 1s delay for a trigger to create the staff record.
        # We assume the trigger still works. We might just need to update the role_id.
        import time
        time.sleep(1)
        
        new_user_id = user_response.user.id
        
        role_update = supabase.table("staffs").update({"role_id": role_id}).eq("id", new_user_id).execute()
        if not role_update.data:
            # Fallback if the database trigger is missing from migration
            supabase.table("staffs").insert({
                "id": new_user_id,
                "email": email,
                "full_name": full_name,
                "role_id": role_id
            }).execute()
        
        return {"success": True, "message": "Staff created successfully"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.put("/{user_id}/role")
async def update_user_role(
    user_id: str,
    new_role: str = Form(...),
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    profile_response = supabase.table("staffs").select("roles(name)").eq("id", current_user["id"]).single().execute()
    profile = profile_response.data
    
    role_name = profile.get("roles", {}).get("name") if profile.get("roles") else None
    is_master_admin = role_name in ["master_admin", "superadmin"]
    is_admin = role_name == "admin"
    
    if not is_master_admin and not is_admin:
        raise HTTPException(status_code=403, detail="Unauthorized")
        
    if (new_role == "admin" or new_role == "master_admin" or new_role == "superadmin") and not is_master_admin:
        raise HTTPException(status_code=403, detail="Only Master Admins can assign Admin roles")
        
    # Lookup role ID
    role_data = supabase.table("roles").select("id").eq("name", new_role).single().execute()
    if not role_data.data:
        raise HTTPException(status_code=400, detail="Invalid role specified")
        
    role_id = role_data.data["id"]
    
    # Update target user role
    supabase.table("staffs").update({"role_id": role_id}).eq("id", user_id).execute()
    
    return {"success": True, "message": "Role updated successfully"}

@router.put("/{user_id}/details")
async def update_staff_details(
    user_id: str,
    full_name: str = Form(...),
    email: str = Form(...),
    phone: str = Form(None),
    address: str = Form(None),
    city: str = Form(None),
    state: str = Form(None),
    pincode: str = Form(None),
    date_of_birth: str = Form(None),
    gender: str = Form(None),
    password: str = Form(None),
    is_active: str = Form(None),
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    profile_response = supabase.table("staffs").select("roles(name)").eq("id", current_user["id"]).single().execute()
    profile = profile_response.data
    
    role_name = profile.get("roles", {}).get("name") if profile.get("roles") else None
    is_master_admin = role_name in ["master_admin", "superadmin"]
    is_admin = role_name == "admin"
    
    if not is_master_admin and not is_admin:
        raise HTTPException(status_code=403, detail="Unauthorized")

    try:
        # Update auth user if email, full_name, password or is_active changed
        update_data = {}
        if email:
            update_data["email"] = email
        if full_name:
            update_data["user_metadata"] = {"full_name": full_name}
        if password:
            update_data["password"] = password
            
        if is_active is not None:
            if str(is_active).lower() == "false":
                update_data["ban_duration"] = "87600h"  # Effectively ban user
            else:
                update_data["ban_duration"] = "none"  # Lift ban
                
        if update_data:
            # Requires service role key to use admin api
            supabase.auth.admin.update_user_by_id(user_id, update_data)
            
    except Exception as e:
        # Auth update might fail if email exists, etc.
        raise HTTPException(status_code=400, detail=f"Failed to update auth user: {str(e)}")

    # Update staffs table
    staff_update = {
        "full_name": full_name,
        "email": email,
        "phone": phone,
        "address": address,
        "city": city,
        "state": state,
        "pincode": pincode,
        "date_of_birth": date_of_birth if date_of_birth else None,
        "gender": gender,
    }
    
    if is_active is not None:
        staff_update["is_active"] = str(is_active).lower() == "true"
    
    # Remove None values
    staff_update = {k: v for k, v in staff_update.items() if v is not None}
    
    supabase.table("staffs").update(staff_update).eq("id", user_id).execute()
    
    return {"success": True, "message": "Staff details updated successfully"}
