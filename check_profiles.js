const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data: cols, error: err2 } = await supabase.from('profiles').select('*').limit(1);
  console.log('Profiles Columns:', cols ? Object.keys(cols[0] || {}) : err2);
}
run();
