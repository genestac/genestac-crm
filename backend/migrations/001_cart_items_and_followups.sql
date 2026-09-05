-- ============================================================
-- Genestac CRM — Full Migration Script
-- Run this in Supabase SQL Editor BEFORE deploying new code
-- ============================================================

-- 1. New cart_items table (polymorphic line items: plan OR inventory)
CREATE TABLE IF NOT EXISTS cart_items (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id               UUID NOT NULL REFERENCES cart(id) ON DELETE CASCADE,
  item_type             TEXT NOT NULL CHECK (item_type IN ('plan', 'inventory')),
  plan_id               UUID REFERENCES plans(id),
  plan_variant_id       UUID REFERENCES plan_variants(id),
  inventory_id          UUID REFERENCES inventory(id),
  item_name             TEXT NOT NULL,
  item_description      TEXT,
  quantity              INTEGER NOT NULL DEFAULT 1,
  unit_mrp              NUMERIC NOT NULL DEFAULT 0,
  discount_percentage   NUMERIC NOT NULL DEFAULT 0,
  discounted_unit_price NUMERIC NOT NULL DEFAULT 0,
  gst_percentage        NUMERIC NOT NULL DEFAULT 0,
  gst_amount            NUMERIC NOT NULL DEFAULT 0,
  line_total            NUMERIC NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Upgrade cart table
ALTER TABLE cart
  ADD COLUMN IF NOT EXISTS lead_id  UUID REFERENCES leads(id),
  ADD COLUMN IF NOT EXISTS status   TEXT DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS source   TEXT DEFAULT 'sales_rep',
  ADD COLUMN IF NOT EXISTS notes    TEXT;

-- 3. Upgrade proforma_invoices — link to cart instead of just plan
ALTER TABLE proforma_invoices
  ADD COLUMN IF NOT EXISTS cart_id  UUID REFERENCES cart(id),
  ADD COLUMN IF NOT EXISTS source   TEXT DEFAULT 'sales_rep';

-- 4. Upgrade orders — link to cart for future cart → order conversion
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS cart_id  UUID REFERENCES cart(id);

-- 5. WhatsApp follow-up scheduling on leads
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS whatsapp_followup_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS wa_intake_form_sent   BOOLEAN DEFAULT FALSE;

-- 6. Google Meet / Google Calendar support on doctor_schedules
ALTER TABLE doctor_schedules
  ADD COLUMN IF NOT EXISTS google_calendar_id TEXT;  -- e.g. doctor@genestac.com

-- 7. Google Meet reminder tracking on appointments
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS reminder_sent BOOLEAN DEFAULT FALSE;

-- 8. Performance indexes
CREATE INDEX IF NOT EXISTS idx_cart_lead_id         ON cart(lead_id);
CREATE INDEX IF NOT EXISTS idx_cart_status          ON cart(status);
CREATE INDEX IF NOT EXISTS idx_cart_items_cart_id   ON cart_items(cart_id);
CREATE INDEX IF NOT EXISTS idx_pi_cart_id           ON proforma_invoices(cart_id);
CREATE INDEX IF NOT EXISTS idx_leads_followup       ON leads(whatsapp_followup_at)
  WHERE whatsapp_followup_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_appts_reminder       ON appointments(scheduled_at, reminder_sent)
  WHERE reminder_sent = FALSE AND meeting_link IS NOT NULL;

-- ============================================================
-- OPTIONAL CLEANUP (run manually after verifying data)
-- ============================================================

-- Migrate old leads.lead_status → leads.status if status is null
-- UPDATE leads SET status = lead_status
--   WHERE status IS NULL AND lead_status IS NOT NULL;

-- Then drop the duplicate column:
-- ALTER TABLE leads DROP COLUMN IF EXISTS lead_status;

-- Migrate old leads.source (text) → source_id if needed:
-- (Manual — check user_sources table first)
