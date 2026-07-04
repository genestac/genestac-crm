-- Create a new table for global CRM settings
CREATE TABLE IF NOT EXISTS global_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    settings_key TEXT UNIQUE NOT NULL,
    settings_value JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Insert the default 'invoice_settings' configuration
INSERT INTO global_settings (settings_key, settings_value)
VALUES (
    'invoice_settings', 
    '{"prefix": "Gen/26-27/", "current_sequence": 2, "declaration": "We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct."}'::jsonb
)
ON CONFLICT (settings_key) 
DO UPDATE SET settings_value = EXCLUDED.settings_value;

-- Set up RLS policies (optional, but good practice. Since backend uses Service Role key, it bypasses RLS)
ALTER TABLE global_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read access for authenticated users" 
ON global_settings FOR SELECT 
TO authenticated 
USING (true);
