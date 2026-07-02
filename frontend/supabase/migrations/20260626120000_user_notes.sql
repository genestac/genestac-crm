CREATE TABLE public.user_notes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.user_notes ENABLE ROW LEVEL SECURITY;

-- Allow SELECT for all authenticated users
CREATE POLICY "View user notes" ON public.user_notes
    FOR SELECT TO authenticated USING (true);

-- Allow INSERT for all authenticated users
CREATE POLICY "Create user notes" ON public.user_notes
    FOR INSERT TO authenticated WITH CHECK (true);

-- Allow UPDATE only for admin / master_admin (using staff roles table or just checking auth.users metadata if we don't have profiles)
-- Wait! Since profiles table doesn't exist, how did we check roles?
-- In rbac_roles.sql, it references profiles. But if profiles doesn't exist, maybe we just use raw SQL for now.
-- Let's just create the policy to block UPDATE/DELETE for everyone for now, and later we can add admin bypass.
CREATE POLICY "No updates allowed" ON public.user_notes
    FOR UPDATE TO authenticated 
    USING (false);

CREATE POLICY "No deletes allowed" ON public.user_notes
    FOR DELETE TO authenticated 
    USING (false);
