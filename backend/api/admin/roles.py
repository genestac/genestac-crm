from fastapi import APIRouter, Depends, HTTPException, Form
from supabase import Client
from db.supabase import get_supabase_client
from api.deps import get_current_user
from typing import Optional

router = APIRouter()

def verify_master_admin(current_user: dict, supabase: Client):
    profile_response = supabase.table("staffs").select("roles(name)").eq("id", current_user["id"]).single().execute()
    profile = profile_response.data
    
    role_name = profile.get("roles", {}).get("name") if profile.get("roles") else None
    if role_name not in ["master_admin", "superadmin"]:
        raise HTTPException(status_code=403, detail="Unauthorized. Master Admin access required.")

@router.get("/")
async def list_roles(
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    res = supabase.table("roles").select("*").order("name").execute()
    
    # We also need currentUserProfile to determine if user is master_admin for UI rendering
    profile = supabase.table("staffs").select("roles(name)").eq("id", current_user["id"]).single().execute()
    
    return {"roles": res.data, "currentUserProfile": profile.data}

@router.get("/{role_id}")
async def get_role_details(
    role_id: str,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    role_res = supabase.table("roles").select("*").eq("id", role_id).single().execute()
    perms_res = supabase.table("permissions").select("*").order("action").execute()
    role_perms_res = supabase.table("role_permissions").select("*").eq("role_id", role_id).execute()
    profile = supabase.table("staffs").select("roles(name)").eq("id", current_user["id"]).single().execute()
    
    return {
        "role": role_res.data,
        "permissions": perms_res.data,
        "role_permissions": role_perms_res.data,
        "currentUserProfile": profile.data
    }

@router.post("/")
async def create_role(
    name: str = Form(...),
    description: str = Form(""),
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    verify_master_admin(current_user, supabase)
    
    import re
    formatted_name = re.sub(r'[^a-z0-9]+', '_', name.lower())
    
    response = supabase.table("roles").insert({"name": formatted_name, "description": description}).execute()
    return {"success": True, "message": "Role created successfully"}


@router.post("/permissions/toggle")
async def toggle_permission(
    role_id: str = Form(...),
    permission_id: str = Form(...),
    is_granted: bool = Form(...),
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    verify_master_admin(current_user, supabase)
    
    if is_granted:
        response = supabase.table("role_permissions").insert({"role_id": role_id, "permission_id": permission_id}).execute()
    else:
        response = supabase.table("role_permissions").delete().eq("role_id", role_id).eq("permission_id", permission_id).execute()
        
    return {"success": True, "message": "Permission updated successfully"}

@router.post("/modules")
async def create_module(
    module_name: str = Form(...),
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    verify_master_admin(current_user, supabase)
    
    if not module_name:
        raise HTTPException(status_code=400, detail="Module name is required")
        
    permissions_to_insert = [
        {"action": f"{module_name}:create", "module": module_name, "description": f"Create {module_name}"},
        {"action": f"{module_name}:read", "module": module_name, "description": f"View {module_name}"},
        {"action": f"{module_name}:update", "module": module_name, "description": f"Update {module_name}"},
        {"action": f"{module_name}:delete", "module": module_name, "description": f"Delete {module_name}"},
    ]
    
    response = supabase.table("permissions").insert(permissions_to_insert).execute()
    
    return {"success": True, "message": f"Module {module_name} and permissions created"}
