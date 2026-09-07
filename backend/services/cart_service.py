"""
cart_service.py
Handles the Cart → CartItems → ProformaInvoice → Razorpay flow.

Flow:
  1. get_or_create_active_cart(lead_id, source) → cart_id
  2. add_inventory_to_cart(cart_id, inventory_id, qty, discount_pct) → cart_item row
     OR add_plan_to_cart(cart_id, plan_id, variant_id, discount_pct)  → cart_item row
  3. compute_cart_totals(cart_id) → {base_price, discount_amount, gst_amount, total_amount, items}
  4. create_pi_from_cart(cart_id, lead_id, source, supabase) → {invoice_id, invoice_number, razorpay_url, total_amount, items}
"""

import os
import uuid
import razorpay
from datetime import datetime, date
from typing import Optional
from supabase import Client


# ── Helpers ──────────────────────────────────────────────────────────────────

def _clean_phone(phone: str) -> str:
    return "".join(filter(str.isdigit, phone or ""))


def _next_invoice_number(supabase: Client) -> str:
    """Atomically fetch and increment the PI sequence stored in global_settings."""
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


# ── Cart management ───────────────────────────────────────────────────────────

def get_or_create_active_cart(
    supabase: Client,
    lead_id: Optional[str] = None,
    user_id: Optional[str] = None,
    source: str = "whatsapp_bot",
) -> str:
    """
    Returns the cart_id of the active cart for this lead/user.
    Creates one if none exists.
    """
    if not lead_id and not user_id:
        raise ValueError("Must provide lead_id or user_id")

    # Try to find existing active cart
    if lead_id:
        res = supabase.table("cart").select("id").eq("lead_id", lead_id).eq("status", "active").limit(1).execute()
    else:
        res = supabase.table("cart").select("id").eq("user_id", user_id).eq("status", "active").limit(1).execute()

    if res.data:
        return res.data[0]["id"]

    # Create new cart
    payload = {
        "status": "active",
        "source": source,
    }
    if lead_id:
        payload["lead_id"] = lead_id
    # cart.user_id has a NOT NULL constraint.
    # For WhatsApp bot carts, lead_id IS the user's UUID (same users table).
    # Use lead_id as user_id when no explicit user_id is given.
    payload["user_id"] = user_id or lead_id

    cart_res = supabase.table("cart").insert(payload).execute()
    return cart_res.data[0]["id"]



def clear_cart_items(supabase: Client, cart_id: str):
    """Remove all items from a cart (before re-adding if replacing)."""
    supabase.table("cart_items").delete().eq("cart_id", cart_id).execute()


def add_inventory_to_cart(
    supabase: Client,
    cart_id: str,
    inventory_id: str,
    quantity: int = 1,
    discount_pct: float = 10.0,
    inventory_item: dict = None,
) -> dict:
    """
    Add an inventory (injection/medicine) item to the cart.
    MRP = inventory.compare_at_price (falls back to inventory.price if null).
    Discount floor: never below inventory.price (cost price).
    Returns the inserted cart_items row.
    """
    if inventory_item:
        item = inventory_item
    else:
        inv_res = supabase.table("inventory").select(
            "id, name, price, compare_at_price, gst_percentage"
        ).eq("id", inventory_id).execute()
        
        if not inv_res.data:
            raise ValueError(f"Inventory item {inventory_id} not found")
        item = inv_res.data[0]

    cost_price = float(item.get("price") or 0)
    mrp = float(item.get("compare_at_price") or item.get("price") or 0)
    gst_pct = float(item.get("gst_percentage") or 0.0)  # 0% GST unless explicitly configured

    # Apply discount — but never go below cost price
    raw_discounted = mrp * (1 - discount_pct / 100) if discount_pct > 0 else cost_price
    discounted_unit = max(raw_discounted, cost_price) if mrp > cost_price else cost_price
    actual_discount_pct = round((1 - discounted_unit / mrp) * 100, 2) if mrp > 0 else 0

    gst_per_unit = round(discounted_unit * gst_pct / 100, 2) if gst_pct > 0 else 0.0
    line_total = round((discounted_unit + gst_per_unit) * quantity, 2)

    dosage = item.get("label") or item.get("Dosage/Strength") or ""
    base_name = item.get('name', 'Injection')
    if dosage and dosage.lower() not in base_name.lower():
        base_name = f"{base_name} ({dosage})"
        
    item_description = f"{base_name} × {quantity}"

    row = {
        "cart_id": cart_id,
        "item_type": "inventory",
        "inventory_id": inventory_id,
        "item_name": base_name,
        "item_description": item_description,
        "quantity": quantity,
        "unit_mrp": mrp,
        "discount_percentage": actual_discount_pct,
        "discounted_unit_price": round(discounted_unit, 2),
        "gst_percentage": gst_pct,
        "gst_amount": round(gst_per_unit * quantity, 2),
        "line_total": line_total,
    }
    res = supabase.table("cart_items").insert(row).execute()
    return res.data[0] if res.data else row


