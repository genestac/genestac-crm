import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()
url = os.getenv("SUPABASE_URL")
key = os.getenv("SUPABASE_KEY")
supabase = create_client(url, key)

try:
    print("Fetching existing plans...")
    res = supabase.table("plans").select("id, name, price, duration_value, duration_unit").execute()
    plans = res.data or []
    print(f"Found {len(plans)} plans.")
    
    for plan in plans:
        plan_id = plan["id"]
        base_price = plan["price"]
        d_val = plan.get("duration_value")
        d_unit = plan.get("duration_unit")
        
        # Determine duration days based on what we had
        duration_days = 30 # Default 1 month
        if d_val and d_unit:
            unit = d_unit.lower()
            if "day" in unit: duration_days = d_val
            elif "week" in unit: duration_days = d_val * 7
            elif "month" in unit: duration_days = d_val * 30
            elif "year" in unit: duration_days = d_val * 365
        
        # Determine label
        label = "1 Month"
        if duration_days == 30: label = "1 Month"
        elif duration_days == 90: label = "3 Months"
        elif duration_days == 180: label = "6 Months"
        elif duration_days == 365: label = "Yearly"
        else: label = f"{duration_days} Days"

        # Check if a variant already exists for this plan
        existing = supabase.table("plan_variants").select("id").eq("plan_id", plan_id).execute()
        if not existing.data:
            print(f"Migrating plan {plan_id} -> {label}, {duration_days} days, {base_price}")
            
            # Since user said each has 1 month and 3 months, maybe we insert two variants for each existing plan just as an example, 
            # but actually let's just migrate what is actually on the row right now. 
            # If the user meant "I have 3 plans, and each actually has two pricing options but I couldn't save them", 
            # we'll just insert the one we have, and they can easily add the second variant via the UI.
            
            payload = {
                "plan_id": plan_id,
                "duration_label": label,
                "duration_days": duration_days,
                "base_price": base_price
            }
            supabase.table("plan_variants").insert(payload).execute()
            
    print("Migration complete!")
except Exception as e:
    print("Error:", e)
