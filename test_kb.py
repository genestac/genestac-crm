import os
import asyncio
from dotenv import load_dotenv
from supabase import create_client

load_dotenv("backend/.env")
supabase = create_client(os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_KEY"))
res = supabase.table("ai_knowledge_base").select("id", count="exact").execute()
print(f"Total KB items: {res.count}")
