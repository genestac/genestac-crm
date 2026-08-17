from fastapi import APIRouter, Depends, HTTPException
from supabase import Client
from db.supabase import get_supabase_client
from api.deps import get_current_user
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

router = APIRouter()

def verify_manager_or_admin(current_user: dict, supabase: Client):
    role_name = current_user.get("role")
    if role_name not in ["superadmin", "master_admin", "admin", "manager"]:
        raise HTTPException(status_code=403, detail="Unauthorized. Manager or Admin access required.")


# ── Pydantic Models ──────────────────────────────────────────────────────────

class VariantInput(BaseModel):
    sku: Optional[str] = None
    label: str                       # e.g. "10mg vial", "30-count bottle"
    price: float
    compare_at_price: Optional[float] = None
    stock_quantity: int = 0
    dosage_strength: Optional[str] = None
    weight_or_volume: Optional[str] = None

class CreateInventoryRequest(BaseModel):
    name: str
    description: Optional[str] = None
    manufacturer: Optional[str] = None
    category: Optional[str] = None
    sku: Optional[str] = None
    price: float
    compare_at_price: Optional[float] = None
    stock_quantity: int = 0
    min_stock_threshold: int = 10
    requires_prescription: bool = False
    image_url: Optional[str] = None
    images: Optional[List[str]] = None           # multiple images
    expiry_date: Optional[str] = None
    dosage_strength: Optional[str] = None         # e.g. "50mg"
    conditions_symptoms: Optional[List[str]] = None
    tags: Optional[List[str]] = None
    unit: Optional[str] = None                    # e.g. "tablet", "vial", "ml"
    storage_instructions: Optional[str] = None
    is_active: bool = True
    variants: Optional[List[VariantInput]] = None

class UpdateInventoryRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    manufacturer: Optional[str] = None
    category: Optional[str] = None
    sku: Optional[str] = None
    slug: Optional[str] = None
    price: Optional[float] = None
    compare_at_price: Optional[float] = None
    stock_quantity: Optional[int] = None
    min_stock_threshold: Optional[int] = None
    requires_prescription: Optional[bool] = None
    image_url: Optional[str] = None
    images: Optional[List[str]] = None
    expiry_date: Optional[str] = None
    dosage_strength: Optional[str] = None
    conditions_symptoms: Optional[List[str]] = None
    tags: Optional[List[str]] = None
    unit: Optional[str] = None
    storage_instructions: Optional[str] = None
    is_active: Optional[bool] = None
    variants: Optional[List[VariantInput]] = None


# ── ENDPOINTS ────────────────────────────────────────────────────────────────

@router.get("/")
async def list_inventory(
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    verify_manager_or_admin(current_user, supabase)
    try:
        res = supabase.table("inventory").select("*").order("created_at", desc=True).execute()
        items = res.data or []
    except Exception as e:
        print(f"Error fetching inventory: {e}")
        items = []

    # Fetch variants for all items
    try:
        variants_res = supabase.table("inventory_variants").select("*").order("created_at", desc=False).execute()
        variants = variants_res.data or []
    except Exception:
        variants = []

    # Attach variants to parent items
    variant_map: dict = {}
    for v in variants:
        pid = v.get("inventory_id")
        if pid not in variant_map:
            variant_map[pid] = []
        variant_map[pid].append(v)
    for item in items:
        item["variants"] = variant_map.get(item["id"], [])

    return {"data": items}


@router.post("/")
async def create_inventory_item(
    request: CreateInventoryRequest,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    verify_manager_or_admin(current_user, supabase)

    # Check for duplicate SKU
    if request.sku:
        existing = supabase.table("inventory").select("id").eq("sku", request.sku).execute()
        if existing.data:
            raise HTTPException(status_code=400, detail="SKU already exists")

    data = {
        "name": request.name,
        "description": request.description,
        "manufacturer": request.manufacturer,
        "category": request.category,
        "sku": request.sku,
        "price": request.price,
        "compare_at_price": request.compare_at_price,
        "stock_quantity": request.stock_quantity,
        "min_stock_threshold": request.min_stock_threshold,
        "requires_prescription": request.requires_prescription,
        "image_url": request.image_url,
        "images": request.images or [],
        "expiry_date": request.expiry_date,
        "Dosage/Strength": request.dosage_strength,
        "Condition/Symptoms": request.conditions_symptoms or [],
        "tags": request.tags or [],
        "unit": request.unit,
        "storage_instructions": request.storage_instructions,
        "is_active": request.is_active,
    }

    # Remove None values to let database set defaults
    data = {k: v for k, v in data.items() if v is not None}

    try:
        response = supabase.table("inventory").insert(data).execute()
        item = response.data[0] if response.data else None

        # Create variants if provided
        if item and request.variants:
            for var in request.variants:
                var_data = {
                    "inventory_id": item["id"],
                    "sku": var.sku,
                    "label": var.label,
                    "price": var.price,
                    "compare_at_price": var.compare_at_price,
                    "stock_quantity": var.stock_quantity,
                    "dosage_strength": var.dosage_strength,
                    "weight_or_volume": var.weight_or_volume,
                }
                var_data = {k: v for k, v in var_data.items() if v is not None}
                supabase.table("inventory_variants").insert(var_data).execute()

        return {"success": True, "message": "Inventory item created", "data": item}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/{item_id}")
async def update_inventory_item(
    item_id: str,
    request: UpdateInventoryRequest,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    verify_manager_or_admin(current_user, supabase)

    payload = {}
    raw = request.dict()
    # Map fields to DB column names
    field_mapping = {
        "dosage_strength": "Dosage/Strength",
        "conditions_symptoms": "Condition/Symptoms",
    }
    skip_fields = {"variants"}
    
    for k, v in raw.items():
        if v is None or k in skip_fields:
            continue
        db_key = field_mapping.get(k, k)
        payload[db_key] = v

    if payload:
        payload["updated_at"] = datetime.utcnow().isoformat()
        supabase.table("inventory").update(payload).eq("id", item_id).execute()

    # Replace variants if provided
    if request.variants is not None:
        # Delete existing
        supabase.table("inventory_variants").delete().eq("inventory_id", item_id).execute()
        # Insert new
        for var in request.variants:
            var_data = {
                "inventory_id": item_id,
                "sku": var.sku,
                "label": var.label,
                "price": var.price,
                "compare_at_price": var.compare_at_price,
                "stock_quantity": var.stock_quantity,
                "dosage_strength": var.dosage_strength,
                "weight_or_volume": var.weight_or_volume,
            }
            var_data = {k: v for k, v in var_data.items() if v is not None}
            supabase.table("inventory_variants").insert(var_data).execute()

    return {"success": True, "message": "Inventory item updated"}


@router.delete("/{item_id}")
async def delete_inventory_item(
    item_id: str,
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    verify_manager_or_admin(current_user, supabase)
    # Delete variants first
    try:
        supabase.table("inventory_variants").delete().eq("inventory_id", item_id).execute()
    except Exception:
        pass  # variants table may not exist yet
    supabase.table("inventory").delete().eq("id", item_id).execute()
    return {"success": True, "message": "Inventory item deleted"}
