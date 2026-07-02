from fastapi import Depends, HTTPException, status, Request
from jose import jwt, JWTError
from pydantic import BaseModel
from core.config import settings
from db.supabase import get_supabase_client
from supabase import Client

class TokenData(BaseModel):
    user_id: str | None = None

def get_current_user(request: Request, supabase: Client = Depends(get_supabase_client)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
    )
    
    token = request.cookies.get("access_token")
    if not token:
        # Fallback to Authorization header if cookies aren't used (e.g. some client)
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header.split(" ")[1]
            
    if not token:
        raise credentials_exception
        
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise credentials_exception
        token_data = TokenData(user_id=user_id)
    except JWTError as e:
        import traceback, sys
        err = traceback.format_exc()
        print(f"JWT decode error: {err}")
        sys.stdout.flush()
        raise credentials_exception
        
    # verify user exists in Supabase staffs table using service role (bypassing RLS)
    response = supabase.table("staffs").select("*, roles(name)").eq("id", token_data.user_id).execute()
    if not response.data or len(response.data) == 0:
        raise credentials_exception
        
    user_data = response.data[0]
    # Extract role name for convenience
    role_info = user_data.get("roles")
    if role_info and isinstance(role_info, dict):
        user_data["role"] = role_info.get("name")
    elif role_info and isinstance(role_info, list) and len(role_info) > 0:
        user_data["role"] = role_info[0].get("name")
    else:
        user_data["role"] = None
        
    return user_data
