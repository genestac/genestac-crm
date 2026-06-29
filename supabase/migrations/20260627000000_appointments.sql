-- ==============================================================================
-- GENESTAC THERAPEUTICS - APPOINTMENTS MIGRATION
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.appointments (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    
    -- patient_id references users (formerly leads/patients)
    patient_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
    
    doctor_id uuid NOT NULL REFERENCES public.staffs(id) ON DELETE RESTRICT,
    sales_rep_id uuid NOT NULL REFERENCES public.staffs(id) ON DELETE RESTRICT,
    
    scheduled_at timestamp with time zone NOT NULL,
    duration_minutes integer DEFAULT 30,
    
    status text DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'completed', 'cancelled', 'rejected')),
    
    meeting_link text,
    notes text,
    
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- Ensure updated_at is kept fresh
DROP TRIGGER IF EXISTS update_appointments_modtime ON public.appointments;
CREATE TRIGGER update_appointments_modtime 
BEFORE UPDATE ON public.appointments 
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- RLS
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

-- Sales reps can view and create appointments they booked
CREATE POLICY "Sales can manage their own booked appointments" ON public.appointments
    FOR ALL
    USING (sales_rep_id = auth.uid())
    WITH CHECK (sales_rep_id = auth.uid());

-- Doctors can view and update appointments assigned to them
CREATE POLICY "Doctors can manage their own appointments" ON public.appointments
    FOR ALL
    USING (doctor_id = auth.uid())
    WITH CHECK (doctor_id = auth.uid());

-- Master Admins and Admins can see everything
CREATE POLICY "Admins can view all appointments" ON public.appointments
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.staffs p 
            JOIN public.roles r ON p.role_id = r.id 
            WHERE p.id = auth.uid() AND r.name IN ('admin', 'master_admin')
        )
    );

CREATE POLICY "Admins can manage all appointments" ON public.appointments
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.staffs p 
            JOIN public.roles r ON p.role_id = r.id 
            WHERE p.id = auth.uid() AND r.name IN ('admin', 'master_admin')
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.staffs p 
            JOIN public.roles r ON p.role_id = r.id 
            WHERE p.id = auth.uid() AND r.name IN ('admin', 'master_admin')
        )
    );
