from fastapi import APIRouter, Depends, HTTPException, Form, Response, status
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel
from supabase import Client
from db.supabase import get_supabase_client
from core.security import create_access_token
from datetime import timedelta
from core.config import settings
from api.deps import get_current_user

router = APIRouter()

@router.post("/login")
async def login_for_access_token(
    response: Response,
    form_data: OAuth2PasswordRequestForm = Depends(),
    supabase: Client = Depends(get_supabase_client)
):
    try:
        # We use Supabase Auth to verify credentials since users were migrated/created there
        auth_response = supabase.auth.sign_in_with_password({
            "email": form_data.username,
            "password": form_data.password
        })
        
        user_id = auth_response.user.id
        
        # Generate our own JWT for FastAPI
        access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
        access_token = create_access_token(
            subject=user_id, expires_delta=access_token_expires
        )
        
        response.set_cookie(
            key="access_token",
            value=access_token,
            httponly=True,
            secure=False, # Set to True in production
            samesite="lax",
            max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        )
        
        return {"success": True}
    except Exception as e:
        raise HTTPException(
            status_code=401,
            detail="Incorrect username or password",
        )

@router.post("/logout")
async def logout(response: Response):
    response.delete_cookie(key="access_token")
    return {"success": True}

@router.get("/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    return {"user": current_user}

class SetupData(BaseModel):
    email: str
    password: str
    full_name: str

@router.get("/setup/status")
async def get_setup_status(supabase: Client = Depends(get_supabase_client)):
    # Check if a superadmin role exists
    role_res = supabase.table("roles").select("id").eq("name", "superadmin").execute()
    if not role_res.data:
        return {"isSetup": False}
    
    role_id = role_res.data[0]["id"]
    
    # Check if any staff has this role
    staff_res = supabase.table("staffs").select("id").eq("role_id", role_id).limit(1).execute()
    if not staff_res.data:
        return {"isSetup": False}
        
    return {"isSetup": True}

@router.post("/setup")
async def setup_superadmin(
    data: SetupData, 
    supabase: Client = Depends(get_supabase_client)
):
    # Verify no superadmin exists yet
    status_check = await get_setup_status(supabase)
    if status_check["isSetup"]:
        raise HTTPException(status_code=403, detail="Superadmin already registered")
        
    try:
        # 1. Create User in Auth using admin API (bypasses email confirmation if configured)
        auth_user = supabase.auth.admin.create_user({
            "email": data.email,
            "password": data.password,
            "email_confirm": True
        })
        user_id = auth_user.user.id
        
        # 2. Get or Create Superadmin Role
        role_res = supabase.table("roles").select("id").eq("name", "superadmin").execute()
        if not role_res.data:
            new_role_res = supabase.table("roles").insert({
                "name": "superadmin", 
                "description": "System Superadmin"
            }).execute()
            role_id = new_role_res.data[0]["id"]
        else:
            role_id = role_res.data[0]["id"]
            
        # 3. Create Staff Profile
        supabase.table("staffs").insert({
            "id": user_id,
            "email": data.email,
            "full_name": data.full_name,
            "role_id": role_id
        }).execute()
        
        return {"success": True}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
