from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from supabase import Client
from db.supabase import get_supabase_client
from api.deps import get_current_user

router = APIRouter()

class TemplateCreate(BaseModel):
    title: str
    category: str
    type: str
    content: str

class TemplateUpdate(BaseModel):
    title: Optional[str] = None
    category: Optional[str] = None
    type: Optional[str] = None
    content: Optional[str] = None

@router.get("/")
async def list_templates(
    category: Optional[str] = None,
    type: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    query = supabase.table("templates").select("*")
    if category:
        query = query.eq("category", category)
    if type:
        query = query.eq("type", type)
        
    res = query.order("created_at", desc=True).execute()
    return res.data

@router.post("/")
async def create_template(
    template: TemplateCreate,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    data = template.dict()
    data["created_by"] = current_user["id"]
    
    res = supabase.table("templates").insert(data).execute()
    if not res.data:
        raise HTTPException(status_code=500, detail="Failed to create template")
    return res.data[0]

@router.put("/{template_id}")
async def update_template(
    template_id: str,
    template: TemplateUpdate,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    update_data = {k: v for k, v in template.dict().items() if v is not None}
    if not update_data:
        return {"message": "Nothing to update"}
        
    res = supabase.table("templates").update(update_data).eq("id", template_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Template not found or update failed")
    return res.data[0]

@router.delete("/{template_id}")
async def delete_template(
    template_id: str,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    res = supabase.table("templates").delete().eq("id", template_id).execute()
    return {"message": "Deleted successfully"}
