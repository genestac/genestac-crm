require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  const { data: users, error } = await supabase.from('users').select('id, name, source, source_id, interested_plan_id').limit(5);
  console.log("Users:", users);
  if (error) console.error("Error:", error);
}

check();
