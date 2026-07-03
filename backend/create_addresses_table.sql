-- ==========================================
-- 1. Create the Addresses Table
-- ==========================================
CREATE TABLE IF NOT EXISTS public.addresses (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    
    house_no text NOT NULL,
    address_line_1 text NOT NULL,
    address_line_2 text,
    landmark text,
    city text NOT NULL,
    state text NOT NULL,
    country text DEFAULT 'India'::text NOT NULL,
    postal_code text NOT NULL,
    
    is_default boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Index for fast user-specific queries
CREATE INDEX IF NOT EXISTS idx_addresses_user_id ON public.addresses(user_id);

-- Trigger to handle automatic updated_at timestamp
CREATE TRIGGER set_updated_at_addresses 
    BEFORE UPDATE ON public.addresses 
    FOR EACH ROW 
    EXECUTE PROCEDURE public.handle_updated_at();

-- ==========================================
-- 2. Link Addresses to Orders Table
-- ==========================================
-- Alter orders table to reference the address used for shipping
ALTER TABLE public.orders 
    ADD COLUMN IF NOT EXISTS shipping_address_id uuid REFERENCES public.addresses(id) ON DELETE SET NULL;

-- Index for joining orders with addresses
CREATE INDEX IF NOT EXISTS idx_orders_shipping_address_id ON public.orders(shipping_address_id);

-- ==========================================
-- 3. Enable Row-Level Security (RLS)
-- ==========================================
ALTER TABLE public.addresses ENABLE ROW LEVEL SECURITY;

-- Allow users to manage their own addresses
CREATE POLICY "Users can manage their own addresses" 
    ON public.addresses 
    FOR ALL 
    TO authenticated 
    USING (auth.uid() = user_id) 
    WITH CHECK (auth.uid() = user_id);

-- Allow service_role to manage all addresses (for backend API bypasses)
CREATE POLICY "Service role has full access to addresses" 
    ON public.addresses 
    FOR ALL 
    TO service_role 
    USING (true) 
    WITH CHECK (true);

-- Allow anonymous users to add addresses if checkout is completed before auth (optional)
-- CREATE POLICY "Anon users can insert addresses" 
--    ON public.addresses 
--    FOR INSERT 
--    TO anon 
--    WITH CHECK (true);
