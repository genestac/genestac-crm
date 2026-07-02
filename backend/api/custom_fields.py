import os
import json
import uuid
from fastapi import APIRouter, Depends, HTTPException, Body
from pydantic import BaseModel
from typing import List, Optional
from api.deps import get_current_user

router = APIRouter()

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")
DATA_FILE = os.path.join(DATA_DIR, "custom_fields.json")

def load_fields():
    if not os.path.exists(DATA_FILE):
        return []
    try:
        with open(DATA_FILE, "r") as f:
            return json.load(f)
    except:
        return []

def save_fields(fields):
    if not os.path.exists(DATA_DIR):
        os.makedirs(DATA_DIR)
    with open(DATA_FILE, "w") as f:
        json.dump(fields, f, indent=2)

class CustomField(BaseModel):
    name: str # The technical key in metadata (e.g., 'weight_kg')
    label: str # The human readable label (e.g., 'Weight (kg)')
    type: str # 'text', 'number', 'date', 'boolean'
    entity_type: str # 'user' or 'lead'
    is_required: Optional[bool] = False

@router.get("/")
def get_custom_fields(current_user: dict = Depends(get_current_user)):
    return {"data": load_fields()}

@router.post("/")
def create_custom_field(field: CustomField, current_user: dict = Depends(get_current_user)):
    # Check if admin (optional, maybe check role later)
    fields = load_fields()
    
    # Validation
    if any(f.get("name") == field.name and f.get("entity_type") == field.entity_type for f in fields):
        raise HTTPException(status_code=400, detail="Field name already exists for this entity type.")
        
    new_field = field.dict()
    new_field["id"] = str(uuid.uuid4())
    fields.append(new_field)
    
    save_fields(fields)
    return {"message": "Custom field created", "data": new_field}

@router.delete("/{field_id}")
def delete_custom_field(field_id: str, current_user: dict = Depends(get_current_user)):
    fields = load_fields()
    initial_len = len(fields)
    fields = [f for f in fields if f.get("id") != field_id]
    
    if len(fields) == initial_len:
        raise HTTPException(status_code=404, detail="Field not found")
        
    save_fields(fields)
    return {"message": "Custom field deleted"}
