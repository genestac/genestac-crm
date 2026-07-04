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

    plan_name  = (plan or {}).get("name") or "Health Membership"
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
    
    if logo:
        try:
            # ImageReader accepts HTTP URLs or file paths
            img = ImageReader(str(logo))
            iw, ih = img.getSize()
            ratio = min(170 / iw, 55 / ih)
            dw, dh = iw * ratio, ih * ratio
            c.drawImage(
                str(logo), MARGIN, hbot + (HEADER_H - dh) / 2,
                width=dw, height=dh, preserveAspectRatio=True, mask="auto",
            )
        except Exception:
            pass
    t(W - MARGIN, hbot + 30, "PROFORMA INVOICE", "Helvetica-Bold", 18, BLUE, "right")
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
        ("Terms of Payment", "Immediate"),
        ("Reference No.",    ref_id),
    ]
    col1_x = mid_x + 8
    col2_x = mid_x + PAGE_W / 4 + 8
    my = cursor - 14
    for i, (lbl, val) in enumerate(meta):
        mx = col1_x if i % 2 == 0 else col2_x
        t(mx, my, lbl, size=7, col=MUTED)
        t(mx, my - 11, val, "Helvetica-Bold", 8, DARK)
        if i % 2 == 1:
            my -= 28

    vline(mid_x, s1y0, cursor)
    cursor = s1y0
    hline(cursor)

    # 4. Consignee (left) | Buyer (right)
    S2_H = 68
    s2y0 = cursor - S2_H

    def party(px, top, lbl):
        t(px, top - 13, lbl, "Helvetica-Bold", 7, MUTED)
        t(px, top - 27, user_name, "Helvetica-Bold", 10, DARK)
        t(px, top - 40, "Email: " + user_email, size=8, col=DARK)
        t(px, top - 52, "Phone: " + user_phone, size=8, col=DARK)

    party(MARGIN, cursor, "CONSIGNEE (SHIP TO)")
    party(mid_x + 8, cursor, "BUYER (BILL TO)")
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
        "Sl No.", "Description of Services",
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

    TD_H = 20

    def trow(vals, bold_col=None, col_override=None):
        nonlocal cursor
        frect(MARGIN, cursor - TD_H, PAGE_W, TD_H, colors.white)
        for ci, v in enumerate(vals):
            al = "right" if ci == 5 else "left"
            fn = "Helvetica-Bold" if ci == bold_col else "Helvetica"
            fc = col_override if col_override else DARK
            rx = COL_X[ci] + COL_W[ci] - 3 if al == "right" else COL_X[ci] + 3
            t(rx, cursor - 14, v, fn, 8, fc, al)
        cursor -= TD_H
        hline(cursor)

    trow(["1", plan_name, "", "1", _fmt(base_price), _fmt(base_price)], bold_col=1)

    if discount_pct > 0:
        disc_label = "Discount (" + str(int(discount_pct)) + "%)"
        frect(MARGIN, cursor - TD_H, PAGE_W, TD_H, colors.white)
        t(COL_X[1] + 3, cursor - 14, disc_label, "Helvetica-Oblique", 8, MUTED)
        t(
            COL_X[5] + COL_W[5] - 3, cursor - 14,
            "-" + _fmt(discount_amount), "Helvetica", 8, RED, "right"
        )
        cursor -= TD_H
        hline(cursor)

    if gst_pct > 0:
        gst_label = "Add: GST (" + str(int(gst_pct)) + "%)"
        frect(MARGIN, cursor - TD_H, PAGE_W, TD_H, colors.white)
        t(COL_X[1] + 3, cursor - 14, gst_label, "Helvetica-Oblique", 8, MUTED)
        t(COL_X[5] + COL_W[5] - 3, cursor - 14, _fmt(gst_amount), "Helvetica", 8, DARK, "right")
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

    # Right column (Authorised Signatory)
    t(W - MARGIN, ftop - 14, "E. & O.E", "Helvetica-Oblique", 8, MUTED, "right")
    st = fy0 + 42
    
    # Check for dynamic signature from DB
    dynamic_sig_url = company_info.get("signature_url")
    if dynamic_sig_url:
        try:
            sig_img = ImageReader(dynamic_sig_url)
            sw, sh = sig_img.getSize()
            s_ratio = min(100 / sw, 40 / sh)
            sdw, sdh = sw * s_ratio, sh * s_ratio
            c.drawImage(
                dynamic_sig_url, W - MARGIN - sdw, st + 16,
                width=sdw, height=sdh, preserveAspectRatio=True, mask="auto",
            )
        except Exception:
            pass

    t(W - MARGIN, st + 14, "for " + str(company_info.get("name", "")),
      "Helvetica-Bold", 8, DARK, "right")
    c.setStrokeColor(DARK)
    c.setLineWidth(0.5)
    c.line(W - MARGIN - 120, st, W - MARGIN, st)
    t(W - MARGIN, st - 10, "Authorised Signatory", size=7, col=MUTED, align="right")

    vline(fmid, fy0, ftop)
    cursor = fy0
    hline(cursor)

    # 7. Payment bar
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
    if payment_url:
        safe_url = payment_url if payment_url.startswith("http") else f"https://{payment_url}"
        c.linkURL(safe_url, (bx, by, bx + bw, by + bh2), relative=1, kind="URI")
        t(W / 2, by - 11, payment_url, size=7, col=LINK_BLUE, align="center")
        # Also make the text URL clickable by calculating its approximate width
        text_w = c.stringWidth(payment_url, "Helvetica", 7)
        c.linkURL(safe_url, (W / 2 - text_w / 2, by - 11, W / 2 + text_w / 2, by - 11 + 7), relative=1, kind="URI")

    c.showPage()
    c.save()
    buf.seek(0)
    return buf.getvalue()
