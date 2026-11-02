"""
admin_invoice_routes.py
Routes for creating "paid" invoices for external Razorpay payments.
These invoices are stored as proforma_invoices with status="PAID" and
razorpay_payment_id set, so they reflect in the dashboard revenue.
"""

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from supabase import Client
from typing import List, Optional
from pydantic import BaseModel
import uuid
import os
import json
from datetime import date

from db.supabase import get_supabase_client
from api.deps import get_current_user

router = APIRouter()


def require_admin(current_user: dict = Depends(get_current_user)):
    role = current_user.get("role")
    if role not in ["SUPER_ADMIN", "superadmin", "admin", "master_admin"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized as admin")
    return current_user


def _next_invoice_number(supabase: Client) -> str:
    res = supabase.table("global_settings").select("settings_value").eq(
        "settings_key", "invoice_settings"
    ).execute()
    inv_settings = res.data[0]["settings_value"] if res.data else {}
    prefix = inv_settings.get("prefix", "GEN/26-27/")
    seq = int(inv_settings.get("current_sequence", 1))
    invoice_number = f"{prefix}{str(seq).zfill(3)}"
    inv_settings["current_sequence"] = seq + 1
    supabase.table("global_settings").upsert(
        {"settings_key": "invoice_settings", "settings_value": inv_settings},
        on_conflict="settings_key",
    ).execute()
    return invoice_number


# ── Search endpoints (reuse from PI, also searching by email/phone) ─────────────

@router.get("/search-customers")
def search_customers(
    q: str = Query(default="", min_length=0),
    supabase: Client = Depends(get_supabase_client),
    admin_user: dict = Depends(require_admin),
):
    """Search leads + users by name, phone, or email for invoice customer picker."""
    q = q.strip()
    results = []
    seen_ids = set()

    try:
        # Search leads by name
        leads_name = supabase.table("leads") \
            .select("id, name, phone_number, email") \
            .ilike("name", f"%{q}%") \
            .limit(10).execute()
        for l in (leads_name.data or []):
            if l["id"] not in seen_ids and (l.get("name") or l.get("phone_number")):
                seen_ids.add(l["id"])
                results.append({
                    "id": l["id"],
                    "name": l.get("name") or "—",
                    "phone": l.get("phone_number"),
                    "email": l.get("email"),
                    "type": "lead",
                })

        # Search leads by phone
        if q:
            leads_phone = supabase.table("leads") \
                .select("id, name, phone_number, email") \
                .ilike("phone_number", f"%{q}%") \
                .limit(10).execute()
            for l in (leads_phone.data or []):
                if l["id"] not in seen_ids and (l.get("name") or l.get("phone_number")):
                    seen_ids.add(l["id"])
                    results.append({
                        "id": l["id"],
                        "name": l.get("name") or "—",
                        "phone": l.get("phone_number"),
                        "email": l.get("email"),
                        "type": "lead",
                    })

            # Search leads by email
            leads_email = supabase.table("leads") \
                .select("id, name, phone_number, email") \
                .ilike("email", f"%{q}%") \
                .limit(5).execute()
            for l in (leads_email.data or []):
                if l["id"] not in seen_ids and (l.get("name") or l.get("phone_number")):
                    seen_ids.add(l["id"])
                    results.append({
                        "id": l["id"],
                        "name": l.get("name") or "—",
                        "phone": l.get("phone_number"),
                        "email": l.get("email"),
                        "type": "lead",
                    })

        # Search users by name
        users_name = supabase.table("users") \
            .select("id, name, phone, email") \
            .ilike("name", f"%{q}%") \
            .limit(10).execute()
        for u in (users_name.data or []):
            if u["id"] not in seen_ids and (u.get("name") or u.get("phone")):
                seen_ids.add(u["id"])
                results.append({
                    "id": u["id"],
                    "name": u.get("name") or "—",
                    "phone": u.get("phone"),
                    "email": u.get("email"),
                    "type": "user",
                })

        # Search users by phone
        if q:
            users_phone = supabase.table("users") \
                .select("id, name, phone, email") \
                .ilike("phone", f"%{q}%") \
                .limit(5).execute()
            for u in (users_phone.data or []):
                if u["id"] not in seen_ids and (u.get("name") or u.get("phone")):
                    seen_ids.add(u["id"])
                    results.append({
                        "id": u["id"],
                        "name": u.get("name") or "—",
                        "phone": u.get("phone"),
                        "email": u.get("email"),
                        "type": "user",
                    })

            # Search users by email
            users_email = supabase.table("users") \
                .select("id, name, phone, email") \
                .ilike("email", f"%{q}%") \
                .limit(5).execute()
            for u in (users_email.data or []):
                if u["id"] not in seen_ids and (u.get("name") or u.get("phone")):
                    seen_ids.add(u["id"])
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
    """Search inventory products (with variants) + plan variants for invoice line items."""
    import re
    q = q.strip()
    raw_tokens = [re.sub(r'^[^\w.]+|[^\w.]+$', '', t).lower() for t in q.split()]
    tokens = [t for t in raw_tokens if t]

    results = []
    try:
        # 1. Inventory & variants
        inv_res = supabase.table("inventory") \
            .select("id, name, price, compare_at_price, unit, description") \
            .eq("is_active", True) \
            .execute()
        var_res = supabase.table("inventory_variants") \
            .select("id, inventory_id, label, price, compare_at_price, dosage_strength, sku") \
            .execute()

        variants_by_inv = {}
        for v in (var_res.data or []):
            variants_by_inv.setdefault(v["inventory_id"], []).append(v)

        for item in (inv_res.data or []):
            variants = variants_by_inv.get(item["id"], [])
            if variants:
                for v in variants:
                    label = v.get("label") or v.get("dosage_strength") or v.get("sku") or ""
                    search_text = f"{item['name']} {label} {v.get('dosage_strength') or ''} {v.get('sku') or ''}".lower()
                    if not tokens or all(t in search_text for t in tokens):
                        # Show discounted selling price (price), not compare_at_price
                        variant_price = float(v.get("price") or item.get("price") or 0)
                        results.append({
                            "id": v["id"],
                            "type": "inventory_variant",
                            "inventory_id": item["id"],
                            "name": f"{item['name']}{(' – ' + label) if label else ''}",
                            "mrp": variant_price,
                            "unit": item.get("unit") or "unit",
                            "gst_pct": 0.0,
                        })
            else:
                search_text = f"{item['name']} {item.get('description') or ''}".lower()
                if not tokens or all(t in search_text for t in tokens):
                    item_price = float(item.get("price") or 0)
                    results.append({
                        "id": item["id"],
                        "type": "inventory",
                        "inventory_id": item["id"],
                        "name": item["name"],
                        "mrp": item_price,
                        "unit": item.get("unit") or "unit",
                        "gst_pct": 0.0,
                    })

        # 2. Plans & variants
        plans_res = supabase.table("plans") \
            .select("id, name, price, gst_percentage, plan_variants(id, duration_label, base_price, discounted_price, is_active)") \
            .execute()

        for plan in (plans_res.data or []):
            variants = [v for v in (plan.get("plan_variants") or []) if v.get("is_active")]
            if variants:
                for v in variants:
                    search_text = f"{plan['name']} {v.get('duration_label', '')}".lower()
                    if not tokens or all(t in search_text for t in tokens):
                        plan_price = float(v.get("discounted_price") or v.get("base_price") or plan.get("price") or 0)
                        results.append({
                            "id": v["id"],
                            "type": "plan_variant",
                            "plan_id": plan["id"],
                            "name": f"{plan['name']} – {v.get('duration_label', '')}",
                            "mrp": plan_price,
                            "unit": "subscription",
                            "gst_pct": float(plan.get("gst_percentage") or 0),
                        })
            else:
                search_text = plan["name"].lower()
                if not tokens or all(t in search_text for t in tokens):
                    results.append({
                        "id": plan["id"],
                        "type": "plan",
                        "plan_id": plan["id"],
                        "name": plan["name"],
                        "mrp": float(plan.get("price") or 0),
                        "unit": "subscription",
                        "gst_pct": float(plan.get("gst_percentage") or 0),
                    })

        return {"success": True, "data": results}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Address & Invoice Line Models ──────────────────────────────────────────────

class AddressModel(BaseModel):
    contact_name: Optional[str] = None
    contact_phone: Optional[str] = None
    house_no: Optional[str] = None
    address_line_1: Optional[str] = None
    address_line_2: Optional[str] = None
    landmark: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    postal_code: Optional[str] = None
    country: Optional[str] = "India"
    address_id: Optional[str] = None
    save_to_user: Optional[bool] = False


class SaveAddressPayload(BaseModel):
    contact_name: Optional[str] = None
    contact_phone: Optional[str] = None
    house_no: Optional[str] = None
    address_line_1: str
    address_line_2: Optional[str] = None
    landmark: Optional[str] = None
    city: str
    state: str
    postal_code: str
    country: Optional[str] = "India"
    is_default: Optional[bool] = False


def _resolve_user_id_for_address(supabase: Client, customer_id: str, customer_type: str = "user") -> Optional[str]:
    """Find the user_id that can be used as foreign key to users.id in the addresses table."""
    try:
        u_res = supabase.table("users").select("id").eq("id", customer_id).limit(1).execute()
        if u_res.data:
            return u_res.data[0]["id"]
    except Exception:
        pass

    try:
        lead_res = supabase.table("leads").select("id, name, phone_number, email").eq("id", customer_id).limit(1).execute()
        if lead_res.data:
            lead = lead_res.data[0]
            phone = lead.get("phone_number")
            if phone:
                u_phone = supabase.table("users").select("id").eq("phone", phone).limit(1).execute()
                if u_phone.data:
                    return u_phone.data[0]["id"]
                new_u = supabase.table("users").insert({
                    "phone": phone,
                    "name": lead.get("name") or "Customer",
                    "email": lead.get("email"),
                }).execute()
                if new_u.data:
                    return new_u.data[0]["id"]
    except Exception as e:
        print(f"Error resolving user for address: {e}")

def _ensure_auth_user(supabase: Client, customer_id: str, customer_type: str = "user") -> str:
    """Ensure customer_id exists in auth.users so foreign keys to auth.users (like cart.user_id) succeed."""
    try:
        u = supabase.auth.admin.get_user_by_id(customer_id)
        if u and getattr(u, "user", None):
            return customer_id
    except Exception:
        pass

    lead_name = "Customer"
    lead_email = None
    lead_phone = None
    if customer_type == "lead":
        try:
            l_res = supabase.table("leads").select("name, email, phone_number").eq("id", customer_id).limit(1).execute()
            if l_res.data:
                lead = l_res.data[0]
                lead_name = lead.get("name") or "Customer"
                lead_email = lead.get("email")
                lead_phone = lead.get("phone_number")
        except Exception:
            pass

    try:
        user_payload = {
            "id": customer_id,
            "email": lead_email or f"customer_{customer_id[:8]}@genestac.local",
            "email_confirm": True,
            "user_metadata": {"name": lead_name, "phone": lead_phone, "source": "admin_invoice"}
        }
        res = supabase.auth.admin.create_user(user_payload)
        if res and getattr(res, "user", None):
            return res.user.id
    except Exception:
        try:
            user_payload = {
                "id": customer_id,
                "email": f"customer_{customer_id[:8]}@genestac.local",
                "email_confirm": True,
                "user_metadata": {"name": lead_name, "phone": lead_phone, "source": "admin_invoice"}
            }
            res = supabase.auth.admin.create_user(user_payload)
            if res and getattr(res, "user", None):
                return res.user.id
        except Exception:
            pass

    return customer_id


@router.get("/customer/{customer_id}/addresses")
def get_customer_addresses(
    customer_id: str,
    supabase: Client = Depends(get_supabase_client),
    admin_user: dict = Depends(require_admin),
):
    """Fetch addresses from the addresses table linked to this customer/user."""
    user_id = _resolve_user_id_for_address(supabase, customer_id)
    if not user_id:
        return {"success": True, "data": []}

    try:
        res = supabase.table("addresses").select("*").eq("user_id", user_id).order("is_default", desc=True).order("created_at", desc=True).execute()
        return {"success": True, "data": res.data or []}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/customer/{customer_id}/addresses")
async def save_customer_address(
    customer_id: str,
    request: Request,
    supabase: Client = Depends(get_supabase_client),
    admin_user: dict = Depends(require_admin),
):
    """Save a new address to the user's profile in addresses table without changing DB schema."""
    try:
        data = await request.json()
    except Exception:
        raw = await request.body()
        data = json.loads(raw.decode("utf-8")) if raw else {}
    if isinstance(data, str):
        data = json.loads(data)
    try:
        payload = SaveAddressPayload(**data)
    except Exception as ve:
        raise HTTPException(status_code=422, detail=str(ve))

    user_id = _resolve_user_id_for_address(supabase, customer_id)
    if not user_id:
        raise HTTPException(status_code=400, detail="Cannot link address: customer has no associated user record")

    row = {
        "user_id": user_id,
        "house_no": payload.house_no or "",
        "address_line_1": payload.address_line_1,
        "address_line_2": payload.address_line_2,
        "landmark": payload.landmark,
        "city": payload.city,
        "state": payload.state,
        "postal_code": payload.postal_code,
        "country": payload.country or "India",
        "is_default": payload.is_default or False,
    }
    try:
        res = supabase.table("addresses").insert(row).execute()
        if not res.data:
            raise Exception("Failed to save address")
        return {"success": True, "data": res.data[0]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Create Invoice ─────────────────────────────────────────────────────────────

class InvoiceLineItem(BaseModel):
    item_type: str           # "inventory" | "inventory_variant" | "plan_variant" | "plan"
    item_id: str
    inventory_id: Optional[str] = None
    plan_id: Optional[str] = None
    name: str
    mrp: float
    quantity: int = 1
    unit: str = "unit"


class CreateInvoicePayload(BaseModel):
    customer_id: str         # lead or user id
    customer_type: str       # "lead" | "user"
    razorpay_payment_id: Optional[str] = None
    razorpay_order_id: Optional[str] = None
    razorpay_payment_link_id: Optional[str] = None
    payment_note: Optional[str] = None
    pi_id: Optional[str] = None  # optional: link to an existing PI
    items: List[InvoiceLineItem]
    total_amount: float       # the actual amount paid (as shown in Razorpay)
    billing_address: Optional[AddressModel] = None
    shipping_address: Optional[AddressModel] = None
    place_of_supply: Optional[str] = None
    place_of_delivery: Optional[str] = None


@router.post("/create")
async def create_invoice(
    request: Request,
    supabase: Client = Depends(get_supabase_client),
    admin_user: dict = Depends(require_admin),
):
    """
    Create a paid invoice for an external Razorpay payment.
    - Sets status = "PAID" immediately so it reflects in revenue
    - Stores Razorpay payment ID for reconciliation
    - Associates billing & shipping address, place of supply/delivery
    - Optionally persists addresses to addresses table
    - Attaches cart and cart_items
    - NO payment link in paid invoices
    """
    try:
        data = await request.json()
    except Exception:
        raw = await request.body()
        data = json.loads(raw.decode("utf-8")) if raw else {}
    if isinstance(data, str):
        data = json.loads(data)
    try:
        payload = CreateInvoicePayload(**data)
    except Exception as ve:
        raise HTTPException(status_code=422, detail=str(ve))

    if not payload.items:
        raise HTTPException(status_code=400, detail="At least one item is required")

    try:
        invoice_number = _next_invoice_number(supabase)
        invoice_id = str(uuid.uuid4())

        # Save billing address to user's profile if requested
        if payload.billing_address and payload.billing_address.save_to_user and not payload.billing_address.address_id:
            try:
                user_id_for_addr = _resolve_user_id_for_address(supabase, payload.customer_id, payload.customer_type)
                if user_id_for_addr and payload.billing_address.address_line_1:
                    supabase.table("addresses").insert({
                        "user_id": user_id_for_addr,
                        "house_no": payload.billing_address.house_no or "",
                        "address_line_1": payload.billing_address.address_line_1,
                        "address_line_2": payload.billing_address.address_line_2,
                        "landmark": payload.billing_address.landmark,
                        "city": payload.billing_address.city or "",
                        "state": payload.billing_address.state or "",
                        "postal_code": payload.billing_address.postal_code or "",
                        "country": payload.billing_address.country or "India",
                        "is_default": False,
                    }).execute()
            except Exception as _ae:
                print(f"Non-fatal error saving billing address to profile: {_ae}")

        # Save shipping address to user's profile if requested
        if payload.shipping_address and payload.shipping_address.save_to_user and not payload.shipping_address.address_id:
            try:
                user_id_for_addr = _resolve_user_id_for_address(supabase, payload.customer_id, payload.customer_type)
                if user_id_for_addr and payload.shipping_address.address_line_1:
                    supabase.table("addresses").insert({
                        "user_id": user_id_for_addr,
                        "house_no": payload.shipping_address.house_no or "",
                        "address_line_1": payload.shipping_address.address_line_1,
                        "address_line_2": payload.shipping_address.address_line_2,
                        "landmark": payload.shipping_address.landmark,
                        "city": payload.shipping_address.city or "",
                        "state": payload.shipping_address.state or "",
                        "postal_code": payload.shipping_address.postal_code or "",
                        "country": payload.shipping_address.country or "India",
                        "is_default": False,
                    }).execute()
            except Exception as _ae:
                print(f"Non-fatal error saving shipping address to profile: {_ae}")

        # Compute base_price as sum of MRP * qty
        base_price = sum(i.mrp * i.quantity for i in payload.items)
        total_amount = payload.total_amount
        discount_amount = max(0, base_price - total_amount)
        overall_discount_pct = round((discount_amount / base_price * 100) if base_price > 0 else 0, 2)

        # Build line items JSON for metadata
        items_json = [
            {
                "item_type": i.item_type,
                "item_id": i.item_id,
                "inventory_id": i.inventory_id,
                "plan_id": i.plan_id,
                "item_name": i.name,
                "quantity": i.quantity,
                "unit_mrp": i.mrp,
                "line_total": round(i.mrp * i.quantity, 2),
                "unit": i.unit,
            }
            for i in payload.items
        ]

        # Prepare cart & metadata
        cart_metadata = {
            "billing_address": payload.billing_address.dict() if payload.billing_address else None,
            "shipping_address": payload.shipping_address.dict() if payload.shipping_address else None,
            "place_of_supply": payload.place_of_supply or (payload.billing_address.state if payload.billing_address else "Haryana"),
            "place_of_delivery": payload.place_of_delivery or (payload.shipping_address.state if payload.shipping_address else None),
            "razorpay_payment_id": payload.razorpay_payment_id,
            "razorpay_order_id": payload.razorpay_order_id,
            "payment_note": payload.payment_note,
            "items": items_json,
        }

        # Ensure user exists in auth.users so foreign key to auth.users (cart.user_id) succeeds
        auth_user_id = _ensure_auth_user(supabase, payload.customer_id, payload.customer_type)

        cart_id = str(uuid.uuid4())
        cart_row = {
            "id": cart_id,
            "user_id": auth_user_id,
            "status": "completed",
            "source": "admin_invoice",
            "notes": json.dumps(cart_metadata),
        }
        if payload.customer_type == "lead":
            cart_row["lead_id"] = payload.customer_id

        cart_created = False
        try:
            c_res = supabase.table("cart").insert(cart_row).execute()
            if c_res.data:
                cart_created = True
        except Exception as _ce:
            print(f"Cart insert notice: {_ce}")

        # Insert cart_items only if cart exists
        if cart_created:
            for i in payload.items:
                try:
                    ci_row = {
                        "cart_id": cart_id,
                        "item_type": "inventory" if "inventory" in i.item_type else "plan",
                        "item_name": i.name,
                        "quantity": i.quantity,
                        "unit_mrp": i.mrp,
                        "line_total": round(i.mrp * i.quantity, 2),
                        "discount_percentage": 0,
                        "discounted_unit_price": i.mrp,
                        "gst_percentage": 0,
                        "gst_amount": 0,
                    }
                    if "inventory" in i.item_type:
                        ci_row["inventory_id"] = i.inventory_id or i.item_id
                    elif "plan" in i.item_type:
                        ci_row["plan_id"] = i.plan_id or i.item_id
                    supabase.table("cart_items").insert(ci_row).execute()
                except Exception as _cie:
                    print(f"cart_items insert notice: {_cie}")

        inv_row = {
            "id": invoice_id,
            "user_id": payload.customer_id,
            "sales_rep_id": admin_user.get("id"),
            "cart_id": cart_id if cart_created else None,
            "base_price": round(base_price, 2),
            "discount_percentage": overall_discount_pct,
            "gst_percentage": 0,
            "gst_amount": 0,
            "total_amount": round(total_amount, 2),
            "status": "PAID",
            "invoice_number": invoice_number,
            "invoice_date": date.today().isoformat(),
            "source": "admin_invoice",
            "razorpay_link_id": payload.razorpay_payment_id or payload.razorpay_payment_link_id,
            "razorpay_url": None,  # IMPORTANT: Do not include payment link in paid invoices
        }

        # Keep plan_id for backward compat if first item is a plan
        plan_items = [i for i in payload.items if i.plan_id]
        if plan_items:
            inv_row["plan_id"] = plan_items[0].plan_id

        # Insert invoice — remove None values to avoid column errors
        safe_row = {k: v for k, v in inv_row.items() if v is not None}
        insert_res = supabase.table("proforma_invoices").insert(safe_row).execute()
        if not insert_res.data:
            raise Exception("Failed to insert invoice")

        # If linked to PI, update PI status to PAID
        if payload.pi_id:
            try:
                supabase.table("proforma_invoices").update({"status": "PAID"}).eq("id", payload.pi_id).execute()
            except Exception:
                pass

        public_url = os.getenv("NEXT_PUBLIC_APP_URL", "https://crm.genestac.com")
        invoice_url = f"{public_url}/proforma-invoice/{invoice_id}"

        return {
            "success": True,
            "data": {
                "invoice_id": invoice_id,
                "invoice_number": invoice_number,
                "total_amount": round(total_amount, 2),
                "base_price": round(base_price, 2),
                "discount_amount": round(discount_amount, 2),
                "invoice_url": invoice_url,
                "items": items_json,
                "billing_address": payload.billing_address.dict() if payload.billing_address else None,
                "shipping_address": payload.shipping_address.dict() if payload.shipping_address else None,
                "place_of_supply": payload.place_of_supply,
                "place_of_delivery": payload.place_of_delivery,
            }
        }

    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


# ── List Invoices ──────────────────────────────────────────────────────────────

@router.get("/")
def list_invoices(
    supabase: Client = Depends(get_supabase_client),
    admin_user: dict = Depends(require_admin),
):
    """List all admin-created (PAID) invoices from the admin_invoice source."""
    try:
        res = supabase.table("proforma_invoices") \
            .select("*") \
            .eq("source", "admin_invoice") \
            .order("created_at", desc=True) \
            .execute()
        invoices = res.data or []

        # Resolve customer info
        user_ids = list(set(inv["user_id"] for inv in invoices if inv.get("user_id")))
        users_map = {}
        if user_ids:
            u_res = supabase.table("users").select("id, name, phone, email").in_("id", user_ids).execute()
            for u in (u_res.data or []):
                users_map[u["id"]] = u
            missing = [uid for uid in user_ids if uid not in users_map]
            if missing:
                l_res = supabase.table("leads").select("id, name, phone_number, email").in_("id", missing).execute()
                for l in (l_res.data or []):
                    users_map[l["id"]] = {"id": l["id"], "name": l["name"], "phone": l.get("phone_number"), "email": l.get("email")}

        # Resolve staff
        staff_ids = list(set(inv.get("created_by") or inv.get("sales_rep_id") for inv in invoices if inv.get("created_by") or inv.get("sales_rep_id")))
        staffs_map = {}
        if staff_ids:
            s_res = supabase.table("staffs").select("id, full_name, email").in_("id", staff_ids).execute()
            for s in (s_res.data or []):
                staffs_map[s["id"]] = {"name": s["full_name"], "email": s["email"]}

        for inv in invoices:
            inv["users"] = users_map.get(inv.get("user_id"))
            inv["staffs"] = staffs_map.get(inv.get("created_by") or inv.get("sales_rep_id"))

        return {"success": True, "data": invoices}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Delete Invoice ─────────────────────────────────────────────────────────────

@router.delete("/{invoice_id}")
def delete_invoice(
    invoice_id: str,
    supabase: Client = Depends(get_supabase_client),
    admin_user: dict = Depends(require_admin),
):
    if admin_user.get("role") not in ["SUPER_ADMIN", "superadmin", "master_admin"]:
        raise HTTPException(status_code=403, detail="Only Super Admins can delete invoices")
    supabase.table("proforma_invoices").delete().eq("id", invoice_id).execute()
    return {"success": True, "message": "Invoice deleted"}
