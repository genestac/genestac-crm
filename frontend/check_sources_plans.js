require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  const { data: sources } = await supabase.from('user_sources').select('*');
  console.log("Sources:", sources);
  const { data: plans } = await supabase.from('plans').select('*');
  console.log("Plans:", plans);
}

check();
