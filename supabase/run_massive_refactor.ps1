$queries = @(
    "ALTER TABLE IF EXISTS public.profiles RENAME TO staffs;",
    "CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS `$`$ BEGIN INSERT INTO public.staffs (id, full_name, email) VALUES (new.id, new.raw_user_meta_data->>'full_name', new.email); RETURN new; END; `$`$;",
    "DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;",
    "CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();",
    "ALTER TABLE IF EXISTS public.leads RENAME TO users;",
    "ALTER TABLE IF EXISTS public.lead_documents RENAME TO user_documents;",
    "ALTER TABLE IF EXISTS public.user_documents RENAME COLUMN lead_id TO user_id;",
    "CREATE TABLE IF NOT EXISTS public.user_sources (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT NOT NULL, is_active BOOLEAN DEFAULT true, created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL);",
    "CREATE TABLE IF NOT EXISTS public.plans (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT NOT NULL, price NUMERIC NOT NULL DEFAULT 0, is_active BOOLEAN DEFAULT true, created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL);",
    "ALTER TABLE public.users ADD COLUMN IF NOT EXISTS name TEXT;",
    "ALTER TABLE public.users ADD COLUMN IF NOT EXISTS email TEXT;",
    "ALTER TABLE public.users ADD COLUMN IF NOT EXISTS street_address TEXT;",
    "ALTER TABLE public.users ADD COLUMN IF NOT EXISTS city TEXT;",
    "ALTER TABLE public.users ADD COLUMN IF NOT EXISTS state TEXT;",
    "ALTER TABLE public.users ADD COLUMN IF NOT EXISTS postal_code TEXT;",
    "ALTER TABLE public.users ADD COLUMN IF NOT EXISTS country TEXT;",
    "ALTER TABLE public.users ADD COLUMN IF NOT EXISTS interested_plan_id UUID REFERENCES public.plans(id);",
    "ALTER TABLE public.users ADD COLUMN IF NOT EXISTS source_id UUID REFERENCES public.user_sources(id);",
    "INSERT INTO public.user_sources (name) VALUES ('Website'), ('Meta Ads'), ('Referral'), ('Manual Entry') ON CONFLICT DO NOTHING;",
    "INSERT INTO public.plans (name, price) VALUES ('Basic Consultation', 499), ('Premium Health Check', 1999) ON CONFLICT DO NOTHING;"
)

foreach ($query in $queries) {
    Write-Host "Running query: $query"
    npx supabase db query $query
}
