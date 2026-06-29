const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data, error } = await supabase.rpc('get_table_info', { table_name: 'leads' });
  if (error) {
    console.error('RPC failed, trying a direct select', error);
    const { data: cols, error: err2 } = await supabase.from('leads').select('*').limit(1);
    console.log('Columns:', cols ? Object.keys(cols[0] || {}) : err2);
  } else {
    console.log(data);
  }
}
run();
