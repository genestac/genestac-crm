const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function seed() {
  await supabase.from('role_permissions').delete().neq('role_id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('permissions').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  
  const { error } = await supabase.from('permissions').insert([
    { action: 'Patients:create', module: 'Patients', description: 'Create new patients' },
    { action: 'Patients:read', module: 'Patients', description: 'View patients' },
    { action: 'Patients:update', module: 'Patients', description: 'Update patients' },
    { action: 'Patients:delete', module: 'Patients', description: 'Delete patients' },

    { action: 'Inventory:create', module: 'Inventory', description: 'Create new inventory' },
    { action: 'Inventory:read', module: 'Inventory', description: 'View inventory' },
    { action: 'Inventory:update', module: 'Inventory', description: 'Update inventory' },
    { action: 'Inventory:delete', module: 'Inventory', description: 'Delete inventory' },

    { action: 'Logistics:create', module: 'Logistics', description: 'Create logistics records' },
    { action: 'Logistics:read', module: 'Logistics', description: 'View logistics' },
    { action: 'Logistics:update', module: 'Logistics', description: 'Update logistics' },
    { action: 'Logistics:delete', module: 'Logistics', description: 'Delete logistics' },

    { action: 'Analytics:create', module: 'Analytics', description: 'Create analytics reports' },
    { action: 'Analytics:read', module: 'Analytics', description: 'View analytics' },
    { action: 'Analytics:update', module: 'Analytics', description: 'Update analytics reports' },
    { action: 'Analytics:delete', module: 'Analytics', description: 'Delete analytics reports' }
  ]);
  
  if (error) console.error("Error inserting:", error);
  else console.log("Seeded successfully!");
}

seed();
