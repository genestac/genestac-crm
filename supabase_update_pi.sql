-- Run this script in your Supabase SQL Editor to add the required columns for Dynamic PI Numbering

ALTER TABLE public.proforma_invoices 
ADD COLUMN IF NOT EXISTS invoice_number VARCHAR(100),
ADD COLUMN IF NOT EXISTS invoice_date DATE DEFAULT CURRENT_DATE;

-- Optional: Create a unique constraint on invoice_number to prevent duplicate generation
-- (We only apply it where invoice_number is NOT NULL to allow older invoices to remain)
CREATE UNIQUE INDEX IF NOT EXISTS idx_proforma_invoices_number 
ON public.proforma_invoices (invoice_number) 
WHERE invoice_number IS NOT NULL;