def add_plan_to_cart(
    supabase: Client,
    cart_id: str,
    plan_id: str,
    variant_id: Optional[str] = None,
    discount_pct: float = 0.0,
) -> dict:
    """
    Add a subscription plan to the cart. Uses plan_variant if provided.
    """
    plan_res = supabase.table("plans").select("*").eq("id", plan_id).execute()
    if not plan_res.data:
        raise ValueError(f"Plan {plan_id} not found")
    plan = plan_res.data[0]

    mrp = float(plan.get("price") or 0)
    gst_pct = float(plan.get("gst_percentage") or 5.0)
    plan_name = plan.get("name", "Plan")

    if variant_id:
        v_res = supabase.table("plan_variants").select("*").eq("id", variant_id).execute()
        if v_res.data:
            v = v_res.data[0]
            mrp = float(v.get("base_price") or mrp)
            plan_name = f"{plan_name} – {v.get('duration_label', '')}"

    discounted_unit = mrp * (1 - discount_pct / 100)
    gst_per_unit = round(discounted_unit * gst_pct / 100, 2)
    line_total = round(discounted_unit + gst_per_unit, 2)

    row = {
        "cart_id": cart_id,
        "item_type": "plan",
        "plan_id": plan_id,
        "plan_variant_id": variant_id,
        "item_name": plan_name,
        "item_description": plan.get("description") or plan.get("cart_name") or plan_name,
        "quantity": 1,
        "unit_mrp": mrp,
        "discount_percentage": discount_pct,
        "discounted_unit_price": round(discounted_unit, 2),
        "gst_percentage": gst_pct,
        "gst_amount": gst_per_unit,
        "line_total": line_total,
    }
    res = supabase.table("cart_items").insert(row).execute()
    return res.data[0] if res.data else row


def compute_cart_totals(supabase: Client, cart_id: str) -> dict:
    """
    Compute totals from all cart_items.
    Returns: {base_price, discount_amount, gst_amount, total_amount, items}
    """
    items_res = supabase.table("cart_items").select("*").eq("cart_id", cart_id).execute()
    items = items_res.data or []

    base_price = sum(float(i.get("unit_mrp", 0)) * int(i.get("quantity", 1)) for i in items)
    discounted_subtotal = sum(float(i.get("discounted_unit_price", 0)) * int(i.get("quantity", 1)) for i in items)
    discount_amount = base_price - discounted_subtotal
    gst_amount = sum(float(i.get("gst_amount", 0)) for i in items)
    total_amount = discounted_subtotal + gst_amount

    return {
        "base_price": round(base_price, 2),
        "discount_amount": round(discount_amount, 2),
        "gst_amount": round(gst_amount, 2),
        "total_amount": round(total_amount, 2),
        "items": items,
    }


# ── Proforma Invoice + Razorpay ───────────────────────────────────────────────

