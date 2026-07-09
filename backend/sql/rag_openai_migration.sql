-- Migrate vector dimension from 768 (Gemini) to 1536 (OpenAI text-embedding-3-small)
-- Run this in your Supabase SQL Editor ONLY if you ran the previous migration.
-- This drops and recreates the column + function with the correct dimension.

-- Step 1: Drop the old embedding column
alter table public.ai_knowledge_base drop column if exists embedding;

-- Step 2: Add the new column with 1536 dimensions (OpenAI text-embedding-3-small)
alter table public.ai_knowledge_base add column embedding vector(1536);

-- Step 3: Drop the old match function
drop function if exists match_knowledge_base;

-- Step 4: Recreate with 1536 dimensions
create or replace function match_knowledge_base (
  query_embedding vector(1536),
  match_threshold float,
  match_count int
)
returns table (
  id uuid,
  title text,
  content text,
  similarity float
)
language sql stable
as $$
  select
    ai_knowledge_base.id,
    ai_knowledge_base.title,
    ai_knowledge_base.content,
    1 - (ai_knowledge_base.embedding <=> query_embedding) as similarity
  from ai_knowledge_base
  where 1 - (ai_knowledge_base.embedding <=> query_embedding) > match_threshold
  order by ai_knowledge_base.embedding <=> query_embedding
  limit match_count;
$$;
