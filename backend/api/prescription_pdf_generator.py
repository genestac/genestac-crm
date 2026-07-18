"""
prescription_pdf_generator.py
Generates a Prescription PDF using ReportLab that exactly matches the HTML preview.
"""
from io import BytesIO
from pathlib import Path
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas as rl_canvas

# ── Colour Palette (matching the HTML preview CSS) ──────────────────────────
PRIMARY    = colors.HexColor("#0f4c81")   # brand blue
TEAL       = colors.HexColor("#059669")   # patient card / verified badge
LIGHT_BG   = colors.HexColor("#f0f4f8")   # meta bar / section bg
FAFC       = colors.HexColor("#f8fafc")   # table header / footer bg
BORDER     = colors.HexColor("#e2e8f0")   # card borders
MUTED      = colors.HexColor("#64748b")   # secondary text
DARK       = colors.HexColor("#1e293b")   # primary text
WHITE      = colors.white
DIAG_BG    = colors.HexColor("#f8fafc")

# ── Logo candidates (same as pdf_generator.py) ───────────────────────────────
_HERE = Path(__file__).resolve().parent
_LOGO_CANDIDATES = [
    _HERE.parent / "logo.jpeg",
    Path("/app/logo.jpeg"),
    _HERE.parent / "frontend" / "public" / "logo.jpeg",
]
_p = _HERE
for _ in range(3):
    _p = _p.parent
    _LOGO_CANDIDATES.append(_p / "frontend" / "public" / "logo.jpeg")

def _find_logo():
    for p in _LOGO_CANDIDATES:
        if p.exists():
            return str(p)
    return None