def create_pi_from_cart(
    supabase: Client,
    cart_id: str,
    lead_id: str,
    source: str = "whatsapp_bot",
    sales_rep_id: Optional[str] = None,
) -> dict:
    """
    Creates a ProformaInvoice from the cart, generates a Razorpay payment link,
    and returns invoice details including the payment URL.

    Returns:
    {
      "invoice_id": str,
      "invoice_number": str,
      "razorpay_url": str,
      "total_amount": float,
      "base_price": float,
      "discount_amount": float,
      "gst_amount": float,
      "items": list,
    }
    """
    totals = compute_cart_totals(supabase, cart_id)
    if not totals["items"]:
        raise ValueError("Cart is empty — cannot generate invoice")

    # Generate invoice number
    invoice_number = _next_invoice_number(supabase)
    invoice_id = str(uuid.uuid4())

    # Fetch lead/user info for Razorpay customer
    name, phone, email = "Customer", None, None
    # Try leads table first
    lead_res = supabase.table("leads").select("name, phone_number, email").eq("id", lead_id).execute()
    if lead_res.data:
        r = lead_res.data[0]
        name = r.get("name") or "Customer"
        phone = r.get("phone_number")
        email = r.get("email")
    else:
        user_res = supabase.table("users").select("name, phone, email").eq("id", lead_id).execute()
        if user_res.data:
            r = user_res.data[0]
            name = r.get("name") or "Customer"
            phone = r.get("phone")
            email = r.get("email")

    # Create Razorpay payment link
    key_id = os.environ.get("RAZORPAY_KEY_ID")
    key_secret = os.environ.get("RAZORPAY_KEY_SECRET")
    razorpay_link_id = None
    razorpay_url = None

    if key_id and key_secret:
        try:
            client = razorpay.Client(auth=(key_id, key_secret))
            amount_paise = int(totals["total_amount"] * 100)
            pl_data = {
                "amount": amount_paise,
                "currency": "INR",
                "accept_partial": False,
                "description": f"Payment for {totals['items'][0]['item_name']} – {invoice_number}",
                "reference_id": invoice_id,
                "reminder_enable": True,
                "customer": {"name": name},
            }
            if email:
                pl_data["customer"]["email"] = email
            if phone:
                pl_data["customer"]["contact"] = _clean_phone(phone)

            pl = client.payment_link.create(pl_data)
            razorpay_link_id = pl.get("id")
            razorpay_url = pl.get("short_url")
        except Exception as e:
            print(f"[CartService] Razorpay error: {e}")

    # Compute overall discount_percentage for proforma_invoices column
    overall_discount_pct = round(
        (totals["discount_amount"] / totals["base_price"] * 100) if totals["base_price"] > 0 else 0, 2
    )

    # Insert proforma_invoice row
    inv_row = {
        "id": invoice_id,
        "user_id": lead_id,
        "sales_rep_id": sales_rep_id,
        "cart_id": cart_id,
        "base_price": totals["base_price"],
        "discount_percentage": overall_discount_pct,
        "gst_percentage": 0,  # per-item GST used
        "gst_amount": totals["gst_amount"],
        "total_amount": totals["total_amount"],
        "razorpay_link_id": razorpay_link_id,
        "razorpay_url": razorpay_url,
        "status": "PENDING",
        "invoice_number": invoice_number,
        "invoice_date": date.today().isoformat(),
        "source": source,
    }
    # Keep plan_id for backward compat if cart has only one plan item
    plan_items = [i for i in totals["items"] if i.get("item_type") == "plan" and i.get("plan_id")]
    if plan_items:
        inv_row["plan_id"] = plan_items[0]["plan_id"]

    supabase.table("proforma_invoices").insert(inv_row).execute()

    # Mark cart as checked_out
    supabase.table("cart").update({"status": "checked_out"}).eq("id", cart_id).execute()

    return {
        "invoice_id": invoice_id,
        "invoice_number": invoice_number,
        "razorpay_url": razorpay_url,
        "total_amount": totals["total_amount"],
        "base_price": totals["base_price"],
        "discount_amount": totals["discount_amount"],
        "gst_amount": totals["gst_amount"],
        "items": totals["items"],
    }


