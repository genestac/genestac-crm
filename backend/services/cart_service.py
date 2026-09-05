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
    if user_id:
        payload["user_id"] = user_id

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
) -> dict:
    """
    Add an inventory (injection/medicine) item to the cart.
    MRP = inventory.compare_at_price (falls back to inventory.price if null).
    Discount floor: never below inventory.price (cost price).
    Returns the inserted cart_items row.
    """
    inv_res = supabase.table("inventory").select(
        "id, name, price, compare_at_price, \"Dosage/Strength\", gst_percentage"
    ).eq("id", inventory_id).execute()

    if not inv_res.data:
        raise ValueError(f"Inventory item {inventory_id} not found")

    item = inv_res.data[0]
    cost_price = float(item.get("price") or 0)
    mrp = float(item.get("compare_at_price") or item.get("price") or 0)
    gst_pct = float(item.get("gst_percentage") or 18.0)  # default 18% GST on medicines

    # Apply discount — but never go below cost price
    raw_discounted = mrp * (1 - discount_pct / 100)
    discounted_unit = max(raw_discounted, cost_price)
    actual_discount_pct = round((1 - discounted_unit / mrp) * 100, 2) if mrp > 0 else 0

    gst_per_unit = round(discounted_unit * gst_pct / 100, 2)
    line_total = round((discounted_unit + gst_per_unit) * quantity, 2)

    dosage = item.get("Dosage/Strength") or ""
    item_description = f"{item['name']}{' ' + dosage if dosage else ''} × {quantity}"

    row = {
        "cart_id": cart_id,
        "item_type": "inventory",
        "inventory_id": inventory_id,
        "item_name": item["name"],
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
    lines = ["🧾 *Your Invoice is Ready!*\n"]
    for item in pi.get("items", []):
        mrp = float(item.get("unit_mrp", 0))
        disc = float(item.get("discounted_unit_price", 0))
        qty = int(item.get("quantity", 1))
        disc_pct = float(item.get("discount_percentage", 0))
        lines.append(
            f"• {item['item_name']} × {qty}\n"
            f"  MRP: ₹{mrp:,.0f}  →  Your Price: ₹{disc:,.0f} ({disc_pct:.0f}% off)"
        )

    lines.append(f"\nGST: ₹{pi['gst_amount']:,.2f}")
    lines.append(f"*Total Payable: ₹{pi['total_amount']:,.2f}*")
    lines.append(f"\nInvoice No: {pi['invoice_number']}")

    if pi.get("razorpay_url"):
        lines.append(f"\n💳 *Pay Now:* {pi['razorpay_url']}")
        lines.append(f"\n📄 *View Invoice:* {os.getenv('BACKEND_PUBLIC_URL', 'https://api.genestac.com')}/api/sales/invoices/{pi['invoice_id']}")

    lines.append("\nFor any queries, reply to this message. Our team is here to help 🙏")
    return "\n".join(lines)
