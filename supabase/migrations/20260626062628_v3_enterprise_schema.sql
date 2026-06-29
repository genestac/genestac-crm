-- ==============================================================================
-- GENESTAC THERAPEUTICS - ENTERPRISE INTEGRATED SCHEMA (V3 MIGRATION)
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==============================================================================
-- 1. DYNAMIC RBAC (Role-Based Access Control)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS roles (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text UNIQUE NOT NULL, -- e.g., 'master_admin', 'sales', 'doctor', 'inventory_manager'
    description text,
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS permissions (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    action text UNIQUE NOT NULL, -- e.g., 'edit_prescription', 'view_all_leads', 'manage_inventory'
    description text
);

CREATE TABLE IF NOT EXISTS role_permissions (
    role_id uuid REFERENCES roles(id) ON DELETE CASCADE,
    permission_id uuid REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

-- Seed Default Roles
INSERT INTO roles (name, description) VALUES 
('master_admin', 'Master Admin with supreme authorities'),
('admin', 'General Admin'),
('doctor', 'Medical Professional'),
('sales', 'Sales Representative'),
('inventory_manager', 'Inventory Manager'),
('customer', 'Patient or standard user'),
('manager', 'CRM Manager'),
('support', 'Customer Support')
ON CONFLICT (name) DO NOTHING;

-- ==============================================================================
-- 2. CORE PROFILES & LEADS (ALTERATIONS & DATA MIGRATION)
-- ==============================================================================

-- Add new architectural columns to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS role_id uuid REFERENCES roles(id);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS date_of_birth date;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS gender text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_url text;

-- Data Migration: Move existing string 'role' to 'role_id'
UPDATE profiles p
SET role_id = r.id
FROM roles r
WHERE p.role = r.name;

-- Fallback for any orphaned profiles to 'customer'
UPDATE profiles SET role_id = (SELECT id FROM roles WHERE name = 'customer') WHERE role_id IS NULL;

-- Create Leads table
CREATE TABLE IF NOT EXISTS leads (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    source text NOT NULL, -- 'Meta', 'Excel', 'Twilio_Bot', 'Website'
    status text DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'in_consultation', 'converted', 'dead')),
    phone text NOT NULL,
    metadata jsonb, -- Flexible storage for WhatsApp bot payloads or raw FB lead data
    assigned_sales_rep_id uuid REFERENCES profiles(id),
    converted_patient_id uuid REFERENCES profiles(id), -- Linked once they register
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- ==============================================================================
-- 3. COMMUNICATIONS & TWILIO/n8n INTEGRATION
-- ==============================================================================
CREATE TABLE IF NOT EXISTS communications (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    lead_id uuid REFERENCES leads(id),
    patient_id uuid REFERENCES profiles(id),
    sales_rep_id uuid REFERENCES profiles(id),
    doctor_id uuid REFERENCES profiles(id),
    
    twilio_sid text UNIQUE,
    call_status text,
    recording_url text, -- Cloudinary / S3 URL
    duration_seconds integer,
    
    internal_notes text,
    created_at timestamptz DEFAULT now()
);

-- ==============================================================================
-- 4. LONGITUDINAL CLINICAL RECORDS (DATA MIGRATION)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS clinical_assessments (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    patient_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    recorded_by uuid REFERENCES profiles(id), -- Nullable initially since migrated records might be self-reported
    communication_id uuid REFERENCES communications(id), 
    
    weight_kg numeric,
    height_cm numeric,
    blood_pressure text,
    
    conditions jsonb DEFAULT '{}'::jsonb,
    current_medications text,
    doctor_timeline_notes text, 
    
    created_at timestamptz DEFAULT now()
);

-- Data Migration: Migrate legacy static medical conditions to first clinical assessment
INSERT INTO clinical_assessments (patient_id, recorded_by, weight_kg, height_cm, conditions, current_medications)
SELECT 
    id, 
    id, -- Treated as self-reported initially
    weight, 
    height, 
    jsonb_build_object(
        'diabetes', diabetes,
        'thyroid', thyroid,
        'pcos', pcos,
        'fatty_liver', "fatty liver",
        'pancreatitis', pancreatitis,
        'kidney_disease', "kidney disease"
    ),
    "current medication"
FROM profiles
WHERE weight IS NOT NULL OR height IS NOT NULL OR diabetes IS NOT NULL OR pcos IS NOT NULL OR thyroid IS NOT NULL OR "fatty liver" IS NOT NULL OR pancreatitis IS NOT NULL OR "kidney disease" IS NOT NULL OR "current medication" IS NOT NULL;

-- DROP legacy policies that depend on the old role column
DROP POLICY IF EXISTS "Master Admins can update any profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update non-admin profiles" ON public.profiles;

-- CLEANUP: Drop legacy columns
ALTER TABLE profiles DROP COLUMN IF EXISTS "role";
ALTER TABLE profiles DROP COLUMN IF EXISTS "age";
ALTER TABLE profiles DROP COLUMN IF EXISTS "height";
ALTER TABLE profiles DROP COLUMN IF EXISTS "weight";
ALTER TABLE profiles DROP COLUMN IF EXISTS "diabetes";
ALTER TABLE profiles DROP COLUMN IF EXISTS "thyroid";
ALTER TABLE profiles DROP COLUMN IF EXISTS "pcos";
ALTER TABLE profiles DROP COLUMN IF EXISTS "fatty liver";
ALTER TABLE profiles DROP COLUMN IF EXISTS "pancreatitis";
ALTER TABLE profiles DROP COLUMN IF EXISTS "kidney disease";
ALTER TABLE profiles DROP COLUMN IF EXISTS "current medication";

-- RECREATE POLICIES with new role_id logic
CREATE POLICY "Master Admins can update any profile" ON public.profiles
  FOR UPDATE 
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p 
      JOIN public.roles r ON p.role_id = r.id 
      WHERE p.id = auth.uid() AND r.name = 'master_admin'
    )
  );

