import os
import requests

url = "http://localhost:8000/api/sales/leads?require_followup=true&limit=1"
try:
    from dotenv import load_dotenv
    load_dotenv('backend/.env')
    supabase_url = os.environ.get("SUPABASE_URL")
    supabase_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    
    from supabase import create_client
    supabase = create_client(supabase_url, supabase_key)
    
    # Let's see if there are any leads with next_followup_date
    res = supabase.table('leads').select('id, next_followup_date').not_.is_('next_followup_date', 'null').limit(1).execute()
    print("Leads with followup:", res.data)
    
    if res.data:
        lead_id = res.data[0]['id']
        print(f"Updating lead {lead_id} next_followup_date to None")
        update_res = supabase.table('leads').update({'next_followup_date': None}).eq('id', lead_id).execute()
        print("Update response:", update_res.data)
        
        # Check again
        res2 = supabase.table('leads').select('id, next_followup_date').eq('id', lead_id).execute()
        print("After update:", res2.data)
except Exception as e:
    print(e)
