"""
pdf_generator.py
Proforma Invoice PDF generator using ReportLab.
Replicates the Next.js proforma-invoice page layout exactly.
"""
from io import BytesIO
from pathlib import Path
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas as rl_canvas

BLUE       = colors.HexColor("#0f4c81")
LIGHT_GRAY = colors.HexColor("#f0f4f8")
BORDER     = colors.HexColor("#e2e8f0")
MUTED      = colors.HexColor("#64748b")
DARK       = colors.HexColor("#1e293b")
FAFC       = colors.HexColor("#f8fafc")
RED        = colors.HexColor("#ef4444")
GREEN      = colors.HexColor("#16a34a")
LINK_BLUE  = colors.HexColor("#2563eb")

_HERE = Path(__file__).resolve().parent
_LOGO_CANDIDATES = [
    _HERE.parent / "logo.jpeg",                           # /app/logo.jpeg  (copied in via COPY . .)
    Path("/app/logo.jpeg"),                               # explicit fallback
    _HERE.parent / "frontend" / "public" / "logo.jpeg",  # dev: sibling frontend folder
]
# Safely add grandparent candidates without IndexError
_p = _HERE
for _ in range(3):
    _p = _p.parent
    _LOGO_CANDIDATES.append(_p / "frontend" / "public" / "logo.jpeg")


def _find_logo():
    for p in _LOGO_CANDIDATES:
        if p.exists():
            return p
    return None


def _fmt(val: float) -> str:
    return f"{float(val):,.2f}"


def _words(amount: float) -> str:
    return f"INR {float(amount):,.2f} Only"


