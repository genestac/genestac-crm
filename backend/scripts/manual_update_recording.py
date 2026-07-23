import os
import sys
from dotenv import load_dotenv

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
load_dotenv()

from db.supabase import get_supabase_client

def update_manual_recording():
    supabase = get_supabase_client()
    call_sid = "d566366432274fb1beae00171f2d1a7n"
    
    # Construct the Exotel dashboard recording URL
    # Assuming account sid is genestac1
    recording_url = f"https://my.exotel.com/genestac1/calls/{call_sid}/recorded.mp3"
    
    res = supabase.table("ai_call_logs").update({"recording_url": recording_url}).eq("call_sid", call_sid).execute()
    print("Updated!", res.data)

if __name__ == "__main__":
    update_manual_recording()
