import os
import sys
from supabase import create_client

# We need the URL and KEY from backend/.env
url = ""
key = ""
with open("c:\\Users\\neele\\Desktop\\genestac\\backend\\.env") as f:
    for line in f:
        if line.startswith("SUPABASE_URL="):
            url = line.strip().split("=", 1)[1]
        elif line.startswith("SUPABASE_KEY="):
            key = line.strip().split("=", 1)[1]

if not url or not key:
    print("Could not find supabase credentials")
    sys.exit(1)

supabase = create_client(url, key)
res = supabase.table("plans").select("*").limit(1).execute()
print(res.data)
