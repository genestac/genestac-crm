const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data, error } = await supabase.from('roles').select('*').limit(1);
  console.log('Tested Roles:', error || 'OK');
  
  const { data: users, error: errU } = await supabase.from('users').select('*').limit(1);
  console.log('Users table exists?', !errU, errU);
  
  const { data: profiles, error: errP } = await supabase.from('profiles').select('*').limit(1);
  console.log('Profiles table exists?', !errP, errP);
}
run();
