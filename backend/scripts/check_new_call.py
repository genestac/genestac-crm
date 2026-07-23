import os
import sys
import json
from dotenv import load_dotenv

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
load_dotenv()

from db.supabase import get_supabase_client

def check_db():
    supabase = get_supabase_client()
    call_sid = "fe9539fb8b06ba78d073633953c91a7n"
    
    res = supabase.table("ai_call_logs").select("*").eq("call_sid", call_sid).execute()
    print("DB ROW for NEW call:")
    if res.data:
        for row in res.data:
            print("ID:", row.get("id"))
            print("Status:", row.get("status"))
            print("Recording URL:", row.get("recording_url"))
    else:
        print("Not found")
        
if __name__ == "__main__":
    check_db()
