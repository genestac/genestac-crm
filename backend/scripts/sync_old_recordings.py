import os
import sys
import requests
import json
from dotenv import load_dotenv

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
load_dotenv()

from db.supabase import get_supabase_client
from services.exotel_service import _get_exotel_creds

def sync_old_recordings():
    supabase = get_supabase_client()
    
    # 1. Fetch old logs missing recording_url
    logs_res = supabase.table("ai_call_logs").select("*").is_("recording_url", "null").not_.is_("call_sid", "null").eq("status", "completed").execute()
    logs = logs_res.data
    
    if not logs:
        print("No old completed calls missing recording_url found.")
        return
        
    print(f"Found {len(logs)} old call logs to sync.")
    
    # 2. Get Exotel creds
    creds = _get_exotel_creds()
    sid, token, api_key, subdomain = creds["sid"], creds["token"], creds["api_key"], creds["subdomain"]
    
    if not sid or not token or not api_key:
        print("Error: Exotel credentials not found.")
        return
        
    synced_count = 0
    for log in logs:
        call_sid = log["call_sid"]
        url = f"https://{api_key}:{token}@{subdomain}/v1/Accounts/{sid}/Calls/{call_sid}.json"
        
        try:
            res = requests.get(url)
            if res.status_code == 200:
                call_data = res.json().get("Call", {})
                recording_url = call_data.get("RecordingUrl")
                if recording_url:
                    # Update database
                    supabase.table("ai_call_logs").update({"recording_url": recording_url}).eq("id", log["id"]).execute()
                    print(f"Synced RecordingUrl for {call_sid}")
                    synced_count += 1
                else:
                    print(f"No RecordingUrl in Exotel response for {call_sid}")
            else:
                print(f"Failed to fetch {call_sid} from Exotel: HTTP {res.status_code} - {res.text}")
        except Exception as e:
            print(f"Error syncing {call_sid}: {e}")
            
    print(f"\nDone! Successfully synced {synced_count} old recordings.")

if __name__ == "__main__":
    sync_old_recordings()
