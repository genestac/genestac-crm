from fastapi import APIRouter, Depends, HTTPException, Query, status
from supabase import Client
from typing import List, Dict, Any, Optional
from pydantic import BaseModel

from db.supabase import get_supabase_client
from api.deps import get_current_user
from app.services.admin_proforma_service import AdminProformaService

router = APIRouter()


def get_admin_proforma_service(supabase: Client = Depends(get_supabase_client)) -> AdminProformaService:
    return AdminProformaService(supabase)


def require_admin(current_user: dict = Depends(get_current_user)):
    role = current_user.get("role")
    if role not in ["SUPER_ADMIN", "superadmin", "admin", "master_admin"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized as admin")
    return current_user


# ── Search endpoints ───────────────────────────────────────────────────────────

@router.get("/search-leads")
def search_leads(
    q: str = Query(default="", min_length=0),
    supabase: Client = Depends(get_supabase_client),
    admin_user: dict = Depends(require_admin),
):
    """Search leads + users by name or phone for PI customer picker."""
    q = q.strip()
    results = []
    try:
        # Search leads
        leads_res = supabase.table("leads") \
            .select("id, name, phone_number, email") \
            .ilike("name", f"%{q}%") \
            .limit(15).execute()
        for l in (leads_res.data or []):
            if l.get("name") or l.get("phone_number"):
                results.append({
                    "id": l["id"],
                    "name": l.get("name") or "—",
                    "phone": l.get("phone_number"),
                    "email": l.get("email"),
                    "type": "lead",
                })

        # Also search by phone
        if q:
            ph_res = supabase.table("leads") \
                .select("id, name, phone_number, email") \
                .ilike("phone_number", f"%{q}%") \
                .limit(10).execute()
            existing_ids = {r["id"] for r in results}
            for l in (ph_res.data or []):
                if l["id"] not in existing_ids and (l.get("name") or l.get("phone_number")):
                    results.append({
                        "id": l["id"],
                        "name": l.get("name") or "—",
                        "phone": l.get("phone_number"),
                        "email": l.get("email"),
                        "type": "lead",
                    })

        # Search users
        users_res = supabase.table("users") \
            .select("id, name, phone, email") \
            .ilike("name", f"%{q}%") \
            .limit(10).execute()
        existing_ids = {r["id"] for r in results}
        for u in (users_res.data or []):
            if u["id"] not in existing_ids and (u.get("name") or u.get("phone")):
                results.append({
                    "id": u["id"],
                    "name": u.get("name") or "—",
                    "phone": u.get("phone"),
                    "email": u.get("email"),
                    "type": "user",
                })

        return {"success": True, "data": results[:25]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/search-items")
def search_items(
    q: str = Query(default=""),
    supabase: Client = Depends(get_supabase_client),
    admin_user: dict = Depends(require_admin),
):
    """Search inventory products + plan variants for PI line items."""
    q = q.strip()
    results = []
    try:
        # Inventory
        inv_res = supabase.table("inventory") \
            .select("id, name, price, compare_at_price, unit") \
            .eq("is_active", True) \
            .ilike("name", f"%{q}%") \
            .limit(15).execute()
        for item in (inv_res.data or []):
            mrp = item.get("compare_at_price") or item.get("price") or 0
            results.append({
                "id": item["id"],
                "type": "inventory",
                "name": item["name"],
                "mrp": float(mrp),
                "unit": item.get("unit") or "unit",
            })

        # Plans + variants
        plans_res = supabase.table("plans") \
            .select("id, name, price, gst_percentage, plan_variants(id, duration_label, base_price, is_active)") \
            .ilike("name", f"%{q}%") \
            .limit(10).execute()
        for plan in (plans_res.data or []):
            variants = plan.get("plan_variants") or []
            active_variants = [v for v in variants if v.get("is_active")]
            if active_variants:
                for v in active_variants:
                    results.append({
                        "id": v["id"],
                        "type": "plan_variant",
                        "plan_id": plan["id"],
                        "name": f"{plan['name']} – {v.get('duration_label', '')}",
                        "mrp": float(v.get("base_price") or plan.get("price") or 0),
                        "unit": "subscription",
                    })
            else:
                # Plan without variants
                results.append({
                    "id": plan["id"],
                    "type": "plan",
                    "plan_id": plan["id"],
                    "name": plan["name"],
                    "mrp": float(plan.get("price") or 0),
                    "unit": "subscription",
                })

        return {"success": True, "data": results}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Create PI ─────────────────────────────────────────────────────────────────

class PILineItem(BaseModel):
    item_type: str          # "inventory" | "plan_variant" | "plan"
    item_id: str
    plan_id: Optional[str] = None
    quantity: int = 1
    discount_pct: float = 0.0


class CreatePIPayload(BaseModel):
    lead_id: str
    items: List[PILineItem]


@router.post("/create")
def admin_create_proforma_invoice(
    payload: CreatePIPayload,
    supabase: Client = Depends(get_supabase_client),
    admin_user: dict = Depends(require_admin),
):
    """
    Admin-driven PI creation:
    - Accepts any mix of inventory + plan/plan_variant items
    - Auto-generates Razorpay payment link
    - Returns PI details including razorpay_url
    """
    import uuid
    from services.cart_service import (
        add_inventory_to_cart,
        add_plan_to_cart,
        create_pi_from_cart,
        clear_cart_items,
    )

    if not payload.items:
        raise HTTPException(status_code=400, detail="At least one item is required")

    # Create a temporary cart for this PI
    cart_id = str(uuid.uuid4())
    cart_row = {
        "id": cart_id,
        "lead_id": payload.lead_id,
        "status": "active",
        "source": "admin_pi",
    }
    # Check if lead_id is actually a user
    lead_check = supabase.table("leads").select("id").eq("id", payload.lead_id).execute()
    if not lead_check.data:
        cart_row = {
            "id": cart_id,
            "user_id": payload.lead_id,
            "status": "active",
            "source": "admin_pi",
        }

    supabase.table("cart").insert(cart_row).execute()

    try:
        for line in payload.items:
            if line.item_type == "inventory":
                add_inventory_to_cart(
                    supabase=supabase,
                    cart_id=cart_id,
                    inventory_id=line.item_id,
                    quantity=line.quantity,
                    discount_pct=line.discount_pct,
                )
            elif line.item_type == "plan_variant":
                add_plan_to_cart(
                    supabase=supabase,
                    cart_id=cart_id,
                    plan_id=line.plan_id,
                    variant_id=line.item_id,
                    discount_pct=line.discount_pct,
                )
            elif line.item_type == "plan":
                add_plan_to_cart(
                    supabase=supabase,
                    cart_id=cart_id,
                    plan_id=line.item_id,
                    variant_id=None,
                    discount_pct=line.discount_pct,
                )

        pi = create_pi_from_cart(
            supabase=supabase,
            cart_id=cart_id,
            lead_id=payload.lead_id,
            source="admin_pi",
            sales_rep_id=admin_user.get("id"),
        )
        return {"success": True, "data": pi}

    except Exception as e:
        # Cleanup temp cart on failure
        try:
            clear_cart_items(supabase, cart_id)
            supabase.table("cart").delete().eq("id", cart_id).execute()
        except Exception:
            pass
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


# ── Send PI via WhatsApp ───────────────────────────────────────────────────────

@router.post("/{invoice_id}/send-whatsapp")
async def send_pi_whatsapp(
    invoice_id: str,
    supabase: Client = Depends(get_supabase_client),
    admin_user: dict = Depends(require_admin),
):
    """Send the PI + payment link to the customer's WhatsApp using the pi_created template."""
    from services.whatsapp_service import send_trigger

    inv_res = supabase.table("proforma_invoices").select("*").eq("id", invoice_id).execute()
    if not inv_res.data:
        raise HTTPException(status_code=404, detail="Invoice not found")
    inv = inv_res.data[0]

    # Fetch customer phone
    lead_id = inv.get("user_id")
    phone = None
    name = "Customer"

    lead_r = supabase.table("leads").select("name, phone_number").eq("id", lead_id).execute()
    if lead_r.data:
        phone = lead_r.data[0].get("phone_number")
        name = lead_r.data[0].get("name") or "Customer"
    else:
        user_r = supabase.table("users").select("name, phone").eq("id", lead_id).execute()
        if user_r.data:
            phone = user_r.data[0].get("phone")
            name = user_r.data[0].get("name") or "Customer"

    if not phone:
        raise HTTPException(status_code=400, detail="No phone number for this customer")

    clean_phone = "".join(filter(str.isdigit, phone))

    context = {
        "customer_name": name,
        "invoice_number": inv.get("invoice_number", ""),
        "total_amount": f"₹{float(inv.get('total_amount', 0)):,.2f}",
        "payment_link": inv.get("razorpay_url") or "—",
    }

    try:
        await send_trigger("pi_created", context, clean_phone)
        return {"success": True, "message": f"WhatsApp sent to {clean_phone}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Existing list / view / delete ─────────────────────────────────────────────

@router.get("/")
def get_all_proforma_invoices(
    service: AdminProformaService = Depends(get_admin_proforma_service),
    admin_user: dict = Depends(require_admin)
):
    """Get all proforma invoices across the entire system."""
    try:
        invoices = service.get_all_proformas()
        return {"success": True, "data": invoices}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{invoice_id}")
def get_proforma_invoice(
    invoice_id: str,
    service: AdminProformaService = Depends(get_admin_proforma_service),
    admin_user: dict = Depends(require_admin)
):
    try:
        invoice = service.get_proforma_by_id(invoice_id)
        if not invoice:
            raise HTTPException(status_code=404, detail="Invoice not found")
        return {"success": True, "data": invoice}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{invoice_id}")
def delete_proforma_invoice(
    invoice_id: str,
    service: AdminProformaService = Depends(get_admin_proforma_service),
    admin_user: dict = Depends(require_admin)
):
    try:
        if admin_user.get("role") not in ["SUPER_ADMIN", "superadmin", "master_admin"]:
            raise HTTPException(status_code=403, detail="Only Super Admins can delete invoices")
        success = service.delete_proforma(invoice_id)
        return {"success": success, "message": "Invoice deleted"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
