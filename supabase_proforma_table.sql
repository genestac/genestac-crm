CREATE TABLE IF NOT EXISTS public.proforma_invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    sales_rep_id UUID REFERENCES public.staffs(id) ON DELETE SET NULL,
    plan_id UUID REFERENCES public.plans(id) ON DELETE SET NULL,
    base_price NUMERIC(10,2) NOT NULL,
    discount_percentage NUMERIC(5,2) DEFAULT 0,
    total_amount NUMERIC(10,2) NOT NULL,
    razorpay_link_id VARCHAR(255),
    razorpay_url TEXT,
    status VARCHAR(50) DEFAULT 'PENDING',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Note: RLS (Row Level Security) might need to be configured based on your current setup.
-- If RLS is disabled across the board, this is fine. Otherwise, enable it and add policies.
