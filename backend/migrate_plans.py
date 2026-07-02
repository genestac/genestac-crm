import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()
url = os.getenv("SUPABASE_URL").replace("https://", "")
import urllib.parse
password = urllib.parse.quote_plus(os.getenv("DATABASE_PASSWORD"))
db_url = f"postgresql://postgres:{password}@db.{url.split('.')[0]}.supabase.co:5432/postgres"

# Execute SQL for new table
conn = psycopg2.connect(db_url)
conn.autocommit = True
cur = conn.cursor()

try:
    # Check if table already exists
    cur.execute("SELECT 1 FROM information_schema.tables WHERE table_name = 'plan_variants';")
    if not cur.fetchone():
        print("Creating plan_variants table...")
        cur.execute("""
            CREATE TABLE public.plan_variants (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                plan_id UUID NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
                duration_label TEXT NOT NULL,
                duration_days INTEGER NOT NULL,
                base_price NUMERIC NOT NULL,
                discounted_price NUMERIC,
                discount_text TEXT,
                discount_end_date TIMESTAMPTZ,
                is_active BOOLEAN DEFAULT true,
                created_at TIMESTAMPTZ DEFAULT NOW()
            );
        """)
        print("Table created.")
    else:
        print("Table plan_variants already exists.")

    # Migrate existing plans
    print("Fetching existing plans...")
    cur.execute("SELECT id, name, price, duration_value, duration_unit FROM public.plans;")
    plans = cur.fetchall()
    print("Found plans:", plans)
    
    for plan in plans:
        plan_id = plan[0]
        base_price = plan[2]
        d_val = plan[3]
        d_unit = plan[4]
        
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
        cur.execute("SELECT 1 FROM public.plan_variants WHERE plan_id = %s;", (plan_id,))
        if not cur.fetchone():
            print(f"Migrating plan {plan_id} -> {label}, {duration_days} days, {base_price}")
            cur.execute("""
                INSERT INTO public.plan_variants 
                (plan_id, duration_label, duration_days, base_price)
                VALUES (%s, %s, %s, %s)
            """, (plan_id, label, duration_days, base_price))
            
    print("Migration complete!")
except Exception as e:
    print("Error:", e)
finally:
    cur.close()
    conn.close()