def format_pi_whatsapp_message(pi: dict) -> str:
    """
    Formats the PI result into a clean WhatsApp text message.
    Sends BOTH the invoice details AND the payment link.
    """
    lines = ["🧾 *Your Proforma Invoice is Ready!*\n"]
    items = pi.get("items") or []
    if items:
        for item in items:
            mrp = float(item.get("unit_mrp", 0))
            disc = float(item.get("discounted_unit_price", 0))
            qty = int(item.get("quantity", 1))
            disc_pct = float(item.get("discount_percentage", 0))
            if mrp > disc and disc_pct > 0:
                lines.append(
                    f"• {item['item_name']} × {qty}\n"
                    f"  MRP: ₹{mrp:,.0f}  →  Your Price: ₹{disc:,.0f} ({disc_pct:.0f}% off)"
                )
            else:
                lines.append(f"• {item['item_name']} × {qty}: ₹{disc:,.0f}")
    else:
        tot = float(pi.get("total_amount", 0))
        lines.append(f"• Injection Purchase: ₹{tot:,.0f}")

    gst_amt = float(pi.get("gst_amount", 0) or 0)
    if gst_amt > 0:
        lines.append(f"\nGST: ₹{gst_amt:,.2f}")
        lines.append(f"*Total Payable: ₹{float(pi['total_amount']):,.2f}*")
    else:
        lines.append(f"\n*Total Payable: ₹{float(pi['total_amount']):,.2f}* (Inclusive of all taxes)")

    lines.append(f"Invoice No: {pi.get('invoice_number', 'N/A')}")

    inv_id = pi.get("invoice_id") or pi.get("id") or ""
    pdf_url = f"{os.getenv('BACKEND_PUBLIC_URL', 'https://api.genestac.com')}/api/sales/invoices/{inv_id}/pdf"

    if pi.get("razorpay_url"):
        lines.append(f"\n💳 *Pay Now:* {pi['razorpay_url']}")
    if inv_id:
        lines.append(f"📄 *Download Proforma Invoice (PDF):* {pdf_url}")

    lines.append("\nAap upar diye link se payment kar sakte hain. Payment hone ke baad hamari team turant aapka order dispatch kar degi. Koi sawal ho toh zaroor batayein! 🙏")
    return "\n".join(lines)


