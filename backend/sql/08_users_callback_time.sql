-- Add ai_callback_time column to users table so the AI can schedule
-- callbacks for leads stored in the users table (not just the leads table).
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS ai_callback_time TIMESTAMP WITH TIME ZONE;

-- Create an index for fast polling of due callbacks
CREATE INDEX IF NOT EXISTS idx_users_ai_callback_time ON public.users (ai_callback_time)
    WHERE ai_callback_time IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_leads_ai_callback_time ON public.leads (ai_callback_time)
    WHERE ai_callback_time IS NOT NULL;
