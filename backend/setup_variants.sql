CREATE TABLE IF NOT EXISTS public.plan_variants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    plan_id UUID NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
    duration_label TEXT NOT NULL,
    duration_days INTEGER NOT NULL,
    base_price NUMERIC NOT NULL,
    discounted_price NUMERIC,
    discount_text TEXT,
    discount_end_date TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Note: Existing plans will be migrated automatically after this table is created.
