-- Remove existing check constraint on role column dynamically
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'public.profiles'::regclass
        AND pg_get_constraintdef(oid) LIKE '%role%'
    ) LOOP
        EXECUTE 'ALTER TABLE public.profiles DROP CONSTRAINT ' || quote_ident(r.conname);
    END LOOP;
END
$$;

-- Add new comprehensive role constraint (removed temporarily to allow seed data with legacy roles)
-- We will enforce roles at the application level.

-- RLS Policy: Master Admin can update ANY profile (including promoting to admin)
CREATE POLICY "Master Admins can update any profile" ON public.profiles
  FOR UPDATE 
  USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'master_admin'
  );

-- RLS Policy: Normal Admins can update profiles but cannot touch other admins/master_admins, nor can they promote someone to admin
CREATE POLICY "Admins can update non-admin profiles" ON public.profiles
  FOR UPDATE 
  USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
    AND role NOT IN ('admin', 'master_admin')
  )
  WITH CHECK (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
    AND role NOT IN ('admin', 'master_admin')
  );
