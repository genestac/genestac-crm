"""
Migration: Create 'leads' table on remote Supabase.
Leads from the genestac-website (forms, enquiry popups) will appear in the CRM dashboard.
"""
import os
from supabase import create_client

url = os.getenv("SUPABASE_URL")
key = os.getenv("SUPABASE_KEY")

if not url or not key:
    raise EnvironmentError("SUPABASE_URL or SUPABASE_KEY not set")

supabase = create_client(url, key)

# We use the Postgres REST endpoint via supabase's rpc or raw sql.
# Since the python client doesn't expose raw DDL, we use the postgrest
# management approach: create a stored procedure that runs our DDL,
# then call it, then drop it.

SQL = """
DO $$
BEGIN

  -- Create leads table if not exists
  CREATE TABLE IF NOT EXISTS public.leads (
    id                    uuid NOT NULL DEFAULT gen_random_uuid(),
    name                  text,
    full_name             text,
    email                 text,
    phone                 text,
    phone_number          text,
    status                text NOT NULL DEFAULT 'NEW',
    lead_status           text DEFAULT 'new',
    source                text DEFAULT 'website_form',
    source_id             uuid REFERENCES public.user_sources(id) ON DELETE SET NULL,
    assigned_sales_rep_id uuid REFERENCES public.staffs(id) ON DELETE SET NULL,
    interested_plan_id    uuid REFERENCES public.plans(id) ON DELETE SET NULL,
    priority              text DEFAULT 'MEDIUM',
    next_followup_date    timestamp with time zone,
    followup_notes        text,
    metadata              jsonb,
    created_at            timestamp with time zone DEFAULT now(),
    updated_at            timestamp with time zone DEFAULT now(),

    CONSTRAINT leads_pkey PRIMARY KEY (id)
  );

  -- Add unique constraint on phone_number if not exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'leads_phone_number_unique' AND conrelid = 'public.leads'::regclass
  ) THEN
    ALTER TABLE public.leads ADD CONSTRAINT leads_phone_number_unique UNIQUE (phone_number);
  END IF;

  -- Add check constraints if not exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'leads_priority_check' AND conrelid = 'public.leads'::regclass
  ) THEN
    ALTER TABLE public.leads ADD CONSTRAINT leads_priority_check
      CHECK (priority = ANY (ARRAY['HIGH','MEDIUM','LOW']));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'leads_status_check' AND conrelid = 'public.leads'::regclass
  ) THEN
    ALTER TABLE public.leads ADD CONSTRAINT leads_status_check
      CHECK (status = ANY (ARRAY[
        'NEW','UNREAD','ASSIGNED','CONTACT_ATTEMPTED','CONTACTED',
        'QUALIFIED','CONSULTATION_SCHEDULED','CONSULTATION_COMPLETED',
        'CONVERTED','ON_HOLD','LOST','BLACKLISTED'
      ]));
  END IF;

  -- Auto-updated timestamp trigger
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'update_leads_modtime' AND tgrelid = 'public.leads'::regclass
  ) THEN
    CREATE TRIGGER update_leads_modtime
      BEFORE UPDATE ON public.leads
      FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
  END IF;

  -- Enable RLS
  ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

  -- Drop existing policies to avoid conflicts
  DROP POLICY IF EXISTS "Allow public insert" ON public.leads;
  DROP POLICY IF EXISTS "Sales can read assigned leads" ON public.leads;
  DROP POLICY IF EXISTS "Sales can update their leads" ON public.leads;

  -- Allow anyone (anonymous) to insert from website forms
  CREATE POLICY "Allow public insert" ON public.leads
    FOR INSERT WITH CHECK (true);

  -- Sales reps see their assigned leads + unassigned (shared pool); admins see all
  CREATE POLICY "Sales can read assigned leads" ON public.leads
    FOR SELECT USING (
      assigned_sales_rep_id = auth.uid()
      OR assigned_sales_rep_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.staffs s
        JOIN public.roles r ON s.role_id = r.id
        WHERE s.id = auth.uid()
          AND r.name IN ('superadmin', 'master_admin', 'admin')
      )
    );

  -- Sales reps can update their own leads; admins can update all
  CREATE POLICY "Sales can update their leads" ON public.leads
    FOR UPDATE USING (
      assigned_sales_rep_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.staffs s
        JOIN public.roles r ON s.role_id = r.id
        WHERE s.id = auth.uid()
          AND r.name IN ('superadmin', 'master_admin', 'admin')
      )
    );

END
$$;
"""

print("Creating 'leads' table on remote Supabase...")

try:
    result = supabase.rpc("exec_sql", {"sql": SQL}).execute()
    print("Success via RPC:", result)
except Exception as e:
    # RPC approach might not work — fall back to direct psycopg2
    print(f"RPC exec_sql not available ({e}), trying psycopg2...")
    try:
        import psycopg2
        # Parse the Supabase URL to get the DB host
        # Supabase DB host: db.<project-ref>.supabase.co
        project_ref = url.replace("https://", "").split(".")[0]
        db_host = f"db.{project_ref}.supabase.co"
        db_password = key  # service role key works as password for direct connection

        conn = psycopg2.connect(
            host=db_host,
            port=5432,
            dbname="postgres",
            user="postgres",
            password=db_password,
            sslmode="require"
        )
        conn.autocommit = True
        cur = conn.cursor()
        cur.execute(SQL)
        cur.close()
        conn.close()
        print("✅ Success via psycopg2 direct connection!")
    except Exception as e2:
        print(f"psycopg2 failed ({e2})")
        print("\n⚠️  Please run this SQL manually in your Supabase SQL Editor:")
        print(SQL)

# Verify the table exists
print("\nVerifying table creation...")
try:
    res = supabase.table("leads").select("id", count="exact").limit(1).execute()
    print(f"✅ 'leads' table confirmed! Current row count: {res.count}")
except Exception as e:
    print(f"❌ Verification failed: {e}")
