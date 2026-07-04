-- Add GST percentage to plans table
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS gst_percentage NUMERIC(5,2) DEFAULT 5;

-- Add GST tracking to proforma invoices
ALTER TABLE public.proforma_invoices ADD COLUMN IF NOT EXISTS gst_percentage NUMERIC(5,2) DEFAULT 0;
ALTER TABLE public.proforma_invoices ADD COLUMN IF NOT EXISTS gst_amount NUMERIC(10,2) DEFAULT 0;
