import os
import sys
import requests
import json
from dotenv import load_dotenv

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
load_dotenv()

from services.exotel_service import _get_exotel_creds

def debug_call():
    creds = _get_exotel_creds()
    sid, token, api_key, subdomain = creds["sid"], creds["token"], creds["api_key"], creds["subdomain"]
    
    call_sid = "d566366432274fb1beae00171f2d1a7n"
    
    url = f"https://{api_key}:{token}@{subdomain}/v1/Accounts/{sid}/Calls/{call_sid}.json"
    
    res = requests.get(url)
    print("STATUS:", res.status_code)
    print("RESPONSE:", json.dumps(res.json(), indent=2))

if __name__ == "__main__":
    debug_call()