def generate_invoice_pdf(
    invoice_data: dict,
    user: dict,
    plan: dict,
    company_info: dict,
    bank_details: dict,
    inv_settings: dict,
) -> bytes:
    base_price      = float(invoice_data.get("base_price") or 0)
    discount_pct    = float(invoice_data.get("discount_percentage") or 0)
    gst_pct         = float(invoice_data.get("gst_percentage") or 0)
    gst_amount      = float(invoice_data.get("gst_amount") or 0)
    total_amount    = float(invoice_data.get("total_amount") or 0)
    discount_amount = base_price * discount_pct / 100

    inv_id      = str(invoice_data.get("id", ""))
    inv_number  = invoice_data.get("invoice_number") or inv_id[:8].upper()
    ref_id      = inv_id[:8].upper()
    inv_date    = str(
        invoice_data.get("invoice_date") or invoice_data.get("created_at", "")
    )[:10]
    payment_url = (
        invoice_data.get("payment_url")
        or invoice_data.get("razorpay_url")
        or ""
    )

    plan_name = (
        (plan or {}).get("name")
        or invoice_data.get("item_name")
        or "Injection Purchase"
    )
    user_phone = (user or {}).get("phone") or (user or {}).get("phone_number") or ""
    user_name  = (user or {}).get("name") or user_phone or ""
    user_email = (user or {}).get("email") or "N/A"
    declaration = inv_settings.get("declaration") or (
        "We declare that this invoice shows the actual price of the "
        "goods described and that all particulars are true and correct."
    )

    buf = BytesIO()
    W, H = A4
    c = rl_canvas.Canvas(buf, pagesize=A4)
    MARGIN = 30
    PAGE_W = W - 2 * MARGIN

    def hline(y, x0=None, x1=None, col=BORDER, lw=0.5):
        c.setStrokeColor(col)
        c.setLineWidth(lw)
        c.line(x0 or MARGIN, y, x1 or W - MARGIN, y)

    def vline(x, y0, y1, col=BORDER, lw=0.5):
        c.setStrokeColor(col)
        c.setLineWidth(lw)
        c.line(x, y0, x, y1)

    def frect(x, y, w, h, fc, sc=None, lw=0.5):
        c.setFillColor(fc)
        if sc:
            c.setStrokeColor(sc)
            c.setLineWidth(lw)
            c.rect(x, y, w, h, fill=1, stroke=1)
        else:
            c.rect(x, y, w, h, fill=1, stroke=0)

    def t(x, y, s, font="Helvetica", size=8, col=DARK, align="left"):
        c.setFont(font, size)
        c.setFillColor(col)
        s = str(s)
        if align == "right":
            c.drawRightString(x, y, s)
        elif align == "center":
            c.drawCentredString(x, y, s)
        else:
            c.drawString(x, y, s)

    cursor = H

    # 1. Blue top bar
    frect(0, H - 8, W, 8, BLUE)
    cursor = H - 8

    # 2. Header: logo left | title right
    HEADER_H = 72
    hbot = cursor - HEADER_H
    
    # Check for dynamic logo from DB first
    dynamic_logo_url = company_info.get("logo_url")
    logo = dynamic_logo_url if dynamic_logo_url else _find_logo()
    
    is_paid = invoice_data.get("status") == "PAID"
    shipping_addr = invoice_data.get("shipping_address") or (invoice_data.get("metadata") or {}).get("shipping_address") or {}
    billing_addr = invoice_data.get("billing_address") or (invoice_data.get("metadata") or {}).get("billing_address") or {}
    place_of_supply = invoice_data.get("place_of_supply") or (invoice_data.get("metadata") or {}).get("place_of_supply") or company_info.get("state_name") or "Haryana"
    place_of_delivery = invoice_data.get("place_of_delivery") or (invoice_data.get("metadata") or {}).get("place_of_delivery") or shipping_addr.get("state") or "Haryana"

    def fmt_addr_lines(addr_dict):
        if not addr_dict:
            return []
        lines = []
        l1_parts = [addr_dict.get("house_no"), addr_dict.get("address_line_1")]
        l1 = ", ".join(p for p in l1_parts if p)
        if l1:
            lines.append(l1)
        l2_parts = [addr_dict.get("address_line_2"), (f"Near {addr_dict.get('landmark')}" if addr_dict.get("landmark") else None)]
        l2 = ", ".join(p for p in l2_parts if p)
        if l2:
            lines.append(l2)
        loc_parts = [addr_dict.get("city"), addr_dict.get("state"), addr_dict.get("postal_code")]
        loc = ", ".join(p for p in loc_parts if p)
        if loc:
            lines.append(loc)
        return lines

    if logo:
        try:
            # ImageReader accepts HTTP URLs or file paths
            img = ImageReader(str(logo))
            iw, ih = img.getSize()
            ratio = min(220 / iw, 65 / ih)
            dw, dh = iw * ratio, ih * ratio
            c.drawImage(
                str(logo), MARGIN, hbot + (HEADER_H - dh) / 2,
                width=dw, height=dh, preserveAspectRatio=True, mask="auto",
            )
        except Exception:
            pass

    title_text = "TAX INVOICE" if is_paid else "PROFORMA INVOICE"
    t(W - MARGIN, hbot + 34, title_text, "Helvetica-Bold", 18, BLUE, "right")
    if is_paid:
        # Draw green PAID badge
        bw, bh = 50, 14
        bx = W - MARGIN - bw
        by = hbot + 16
        frect(bx, by, bw, bh, GREEN)
        c.setFillColor(colors.white)
        c.setFont("Helvetica-Bold", 8)
        c.drawCentredString(bx + bw / 2, by + 3.5, "PAID")

    cursor = hbot
    hline(cursor)

    # 3. Company info (left 50%) | Invoice meta (right 50%)
    S1_H = 95
    s1y0 = cursor - S1_H
    mid_x = MARGIN + PAGE_W * 0.5

    y = cursor - 14
    t(MARGIN, y, company_info.get("name", ""), "Helvetica-Bold", 11, BLUE)
    y -= 14
    addr = (company_info.get("address") or "").replace("\\n", "\n")
    for line in addr.split("\n"):
        if line.strip():
            t(MARGIN, y, line.strip(), size=8, col=DARK)
            y -= 11
    y -= 2
    gstin_str = "GSTIN/UIN: " + str(company_info.get("gstin", ""))
    t(MARGIN, y, gstin_str, size=8, col=DARK)
    y -= 11
    state_str = (
        "State: " + str(company_info.get("state_name", ""))
        + "  Code: " + str(company_info.get("state_code", ""))
    )
    t(MARGIN, y, state_str, size=8, col=MUTED)

    meta = [
        ("Invoice No.",      inv_number),
        ("Dated",            inv_date),
        ("Terms of Payment", "Immediate" if not is_paid else "PAID (External)"),
        ("Reference No.",    invoice_data.get("razorpay_link_id") or ref_id),
    ]
    col1_x = mid_x + 8
    col2_x = mid_x + PAGE_W / 4 + 8
    my = cursor - 14
    for i, (lbl, val) in enumerate(meta):
        mx = col1_x if i % 2 == 0 else col2_x
        t(mx, my, lbl, size=7, col=MUTED)
        t(mx, my - 11, str(val)[:24], "Helvetica-Bold", 8, DARK)
        if i % 2 == 1:
            my -= 28

    vline(mid_x, s1y0, cursor)
    cursor = s1y0
    hline(cursor)

    # 4. Consignee (left) | Buyer (right)
    S2_H = 82
    s2y0 = cursor - S2_H

    def party(px, top, lbl, addr_dict, place_lbl, place_val):
        t(px, top - 12, lbl, "Helvetica-Bold", 7, MUTED)
        contact_name = addr_dict.get("contact_name") or user_name
        contact_phone = addr_dict.get("contact_phone") or user_phone
        t(px, top - 24, contact_name, "Helvetica-Bold", 9, DARK)
        py = top - 35
        lines = fmt_addr_lines(addr_dict)
        for al in lines[:2]:
            t(px, py, al[:45], size=7, col=DARK)
            py -= 9
        if contact_phone:
            t(px, py, "Phone: " + contact_phone, size=7, col=DARK)
            py -= 9
        if place_val:
            t(px, py, f"{place_lbl}: {place_val}", "Helvetica-Bold", 7, BLUE)

    party(MARGIN, cursor, "CONSIGNEE (SHIP TO)", shipping_addr, "Place of Delivery", place_of_delivery)
    party(mid_x + 8, cursor, "BUYER (BILL TO)", billing_addr, "Place of Supply", place_of_supply)
    vline(mid_x, s2y0, cursor)
    cursor = s2y0
    hline(cursor)

    # 5. Line-items table
    COL_W = [22, 173, 45, 38, 60, 65]
    COL_W[-1] += PAGE_W - sum(COL_W)
    COL_X = [MARGIN]
    for w in COL_W[:-1]:
        COL_X.append(COL_X[-1] + w)

    hdrs = [
        "Sl No.", "Description of Goods/Services",
        "HSN/SAC", "Qty", "Rate", "Amount (INR)"
    ]
    TH_H = 18
    frect(MARGIN, cursor - TH_H, PAGE_W, TH_H, LIGHT_GRAY)
    for i, h in enumerate(hdrs):
        al = "right" if i == 5 else "left"
        hx = COL_X[i] + COL_W[i] - 3 if al == "right" else COL_X[i] + 3
        t(hx, cursor - TH_H + 5, h, "Helvetica-Bold", 7, BLUE, al)
    cursor -= TH_H
    hline(cursor)

    TD_H = 18

    def trow(vals, bold_col=None, col_override=None):
        nonlocal cursor
        frect(MARGIN, cursor - TD_H, PAGE_W, TD_H, colors.white)
        for ci, v in enumerate(vals):
            al = "right" if ci == 5 else "left"
            fn = "Helvetica-Bold" if ci == bold_col else "Helvetica"
            fc = col_override if col_override else DARK
            rx = COL_X[ci] + COL_W[ci] - 3 if al == "right" else COL_X[ci] + 3
            t(rx, cursor - 13, str(v)[:45], fn, 8, fc, al)
        cursor -= TD_H
        hline(cursor)

    line_items = invoice_data.get("items") or []
    if line_items:
        for idx, it in enumerate(line_items, 1):
            it_name = it.get("item_name") or it.get("name") or "Item"
            it_qty = str(it.get("quantity") or 1)
            it_rate = float(it.get("unit_mrp") or it.get("mrp") or 0)
            it_total = float(it.get("line_total") or (it_rate * float(it_qty)))
            trow([str(idx), it_name, "", it_qty, _fmt(it_rate), _fmt(it_total)], bold_col=1)
    else:
        trow(["1", plan_name, "", "1", _fmt(base_price), _fmt(base_price)], bold_col=1)

    if discount_pct > 0:
        disc_label = "Discount (" + str(int(discount_pct)) + "%)"
        frect(MARGIN, cursor - TD_H, PAGE_W, TD_H, colors.white)
        t(COL_X[1] + 3, cursor - 13, disc_label, "Helvetica-Oblique", 8, MUTED)
        t(
            COL_X[5] + COL_W[5] - 3, cursor - 13,
            "-" + _fmt(discount_amount), "Helvetica", 8, RED, "right"
        )
        cursor -= TD_H
        hline(cursor)

    if gst_pct > 0:
        gst_label = "Add: GST (" + str(int(gst_pct)) + "%)"
        frect(MARGIN, cursor - TD_H, PAGE_W, TD_H, colors.white)
        t(COL_X[1] + 3, cursor - 13, gst_label, "Helvetica-Oblique", 8, MUTED)
        t(COL_X[5] + COL_W[5] - 3, cursor - 13, _fmt(gst_amount), "Helvetica", 8, DARK, "right")
        cursor -= TD_H
        hline(cursor)

    # Total row
    TOTAL_H = 22
    frect(MARGIN, cursor - TOTAL_H, PAGE_W, TOTAL_H, FAFC)
    t(COL_X[4] + COL_W[4] - 3, cursor - 15, "Total", "Helvetica-Bold", 9, DARK, "right")
    rupee_total = "\u20b9 " + _fmt(total_amount)
    t(COL_X[5] + COL_W[5] - 3, cursor - 15, rupee_total, "Helvetica-Bold", 9, DARK, "right")
    cursor -= TOTAL_H
    hline(cursor)

    # 6. Footer: 3fr left | 2fr right
    FOOTER_H = 145
    FLEFT = PAGE_W * 0.6
    fmid = MARGIN + FLEFT
    fy0 = cursor - FOOTER_H
    ftop = cursor

    # Left column
    ly = ftop - 14
    t(MARGIN, ly, "Amount Chargeable (in words)", "Helvetica-Bold", 7, MUTED)
    ly -= 13
    t(MARGIN, ly, _words(total_amount), "Helvetica-Bold", 9, DARK)
    ly -= 22

    bank_box_h = 58
    frect(MARGIN, ly - bank_box_h, FLEFT - 12, bank_box_h, FAFC, BORDER)
    bly = ly - 11
    t(MARGIN + 4, bly, "Company's Bank Details", "Helvetica-Bold", 7, MUTED)
    bly -= 11
    for lbl, val in [
        ("Bank Name",     bank_details.get("bank_name", "")),
        ("A/c No.",       bank_details.get("account_no", "")),
        ("Branch & IFSC", bank_details.get("branch_ifsc", "")),
    ]:
        t(MARGIN + 4,  bly, lbl,         size=7, col=MUTED)
        t(MARGIN + 65, bly, ": " + str(val), "Helvetica-Bold", 7, DARK)
        bly -= 10
    ly -= bank_box_h + 8

    t(MARGIN, ly, "Declaration:", "Helvetica-Bold", 7, MUTED)
    ly -= 10
    for i in range(0, len(declaration), 88):
        t(MARGIN, ly, declaration[i: i + 88], "Helvetica-Oblique", 7, MUTED)
        ly -= 9

    # Right column (Genestac Logo + Authorised Signatory)
    t(W - MARGIN, ftop - 14, "E. & O.E", "Helvetica-Oblique", 8, MUTED, "right")
    st = fy0 + 38

    # Bottom Genestac Logo
    if logo:
        try:
            b_img = ImageReader(str(logo))
            bw, bh = b_img.getSize()
            b_ratio = min(90 / bw, 24 / bh)
            bdw, bdh = bw * b_ratio, bh * b_ratio
            c.drawImage(
                str(logo), W - MARGIN - bdw, st + 46,
                width=bdw, height=bdh, preserveAspectRatio=True, mask="auto",
            )
        except Exception:
            pass

    # Signature
    dynamic_sig_url = company_info.get("signature_url")
    sig_drawn_h = 0
    if dynamic_sig_url:
        try:
            sig_img = ImageReader(dynamic_sig_url)
            sw, sh = sig_img.getSize()
            s_ratio = min(150 / sw, 40 / sh)
            sdw, sdh = sw * s_ratio, sh * s_ratio
            c.drawImage(
                dynamic_sig_url, W - MARGIN - sdw, st + 2,
                width=sdw, height=sdh, preserveAspectRatio=True, mask="auto",
            )
            sig_drawn_h = sdh
        except Exception:
            pass

    for_y = st + 16 + sig_drawn_h if sig_drawn_h > 0 else st + 24
    t(W - MARGIN, for_y, "for " + str(company_info.get("name", "GENESTAC THERAPEUTICS LLP")),
      "Helvetica-Bold", 8, DARK, "right")

    c.setStrokeColor(DARK)
    c.setLineWidth(0.5)
    c.line(W - MARGIN - 160, st, W - MARGIN, st)
    t(W - MARGIN, st - 10, "Authorised Signatory", size=7, col=MUTED, align="right")

    vline(fmid, fy0, ftop)
    cursor = fy0
    hline(cursor)

    # 7. Payment bar — DO NOT INCLUDE PAYMENT LINK IN PAID INVOICE
    if is_paid or not payment_url:
        # Paid confirmation banner with NO payment link
        PAY_H = 26
        frect(MARGIN, cursor - PAY_H, PAGE_W, PAY_H, FAFC)
        c.setStrokeColor(BORDER)
        c.setLineWidth(0.5)
        c.line(MARGIN, cursor, W - MARGIN, cursor)
        ref_text = f"Status: PAID • {inv_number}"
        if invoice_data.get("razorpay_link_id"):
            ref_text += f" • Payment Ref: {invoice_data.get('razorpay_link_id')}"
        t(W / 2, cursor - PAY_H / 2 - 3, ref_text, "Helvetica-Bold", 8, GREEN, "center")
    else:
        PAY_H = 52
        frect(MARGIN, cursor - PAY_H, PAGE_W, PAY_H, FAFC)
        c.setStrokeColor(BORDER)
        c.setLineWidth(0.5)
        c.setDash([3, 3])
        c.line(MARGIN, cursor, W - MARGIN, cursor)
        c.setDash([])

        bw, bh2 = 100, 22
        bx = W / 2 - bw / 2
        by = cursor - PAY_H / 2 - bh2 / 2 + 7
        frect(bx, by, bw, bh2, GREEN)
        c.setFillColor(colors.white)
        c.setFont("Helvetica-Bold", 10)
        c.drawCentredString(bx + bw / 2, by + 7, "Pay Now")
        safe_url = payment_url if payment_url.startswith("http") else f"https://{payment_url}"
        c.linkURL(safe_url, (bx, by, bx + bw, by + bh2), relative=1, kind="URI")
        t(W / 2, by - 11, payment_url, size=7, col=LINK_BLUE, align="center")
        text_w = c.stringWidth(payment_url, "Helvetica", 7)
        c.linkURL(safe_url, (W / 2 - text_w / 2, by - 11, W / 2 + text_w / 2, by - 11 + 7), relative=1, kind="URI")

    c.showPage()
    c.save()
    buf.seek(0)
    return buf.getvalue()
