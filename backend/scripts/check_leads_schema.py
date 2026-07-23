import os
import sys
from dotenv import load_dotenv

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
load_dotenv()

from db.supabase import get_supabase_client

def check_schema():
    supabase = get_supabase_client()
    res = supabase.table("leads").select("*").limit(1).execute()
    if res.data:
        print(res.data[0].keys())
    else:
        print("No data, cannot infer keys.")

if __name__ == "__main__":
    check_schema()
