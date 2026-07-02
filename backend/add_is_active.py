import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()
url = os.getenv("SUPABASE_URL")
key = os.getenv("SUPABASE_KEY")

SQL = """
ALTER TABLE public.staffs ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
"""

try:
    project_ref = url.replace("https://", "").split(".")[0]
    db_host = f"db.{project_ref}.supabase.co"
    db_password = key

    conn = psycopg2.connect(
        host=db_host,
        port=5432,
        dbname="postgres",
        user="postgres",
        password=db_password,
        sslmode="require"
    )
    conn.autocommit = True
    cur = conn.cursor()
    cur.execute(SQL)
    cur.close()
    conn.close()
    print("✅ Success adding is_active to staffs")
except Exception as e:
    print(f"Error: {e}")
