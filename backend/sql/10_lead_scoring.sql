-- 10_lead_scoring.sql
-- Add AI lead scoring columns to ai_call_logs table

ALTER TABLE ai_call_logs
    ADD COLUMN IF NOT EXISTS lead_score   INTEGER DEFAULT NULL,     -- 0-100 warmth score
    ADD COLUMN IF NOT EXISTS score_label  VARCHAR(10) DEFAULT NULL, -- 'Cold', 'Warm', 'Hot'
    ADD COLUMN IF NOT EXISTS score_reason TEXT DEFAULT NULL;        -- Brief explanation for the score
