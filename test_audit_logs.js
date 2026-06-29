require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function testAuditLogs() {
  console.log("Creating a dummy user to trigger the log...");
  const { data: user, error: userError } = await supabase.from('users').insert({
    phone: '+15555555555',
    name: 'Audit Test User',
    status: 'NEW'
  }).select().single();

  if (userError) {
    console.error("Error creating user:", userError);
    return;
  }

  console.log("User created:", user.id);
  console.log("Updating user...");
  await supabase.from('users').update({ status: 'QUALIFIED' }).eq('id', user.id);
  
  console.log("Fetching latest audit logs...");
  // Use the RPC to get logs
  const { data: logs, error: logsError } = await supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(2);
  
  if (logsError) {
    console.error("Error fetching logs:", logsError);
  } else {
    console.log("Latest Logs:", JSON.stringify(logs, null, 2));
  }
}

testAuditLogs();
