-- Enable pgvector extension for RAG
CREATE EXTENSION IF NOT EXISTS vector;

-- 1. AI Knowledge Base for RAG (Company Info, Products, FAQs)
CREATE TABLE IF NOT EXISTS ai_knowledge_base (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category VARCHAR(50) NOT NULL, -- 'COMPANY_INFO', 'PRODUCT', 'FAQ', 'OBJECTION_HANDLING'
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    embedding vector(1536), -- For OpenAI text-embedding-ada-002 or text-embedding-3-small
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. AI Call Logs (History of AI calls made to leads)
CREATE TABLE IF NOT EXISTS ai_call_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
    call_sid VARCHAR(100),
    status VARCHAR(50), -- 'completed', 'failed', 'no-answer', etc.
    recording_url TEXT,
    duration INTEGER,
    transcript TEXT,
    summary TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Lead Context Memory for RAG (AI memory of past interactions with specific leads)
CREATE TABLE IF NOT EXISTS lead_context_memory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
    memory_text TEXT NOT NULL,
    embedding vector(1536),
    source_call_id UUID REFERENCES ai_call_logs(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Doctor Schedules (For AI to know when to book or transfer calls)
CREATE TABLE IF NOT EXISTS doctor_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_id UUID REFERENCES staffs(id) ON DELETE CASCADE UNIQUE,
    exotel_number VARCHAR(20), -- Phone number the AI can transfer to
    available_days TEXT[], -- e.g., ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
    start_time TIME,
    end_time TIME,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Note: The `ai_call_settings` (statuses, AI prompt context, scheduling config) 
-- will be stored in the existing `global_settings` table as a JSON object under the key 'ai_call_settings'.
