CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    actor_id UUID REFERENCES auth.users(id),
    action TEXT NOT NULL,
    entity_table TEXT NOT NULL,
    entity_id UUID,
    old_data JSONB,
    new_data JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Only authenticated users can view, but in our UI we will only show it to admins.
-- We can enforce RLS simply by requiring auth.uid()
CREATE POLICY "Authenticated users can view audit logs" ON public.audit_logs
    FOR SELECT TO authenticated USING (true);

-- The trigger function to log changes
CREATE OR REPLACE FUNCTION public.handle_audit_log()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.audit_logs (
        actor_id,
        action,
        entity_table,
        entity_id,
        old_data,
        new_data
    ) VALUES (
        auth.uid(),
        TG_OP,
        TG_TABLE_NAME,
        COALESCE(NEW.id, OLD.id),
        CASE WHEN TG_OP = 'DELETE' THEN row_to_json(OLD)::jsonb
             WHEN TG_OP = 'UPDATE' THEN row_to_json(OLD)::jsonb
             ELSE NULL END,
        CASE WHEN TG_OP = 'DELETE' THEN NULL
             ELSE row_to_json(NEW)::jsonb END
    );
    
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Attach trigger to users table
DROP TRIGGER IF EXISTS audit_users_trigger ON public.users;
CREATE TRIGGER audit_users_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.users
FOR EACH ROW EXECUTE FUNCTION public.handle_audit_log();

-- Attach trigger to user_notes table
DROP TRIGGER IF EXISTS audit_user_notes_trigger ON public.user_notes;
CREATE TRIGGER audit_user_notes_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.user_notes
FOR EACH ROW EXECUTE FUNCTION public.handle_audit_log();
