require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function migrateNotes() {
  const { data: users, error } = await supabase.from('users').select('id, followup_notes, assigned_sales_rep_id').not('followup_notes', 'is', null).neq('followup_notes', '');
  if (error) {
    console.error(error);
    return;
  }
  
  console.log(`Found ${users.length} users with legacy notes.`);
  for (const user of users) {
    // Check if a note already exists to prevent duplicate migration
    const { data: existing } = await supabase.from('user_notes').select('id').eq('user_id', user.id).limit(1);
    if (existing && existing.length > 0) continue;
    
    // We need an author_id. If assigned_sales_rep_id is null, we can't migrate easily without an author.
    // Let's check if assigned_sales_rep_id is present.
    if (!user.assigned_sales_rep_id) continue;

    await supabase.from('user_notes').insert({
      user_id: user.id,
      author_id: user.assigned_sales_rep_id,
      content: user.followup_notes
    });
  }
  console.log('Migration complete.');
}

migrateNotes();
