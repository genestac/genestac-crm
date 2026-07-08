from fastapi import APIRouter, Depends, HTTPException, Form, Body
from supabase import Client
from db.supabase import get_supabase_client
from api.deps import get_current_user
from typing import Any, Dict, List
import datetime
router = APIRouter()


@router.get('/inventory')
async def get_inventory(current_user: dict=Depends(get_current_user), supabase: Client=Depends(get_supabase_client)):
    response = supabase.table('inventory').select('*').execute()
    return response.data
