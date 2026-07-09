CREATE TABLE IF NOT EXISTS public.system_notifications (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    target_role TEXT, -- e.g., 'doctor', 'admin', 'lead', 'user'
    target_id UUID,   -- e.g., staff_id or user_id
    notification_type TEXT, -- e.g., 'in_app', 'push', 'email'
    title TEXT,
    message TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS policies
ALTER TABLE public.system_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read system_notifications" 
ON public.system_notifications FOR SELECT USING (true);

CREATE POLICY "Allow public insert system_notifications" 
ON public.system_notifications FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow public update system_notifications" 
ON public.system_notifications FOR UPDATE USING (true);
