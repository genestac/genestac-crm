import os
from supabase import create_client

url = os.getenv("SUPABASE_URL")
key = os.getenv("SUPABASE_KEY")

if not url or not key:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_KEY")

supabase = create_client(url, key)

SQL = """
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS user_id uuid;
"""

try:
    result = supabase.rpc("exec_sql", {"sql": SQL}).execute()
    print("Success via RPC:", result)
except Exception as e:
    print(f"RPC exec_sql not available ({e}), trying psycopg2...")
    try:
        import psycopg2
        project_ref = url.replace("https://", "").split(".")[0]
        db_host = f"db.{project_ref}.supabase.co"
        
        conn = psycopg2.connect(
            host=db_host,
            port=5432,
            dbname="postgres",
            user="postgres",
            password=key,
            sslmode="require"
        )
        conn.autocommit = True
        cur = conn.cursor()
        cur.execute(SQL)
        cur.close()
        conn.close()
        print("Success via psycopg2!")
    except Exception as e2:
        print(f"psycopg2 failed ({e2})")