CREATE POLICY "Admins can update non-admin profiles" ON public.profiles
  FOR UPDATE 
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p 
      JOIN public.roles r ON p.role_id = r.id 
      WHERE p.id = auth.uid() AND r.name = 'admin'
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.roles r WHERE r.id = profiles.role_id AND r.name IN ('admin', 'master_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p 
      JOIN public.roles r ON p.role_id = r.id 
      WHERE p.id = auth.uid() AND r.name = 'admin'
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.roles r WHERE r.id = profiles.role_id AND r.name IN ('admin', 'master_admin')
    )
  );

-- ==============================================================================
-- 5. IMMUTABLE PRESCRIPTIONS & INVENTORY ENHANCEMENTS
-- ==============================================================================
CREATE TABLE IF NOT EXISTS prescriptions (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    patient_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    doctor_id uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
    communication_id uuid REFERENCES communications(id),
    
    status text DEFAULT 'active' CHECK (status IN ('active', 'superseded', 'cancelled', 'completed')),
    superseded_by_id uuid REFERENCES prescriptions(id), 
    
    valid_until date,
    general_instructions text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Inventory Enhancements
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS sku text UNIQUE;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS min_stock_threshold integer DEFAULT 10;
-- We don't drop existing 'requires_prescription' or 'stock_quantity' as they already exist

CREATE TABLE IF NOT EXISTS prescription_items (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    prescription_id uuid NOT NULL REFERENCES prescriptions(id) ON DELETE CASCADE,
    inventory_id uuid NOT NULL REFERENCES inventory(id),
    
    dosage text NOT NULL,
    frequency text NOT NULL,
    duration_days integer NOT NULL,
    total_quantity_prescribed integer NOT NULL
);

-- ==============================================================================
-- 6. UTILITY & TRIGGERS
-- ==============================================================================
CREATE OR REPLACE FUNCTION handle_updated_at() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_profiles_modtime ON profiles;
CREATE TRIGGER update_profiles_modtime BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

DROP TRIGGER IF EXISTS update_leads_modtime ON leads;
CREATE TRIGGER update_leads_modtime BEFORE UPDATE ON leads FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

DROP TRIGGER IF EXISTS update_prescriptions_modtime ON prescriptions;
CREATE TRIGGER update_prescriptions_modtime BEFORE UPDATE ON prescriptions FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

DROP TRIGGER IF EXISTS update_inventory_modtime ON inventory;
CREATE TRIGGER update_inventory_modtime BEFORE UPDATE ON inventory FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