def create_direct_injection_pi(
    supabase: Client,
    lead_id: str,
    inventory_item: dict,
    quantity: int = 1,
    discount_pct: float = 0.0,
    source: str = "whatsapp_bot",
    sales_rep_id: Optional[str] = None,
    dosage: Optional[str] = None,
) -> dict:
    """
    Create a Proforma Invoice for an injection/inventory purchase WITHOUT
    going through the cart table (which has NOT NULL constraints on plan_id
    that don't apply to injection purchases).

    inventory_item must be a dict with at least: id, name, price, compare_at_price, gst_percentage
    Returns the same shape as create_pi_from_cart.
    """
    # ── Item naming and pricing using pre-resolved variant data ──────────────
    item_label = inventory_item.get("label") or inventory_item.get("dosage_strength") or dosage or ""
    item_name = f"{inventory_item.get('name', 'Injection')}"
    if item_label and item_label.lower() not in item_name.lower():
        item_name = f"{item_name} ({item_label})"
    
    unit_price = float(inventory_item.get("price") or 0)
    mrp = float(inventory_item.get("compare_at_price") or unit_price)

    # Apply explicit discount_pct if provided (e.g. 10.0 for 10% off MRP)
    if discount_pct > 0:
        unit_price = round(mrp * (1 - discount_pct / 100.0), 2)

    # ── GST Calculation ───────────────────────────────────────────────────────
    # GST is ONLY applied if explicitly configured on the product. NEVER default to 18% when not set!
    gst_pct = float(inventory_item.get("gst_percentage") or 0.0)

    if gst_pct > 0:
        gst_per_unit = round(unit_price * gst_pct / 100, 2)
        gst_amount = round(gst_per_unit * quantity, 2)
        line_total = round((unit_price + gst_per_unit) * quantity, 2)
    else:
        gst_pct = 0.0
        gst_amount = 0.0
        line_total = round(unit_price * quantity, 2)

    base_price = round(mrp * quantity, 2)
    discount_amount = round(max(0, (mrp - unit_price) * quantity), 2)
    actual_discount_pct = round((discount_amount / base_price * 100), 1) if base_price > 0 else 0.0
    total_amount = line_total

    items = [{
        "item_type": "inventory",
        "inventory_id": inventory_item.get("id"),
        "item_name": item_name,
        "item_description": item_name,
        "quantity": quantity,
        "unit_mrp": mrp,
        "discount_percentage": actual_discount_pct,
        "discounted_unit_price": unit_price,
        "gst_percentage": gst_pct,
        "gst_amount": gst_amount,
        "line_total": line_total,
    }]

    # ── Fetch lead contact info for Razorpay ───────────────────────────────────
    name, phone, email = "Customer", None, None
    lead_res = supabase.table("leads").select("name, phone_number, email").eq("id", lead_id).execute()
    if lead_res.data:
        r = lead_res.data[0]
        name = r.get("name") or "Customer"
        phone = r.get("phone_number")
        email = r.get("email")
    else:
        user_res = supabase.table("users").select("name, phone, email").eq("id", lead_id).execute()
        if user_res.data:
            r = user_res.data[0]
            name = r.get("name") or "Customer"
            phone = r.get("phone")
            email = r.get("email")

    # ── Generate invoice number & ID ───────────────────────────────────────────
    invoice_number = _next_invoice_number(supabase)
    invoice_id = str(uuid.uuid4())

    # ── Create Razorpay payment link ───────────────────────────────────────────
    key_id = os.environ.get("RAZORPAY_KEY_ID")
    key_secret = os.environ.get("RAZORPAY_KEY_SECRET")
    razorpay_link_id = None
    razorpay_url = None

    if key_id and key_secret:
        try:
            client = razorpay.Client(auth=(key_id, key_secret))
            amount_paise = int(total_amount * 100)
            pl_data = {
                "amount": amount_paise,
                "currency": "INR",
                "accept_partial": False,
                "description": f"Payment for {inventory_item.get('name', 'Injection')} – {invoice_number}",
                "reference_id": invoice_id,
                "reminder_enable": True,
                "customer": {"name": name},
            }
            if email:
                pl_data["customer"]["email"] = email
            if phone:
                pl_data["customer"]["contact"] = _clean_phone(phone)

            pl = client.payment_link.create(pl_data)
            razorpay_link_id = pl.get("id")
            razorpay_url = pl.get("short_url")
        except Exception as e:
            print(f"[CartService] Razorpay error (direct PI): {e}")

    # ── Insert proforma_invoice row (no cart_id needed) ────────────────────────
    overall_discount_pct = round(
        (discount_amount / base_price * 100) if base_price > 0 else 0, 2
    )
    inv_row = {
        "id": invoice_id,
        "user_id": lead_id,
        "sales_rep_id": sales_rep_id,
        "base_price": base_price,
        "discount_percentage": overall_discount_pct,
        "gst_percentage": 0,
        "gst_amount": gst_amount,
        "total_amount": total_amount,
        "razorpay_link_id": razorpay_link_id,
        "razorpay_url": razorpay_url,
        "status": "PENDING",
        "invoice_number": invoice_number,
        "invoice_date": date.today().isoformat(),
        "source": source,
        # cart_id intentionally omitted — no cart row created for injection purchases
    }
    supabase.table("proforma_invoices").insert(inv_row).execute()

    return {
        "invoice_id": invoice_id,
        "invoice_number": invoice_number,
        "razorpay_url": razorpay_url,
        "total_amount": total_amount,
        "base_price": base_price,
        "discount_amount": discount_amount,
        "gst_amount": gst_amount,
        "items": items,
    }

