const fs = require('fs')
const { Pool } = require('pg')

const run = async () => {
  const pool = new Pool({
    connectionString: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
  })

  try {
    const sql = fs.readFileSync('supabase/migrations/20260627000001_consultation_workspace.sql', 'utf8')
    await pool.query(sql)
    console.log('Migration applied successfully')
  } catch (err) {
    console.error('Error applying migration:', err)
  } finally {
    await pool.end()
  }
}

run()