def generate_prescription_pdf(
    rx: dict,
    patient: dict,
    doctor: dict,
    items: list,
    company_info: dict,
    doc_settings: dict,
) -> bytes:
    """
    rx          – prescriptions row
    patient     – users row (name, phone, email)
    doctor      – staffs row (full_name, phone)
    items       – list of prescription_items with inventory.name
    company_info– from global_settings (logo_url, name, address, phone, email, website)
    doc_settings– per-doctor settings (qualification, reg_number, show_phone,
                  signature_url, advice_lines, followup_text, consultation_type)
    """
    buf = BytesIO()
    W, H = A4          # 595.28 x 841.89 pts — fixed A4
    MARGIN = 36
    PAGE_W = W - 2 * MARGIN

    c = rl_canvas.Canvas(buf, pagesize=A4)

    # ── helpers ──────────────────────────────────────────────────────────────
    def hline(y, x0=None, x1=None, col=BORDER, lw=0.5):
        c.setStrokeColor(col)
        c.setLineWidth(lw)
        c.line(x0 if x0 is not None else MARGIN, y,
               x1 if x1 is not None else W - MARGIN, y)

    def txt(x, y, s, font="Helvetica", size=9, col=DARK, align="left", max_w=None):
        c.setFont(font, size)
        c.setFillColor(col)
        s = str(s)
        if max_w:
            # truncate with ellipsis if too long
            while c.stringWidth(s, font, size) > max_w and len(s) > 3:
                s = s[:-4] + "…"
        if align == "right":
            c.drawRightString(x, y, s)
        elif align == "center":
            c.drawCentredString(x, y, s)
        else:
            c.drawString(x, y, s)

    def frect(x, y, w, h, fc, sc=None, lw=0.5):
        c.setFillColor(fc)
        if sc:
            c.setStrokeColor(sc)
            c.setLineWidth(lw)
            c.rect(x, y, w, h, fill=1, stroke=1)
        else:
            c.rect(x, y, w, h, fill=1, stroke=0)

    def wrap_text(x, y, text, font, size, col, max_w, line_h):
        """Draw wrapped text, return final y after last line."""
        c.setFont(font, size)
        c.setFillColor(col)
        words = str(text).split()
        line = ""
        for word in words:
            test = (line + " " + word).strip()
            if c.stringWidth(test, font, size) <= max_w:
                line = test
            else:
                if line:
                    c.drawString(x, y, line)
                    y -= line_h
                line = word
        if line:
            c.drawString(x, y, line)
            y -= line_h
        return y

    cursor = H  # current y position (drawing top → bottom, so cursor decreases)

    # ══════════════════════════════════════════════════════════════════════════
    # 1.  BLUE TOP BORDER
    # ══════════════════════════════════════════════════════════════════════════
    frect(0, H - 8, W, 8, PRIMARY)
    cursor = H - 8
    
    # 1 cm gap above logo
    cursor -= 28.35

    # ══════════════════════════════════════════════════════════════════════════
    # 2.  HEADER  – logo left | company name+tagline | contact right
    # ══════════════════════════════════════════════════════════════════════════
    HEADER_H = 80
    hbot = cursor - HEADER_H

    # logo
    logo_url = company_info.get("logo_url") or _find_logo()
    if logo_url:
        try:
            img = ImageReader(str(logo_url))
            iw, ih = img.getSize()
            ratio = min(100 / iw, 60 / ih)
            dw, dh = iw * ratio, ih * ratio
            c.drawImage(str(logo_url), MARGIN,
                        hbot + (HEADER_H - dh) / 2,
                        width=dw, height=dh,
                        preserveAspectRatio=True, mask="auto")
            name_x = MARGIN + dw + 10
        except Exception:
            name_x = MARGIN
    else:
        name_x = MARGIN

    # company name block
    comp_name = company_info.get("name", "GENESTAC THERAPEUTICS LLP")
    parts = comp_name.split()
    first_word = parts[0] if parts else comp_name
    rest_words = " ".join(parts[1:]) if len(parts) > 1 else ""
    txt(name_x, hbot + HEADER_H - 18, first_word, "Helvetica-Bold", 20, PRIMARY)
    if rest_words:
        txt(name_x, hbot + HEADER_H - 32, rest_words, "Helvetica", 11, MUTED)
    badge_text = company_info.get("tagline", "Doctor-Guided Medical Weight Loss Program")
    badge_w = c.stringWidth(badge_text, "Helvetica", 8) + 16
    frect(name_x, hbot + HEADER_H - 55, badge_w, 14, LIGHT_BG)
    txt(name_x + 8, hbot + HEADER_H - 49, badge_text, "Helvetica", 8, PRIMARY)

    # contact right
    contact_lines = []
    addr = company_info.get("address", "").replace("\\n", ", ")
    if addr:
        contact_lines.append(addr)
    comp_phone = company_info.get("phone", "")
    if comp_phone:
        contact_lines.append(f"✆ {comp_phone}")
    comp_email = company_info.get("email", "")
    if comp_email:
        contact_lines.append(f"✉ {comp_email}")
    comp_web = company_info.get("website", "")
    if comp_web:
        contact_lines.append(f"⊕ {comp_web}")

    cy = hbot + HEADER_H - 14
    for line in contact_lines[:4]:
        txt(W - MARGIN, cy, line, "Helvetica", 7.5, MUTED, "right")
        cy -= 11

    cursor = hbot
    hline(cursor)

    # ══════════════════════════════════════════════════════════════════════════
    # 3.  META BAR  – Date | Prescription ID | Consultation type
    # ══════════════════════════════════════════════════════════════════════════
    META_H = 24
    frect(MARGIN, cursor - META_H, PAGE_W, META_H, LIGHT_BG)
    rx_date = str(rx.get("created_at", ""))[:10]
    rx_id_short = str(rx.get("id", ""))[:8].upper()
    consult_type = doc_settings.get("consultation_type", "Online")
    col_w = PAGE_W / 3
    txt(MARGIN + 8,        cursor - META_H + 8, f"Date: {rx_date}",              "Helvetica-Bold", 8.5, PRIMARY)
    txt(MARGIN + col_w + 8, cursor - META_H + 8, f"Prescription ID: {rx_id_short}", "Helvetica-Bold", 8.5, PRIMARY)
    txt(MARGIN + col_w*2 + 8, cursor - META_H + 8, f"Consultation: {consult_type}",  "Helvetica-Bold", 8.5, PRIMARY)
    cursor -= META_H
    hline(cursor)

    # ══════════════════════════════════════════════════════════════════════════
    # 4.  DOCTOR & PATIENT CARDS  (two columns)
    # ══════════════════════════════════════════════════════════════════════════
    CARD_H = 90
    CARD_PAD = 10
    gap = 14
    half = (PAGE_W - gap) / 2

    card_top = cursor - 14
    card_bot = card_top - CARD_H

    # Doctor card (left) – blue left stripe
    frect(MARGIN, card_bot, half, CARD_H, WHITE, BORDER)
    frect(MARGIN, card_bot, 4, CARD_H, PRIMARY)

    txt(MARGIN + CARD_PAD + 4, card_top - 10, "CONSULTING PHYSICIAN",
        "Helvetica-Bold", 7, MUTED)
    doc_name = doctor.get("full_name", "Doctor")
    txt(MARGIN + CARD_PAD + 4, card_top - 24, doc_name, "Helvetica-Bold", 14, PRIMARY)

    qualification = doc_settings.get("qualification", "MBBS, MD")
    reg_no = doc_settings.get("reg_number", "")
    dy = card_top - 38
    txt(MARGIN + CARD_PAD + 4, dy, "Qualifications", "Helvetica", 8, MUTED)
    txt(MARGIN + CARD_PAD + 90, dy, qualification, "Helvetica-Bold", 8, DARK)
    dy -= 12
    if reg_no:
        txt(MARGIN + CARD_PAD + 4, dy, "Medical Reg. No.", "Helvetica", 8, MUTED)
        txt(MARGIN + CARD_PAD + 90, dy, reg_no, "Helvetica-Bold", 8, DARK)
        dy -= 12
    show_phone = doc_settings.get("show_phone", True)
    if show_phone and doctor.get("phone"):
        txt(MARGIN + CARD_PAD + 4, dy, "Contact", "Helvetica", 8, MUTED)
        txt(MARGIN + CARD_PAD + 90, dy, doctor.get("phone", ""), "Helvetica-Bold", 8, DARK)
        dy -= 12
    txt(MARGIN + CARD_PAD + 4, dy, "Provider", "Helvetica", 8, MUTED)
    txt(MARGIN + CARD_PAD + 90, dy, comp_name, "Helvetica-Bold", 8, DARK, max_w=half - 100)

    # Patient card (right) – teal left stripe
    px = MARGIN + half + gap
    frect(px, card_bot, half, CARD_H, WHITE, BORDER)
    frect(px, card_bot, 4, CARD_H, TEAL)

    txt(px + CARD_PAD + 4, card_top - 10, "PATIENT DETAILS", "Helvetica-Bold", 7, MUTED)
    pat_name = patient.get("name", "Unknown Patient")
    txt(px + CARD_PAD + 4, card_top - 24, pat_name, "Helvetica-Bold", 12, DARK)

    py = card_top - 38
    pat_id = str(patient.get("id", ""))[:8].upper()
    txt(px + CARD_PAD + 4, py, "Patient ID", "Helvetica", 8, MUTED)
    txt(px + CARD_PAD + 70, py, f"PT-{pat_id}", "Helvetica-Bold", 8, DARK)
    py -= 12
    pat_phone = patient.get("phone", "--")
    txt(px + CARD_PAD + 4, py, "Contact", "Helvetica", 8, MUTED)
    txt(px + CARD_PAD + 70, py, pat_phone or "--", "Helvetica-Bold", 8, DARK)
    py -= 12
    pat_email = patient.get("email", "--")
    txt(px + CARD_PAD + 4, py, "Email", "Helvetica", 8, MUTED)
    txt(px + CARD_PAD + 70, py, pat_email or "--", "Helvetica-Bold", 8, DARK, max_w=half - 80)

    cursor = card_bot - 14
    hline(cursor)

    # ══════════════════════════════════════════════════════════════════════════
    # 5.  DIAGNOSIS & ASSESSMENT
    # ══════════════════════════════════════════════════════════════════════════
    DIAG_PAD = 10
    general_instr = rx.get("general_instructions") or "General consultation and prescription"
    instr_lines = max(1, len(general_instr) // 80 + 1)
    DIAG_H = DIAG_PAD * 2 + instr_lines * 11 + 4

    # Section heading
    cursor -= 14
    txt(MARGIN, cursor, "Diagnosis & Assessment", "Helvetica-Bold", 11, PRIMARY)
    hline(cursor - 2, x0=MARGIN, x1=MARGIN + PAGE_W * 0.6, col=LIGHT_BG, lw=1.5)
    cursor -= 14

    frect(MARGIN, cursor - DIAG_H, PAGE_W, DIAG_H, DIAG_BG, BORDER)
    wrap_text(MARGIN + DIAG_PAD, cursor - DIAG_PAD - 9,
              general_instr, "Helvetica", 9, DARK,
              PAGE_W - DIAG_PAD * 2, 11)
    cursor -= DIAG_H + 14

    # ══════════════════════════════════════════════════════════════════════════
    # 6.  Rx PRESCRIPTION TABLE
    # ══════════════════════════════════════════════════════════════════════════
    # Section heading
    txt(MARGIN, cursor, "℞  Prescription Plan", "Helvetica-Bold", 11, PRIMARY)
    hline(cursor - 2, x0=MARGIN, x1=MARGIN + PAGE_W * 0.6, col=LIGHT_BG, lw=1.5)
    cursor -= 14

    # Table columns: Medicine | Dosage | Frequency | Duration | Instructions
    col_ratios = [0.28, 0.18, 0.18, 0.14, 0.22]
    col_xs = [MARGIN]
    for r in col_ratios[:-1]:
        col_xs.append(col_xs[-1] + PAGE_W * r)
    col_ws = [PAGE_W * r for r in col_ratios]
    hdrs = ["Medicine Name", "Dosage", "Frequency", "Duration", "Instructions"]

    ROW_H = 24
    HDR_H = 20

    # Header row
    frect(MARGIN, cursor - HDR_H, PAGE_W, HDR_H, FAFC, BORDER)
    for i, (hdr, cx, cw) in enumerate(zip(hdrs, col_xs, col_ws)):
        txt(cx + 5, cursor - HDR_H + 6, hdr, "Helvetica-Bold", 7.5, MUTED)
    cursor -= HDR_H

    # Data rows
    for row_i, item in enumerate(items):
        row_bg = WHITE if row_i % 2 == 0 else colors.HexColor("#fafbfc")
        frect(MARGIN, cursor - ROW_H, PAGE_W, ROW_H, row_bg, BORDER)

        med_name = (item.get("inventory") or {}).get("name") or item.get("inventory_name", "Unknown")
        dosage    = item.get("dosage", "--") or "--"
        freq      = item.get("frequency", "--") or "--"
        dur       = f"{item.get('duration_days', '--')} Days"
        instrs    = []
        if item.get("before_lunch"): instrs.append("Before lunch")
        if item.get("after_lunch"):  instrs.append("After lunch")
        if item.get("time"):         instrs.append(item["time"])
        instr_str = ", ".join(instrs) or "As directed"

        row_y = cursor - ROW_H + 9
        txt(col_xs[0] + 5, row_y + 5, med_name, "Helvetica-Bold", 8.5, DARK, max_w=col_ws[0] - 8)
        txt(col_xs[1] + 5, row_y + 5, dosage,   "Helvetica", 8.5, DARK, max_w=col_ws[1] - 8)
        txt(col_xs[2] + 5, row_y + 5, freq,      "Helvetica", 8.5, DARK, max_w=col_ws[2] - 8)
        txt(col_xs[3] + 5, row_y + 5, dur,       "Helvetica", 8.5, DARK, max_w=col_ws[3] - 8)
        txt(col_xs[4] + 5, row_y + 5, instr_str, "Helvetica", 8.5, DARK, max_w=col_ws[4] - 8)
        cursor -= ROW_H

    cursor -= 14

    # ══════════════════════════════════════════════════════════════════════════
    # 7.  FOOTER – left: advice | right: signature box (PINNED TO BOTTOM)
    # ══════════════════════════════════════════════════════════════════════════
    FOOTER_LEFT_W  = PAGE_W * 0.60
    FOOTER_RIGHT_W = PAGE_W * 0.36
    FOOTER_H = 120
    BOTTOM_BAR_H = 24
    
    # 1 cm (28.35 pts) gap between footer and bottom bar
    footer_bot = BOTTOM_BAR_H + 28.35
    footer_top = footer_bot + FOOTER_H
    fmid = MARGIN + FOOTER_LEFT_W

    hline(footer_top, col=BORDER)
    frect(MARGIN, footer_bot, PAGE_W, FOOTER_H, FAFC, BORDER)

    # Left: Doctor's Advice
    txt(MARGIN + 10, footer_top - 14, "Doctor's Advice & Instructions",
        "Helvetica-Bold", 9, PRIMARY)

    default_advice = [
        "Maintain a balanced, calorie-deficit diet as discussed.",
        "Ensure adequate hydration (at least 2.5 – 3 liters of water daily).",
        "Incorporate 30 minutes of light to moderate exercise 5 days a week.",
        "Follow up immediately if you experience any severe side effects.",
    ]
    advice_lines = doc_settings.get("advice_lines") or default_advice
    ay = footer_top - 26
    for line in advice_lines[:5]:
        txt(MARGIN + 14, ay, "•", "Helvetica", 9, PRIMARY)
        ay = wrap_text(MARGIN + 22, ay, line, "Helvetica", 8, DARK,
                       FOOTER_LEFT_W - 35, 10)
        ay -= 1

    followup = doc_settings.get("followup_text", "Review after 4 Weeks or earlier if required.")
    txt(MARGIN + 10, footer_bot + 12, f"Next Follow-up:  {followup}",
        "Helvetica-Bold", 8, DARK)

    # Divider
    c.setStrokeColor(BORDER)
    c.setLineWidth(0.5)
    c.line(fmid, footer_bot, fmid, footer_top)

    # Right: Signature box
    sig_x = fmid + 10
    sig_w = FOOTER_RIGHT_W - 10

    # Verified badge
    badge_txt = "✓  Verified e-Prescription"
    badge_bw = c.stringWidth(badge_txt, "Helvetica-Bold", 8) + 16
    frect(sig_x, footer_top - 20, badge_bw, 14, colors.HexColor("#ecfdf5"))
    c.setStrokeColor(colors.HexColor("#a7f3d0"))
    c.setLineWidth(0.5)
    c.rect(sig_x, footer_top - 20, badge_bw, 14, fill=0, stroke=1)
    txt(sig_x + 8, footer_top - 13, badge_txt, "Helvetica-Bold", 8, TEAL)

    # Signature image or blank space
    sig_url = doc_settings.get("signature_url")
    sig_bottom = footer_bot + 30

    if sig_url:
        try:
            sig_img = ImageReader(sig_url)
            sw, sh = sig_img.getSize()
            s_ratio = min(sig_w / sw, 60 / sh)
            sdw, sdh = sw * s_ratio, sh * s_ratio
            sig_img_y = sig_bottom + 6
            c.drawImage(sig_url, sig_x, sig_img_y,
                        width=sdw, height=sdh,
                        preserveAspectRatio=True, mask="auto")
        except Exception:
            pass

    # Sig line
    c.setStrokeColor(DARK)
    c.setLineWidth(0.5)
    c.line(sig_x, sig_bottom, sig_x + sig_w - 4, sig_bottom)
    txt(sig_x + sig_w / 2, sig_bottom - 12, doc_name, "Helvetica-Bold", 9, PRIMARY, "center")
    txt(sig_x + sig_w / 2, sig_bottom - 22, "Signature / Authorization", "Helvetica", 7.5, MUTED, "center")

    # ══════════════════════════════════════════════════════════════════════════
    # 8.  BOTTOM BAR – pinned to very bottom of A4 (y=0)
    # ══════════════════════════════════════════════════════════════════════════
    frect(0, 0, W, BOTTOM_BAR_H, PRIMARY)
    bottom_txt = ("This prescription is confidential and intended solely for "
                  "the patient named above. Generated by GENESTAC THERAPEUTICS LLP.")
    txt(W / 2, 7, bottom_txt, "Helvetica", 7, WHITE, "center")


    c.showPage()
    c.save()
    buf.seek(0)
    return buf.getvalue()
