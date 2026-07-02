-- ==============================================================================
-- GENESTAC THERAPEUTICS - INTEGRATED PRODUCTION DATABASE SCHEMA (V2 DRAFT)
-- ==============================================================================
-- This schema integrates your existing current tables (profiles, inventory, 
-- subscriptions, whatsapp_profiles) with future architectural requirements 
-- (appointments, prescriptions, orders, audit logging) for a full CRM/Admin/Doctor app.
-- 
-- INSTRUCTIONS: 
-- Review this file, add any additional fields you need, and once finalized, 
-- we can run it as a new migration.
-- ==============================================================================

-- 1. EXTENSIONS & CUSTOM TYPES
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 2. UNIFIED USER MANAGEMENT (Current + Enhanced)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.profiles (
    id uuid NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name text,
    email text NOT NULL UNIQUE,
    phone text UNIQUE,
    
    -- Location
    address text,
    city text,
    state text,
    pincode text,
    
    -- Role Based Access Control (RBAC)
    role text DEFAULT 'customer'::text,
    
    -- Medical & Demographic Data (Current schema integrated)
    age numeric,
    height numeric,
    weight numeric,
    diabetes boolean DEFAULT false,
    thyroid boolean DEFAULT false,
    pcos boolean DEFAULT false,
    fatty_liver boolean DEFAULT false,
    pancreatitis boolean DEFAULT false,
    kidney_disease boolean DEFAULT false,
    current_medication text,
    
    -- Metadata
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- ==============================================================================
-- 3. INVENTORY & PRODUCT MANAGEMENT (Current + Enhanced)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.inventory (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL,
    manufacturer text,
    category text,
    price numeric NOT NULL CHECK (price >= 0),
    stock_quantity integer NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
    requires_prescription boolean DEFAULT false,
    
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- ==============================================================================
-- 4. APPOINTMENTS & TELEMEDICINE (Future)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.appointments (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    patient_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    doctor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    
    scheduled_at timestamp with time zone NOT NULL,
    duration_minutes integer DEFAULT 30,
    status text DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'cancelled', 'no_show')),
    
    meeting_link text,
    doctor_notes text,
    patient_complaint text,
    
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- ==============================================================================
-- 5. PRESCRIPTIONS (Future)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.prescriptions (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
    patient_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    doctor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    
    diagnosis text,
    valid_until date,
    status text DEFAULT 'active' CHECK (status IN ('active', 'fulfilled', 'expired', 'revoked')),
    
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.prescription_items (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    prescription_id uuid NOT NULL REFERENCES public.prescriptions(id) ON DELETE CASCADE,
    inventory_id uuid NOT NULL REFERENCES public.inventory(id) ON DELETE RESTRICT,
    
    dosage text NOT NULL,
    frequency text NOT NULL,
    duration_days integer,
    quantity_prescribed integer NOT NULL CHECK (quantity_prescribed > 0)
);

-- ==============================================================================
-- 6. E-COMMERCE & ORDERS (Future)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.orders (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    customer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    sales_rep_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL, -- If assisted by sales
    prescription_id uuid REFERENCES public.prescriptions(id), -- If order contains Rx meds
    
    total_amount numeric NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
    status text DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'shipped', 'delivered', 'cancelled')),
    payment_status text DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'paid', 'refunded', 'failed')),
    
    shipping_address text,
    tracking_number text,
    
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.order_items (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    inventory_id uuid NOT NULL REFERENCES public.inventory(id) ON DELETE RESTRICT,
    
    quantity integer NOT NULL CHECK (quantity > 0),
    unit_price numeric NOT NULL CHECK (unit_price >= 0),
    total_price numeric GENERATED ALWAYS AS (quantity * unit_price) STORED
);

-- ==============================================================================
-- 7. SUBSCRIPTIONS (Current + Enhanced)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.subscriptions (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    medicine_id uuid NOT NULL REFERENCES public.inventory(id) ON DELETE RESTRICT,
    
    plan_type text NOT NULL, -- e.g., 'monthly', 'quarterly'
    quantity integer NOT NULL CHECK (quantity > 0),
    status text DEFAULT 'active' CHECK (status IN ('active', 'paused', 'cancelled', 'completed')),
    
    start_date date DEFAULT CURRENT_DATE NOT NULL,
    end_date date,
    next_delivery_date date,
    
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- ==============================================================================
-- 8. WHATSAPP LEADS & CRM ENTRY (Current)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.whatsapp_profiles (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    phone text NOT NULL UNIQUE,
    full_name text,
    age text,
    height_cm text,
    weight_kg text,
    city text,
    diabetes text,
    thyroid_disease text,
    pcos text,
    fatty_liver text,
    pancreatitis text,
    kidney_disease text,
    current_medications text,
    profile_complete boolean DEFAULT false,
    
    -- Foreign key to actual profile if they convert to a registered user
    converted_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.processed_messages (
    message_id text NOT NULL PRIMARY KEY,
    created_at timestamp with time zone DEFAULT now()
);

-- ==============================================================================
-- 9. AUDIT LOGGING (Future - Enterprise Requirement)
-- ==============================================================================
-- Essential for HIPAA/Medical compliance to track who viewed/changed what

CREATE TABLE IF NOT EXISTS public.audit_logs (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    actor_id uuid REFERENCES public.profiles(id), -- User who made the change
    action text NOT NULL, -- e.g., 'UPDATE_ROLE', 'VIEW_PRESCRIPTION'
    entity_table text NOT NULL,
    entity_id uuid,
    old_data jsonb,
    new_data jsonb,
    ip_address text,
    created_at timestamp with time zone DEFAULT now()
);

-- ==============================================================================
-- 10. INDEXES FOR PRODUCTION PERFORMANCE
-- ==============================================================================

CREATE INDEX idx_profiles_role ON public.profiles(role);
CREATE INDEX idx_appointments_doctor ON public.appointments(doctor_id);
CREATE INDEX idx_appointments_patient ON public.appointments(patient_id);
CREATE INDEX idx_orders_customer ON public.orders(customer_id);
CREATE INDEX idx_subscriptions_user ON public.subscriptions(user_id);
CREATE INDEX idx_audit_logs_actor ON public.audit_logs(actor_id);
CREATE INDEX idx_audit_logs_entity ON public.audit_logs(entity_table, entity_id);

-- ==============================================================================
-- 11. AUTOMATIC UPDATED_AT TRIGGERS
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to all relevant tables
CREATE TRIGGER set_updated_at_profiles BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();
CREATE TRIGGER set_updated_at_inventory BEFORE UPDATE ON public.inventory FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();
CREATE TRIGGER set_updated_at_appointments BEFORE UPDATE ON public.appointments FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();
CREATE TRIGGER set_updated_at_orders BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();
CREATE TRIGGER set_updated_at_subscriptions BEFORE UPDATE ON public.subscriptions FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();
