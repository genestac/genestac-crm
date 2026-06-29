-- ==============================================================================
-- GENESTAC THERAPEUTICS - CONSULTATION WORKSPACE MIGRATION
-- ==============================================================================

-- 1. Add fields to appointments
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS title text;
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS type text;
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS related_to text;
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS location text;
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS plan_details jsonb;
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS plan_id uuid REFERENCES public.plans(id);

-- 2. Create patient_reports table for images, PDFs, etc.
CREATE TABLE IF NOT EXISTS public.patient_reports (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    patient_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    uploaded_by uuid REFERENCES public.staffs(id),
    appointment_id uuid REFERENCES public.appointments(id) ON DELETE CASCADE,
    title text NOT NULL,
    file_type text, -- 'image', 'pdf', 'document'
    file_url text NOT NULL, -- S3/Supabase storage url or path
    notes text,
    created_at timestamp with time zone DEFAULT now()
);

-- Enable RLS and setup basic policies (simplistic for now)
ALTER TABLE public.patient_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read access for authenticated users on patient_reports"
ON public.patient_reports FOR SELECT TO authenticated USING (true);

CREATE POLICY "Enable insert for authenticated users on patient_reports"
ON public.patient_reports FOR INSERT TO authenticated WITH CHECK (true);
