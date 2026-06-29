import { createClient } from '@/utils/supabase/server'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { RoleDropdown } from './role-dropdown'
import { AddStaffDialog } from './add-staff-dialog'
import { redirect } from 'next/navigation'

export default async function StaffsPage() {
  const supabase = await createClient()

  // Verify auth & elevated role
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    redirect('/auth')
  }

  const { data: currentUserProfile } = await supabase
    .from('staffs')
    .select('roles(name)')
    .eq('id', user.id)
    .single()

  // @ts-ignore
  const isMasterAdmin = currentUserProfile?.roles?.name === 'master_admin'

  // Fetch all profiles with their roles, excluding customer and support
  const { data: profiles, error: fetchError } = await supabase
    .from('staffs')
    .select('id, full_name, email, roles!inner(name), created_at')
    .not('roles.name', 'in', '("customer","support")')
    .order('created_at', { ascending: false })

  // Fetch all available roles for the Add User dialog
  const { data: roles } = await supabase.from('roles').select('id, name').order('name')

  if (fetchError) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold text-red-500 mb-4">Error loading staffs</h1>
        <p>{fetchError.message}</p>
      </div>
    )
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Staff Management</h1>
          <p className="text-muted-foreground mt-2">
            Manage roles and permissions for all staffs in the system.
          </p>
        </div>
        {isMasterAdmin && roles && (
          <AddStaffDialog roles={roles} />
        )}
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Full Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead>Current Role</TableHead>
              <TableHead>Update Role</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {profiles?.map((profile: any) => {
              const roleName = profile.roles?.name || 'customer';
              return (
              <TableRow key={profile.id}>
                <TableCell className="font-medium">
                  {profile.full_name || 'N/A'}
                </TableCell>
                <TableCell>{profile.email}</TableCell>
                <TableCell>
                  {new Date(profile.created_at).toLocaleDateString()}
                </TableCell>
                <TableCell>
                  <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                    roleName === 'master_admin' ? 'bg-purple-100 text-purple-800' :
                    roleName === 'admin' ? 'bg-blue-100 text-blue-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {roleName.replace('_', ' ').toUpperCase()}
                  </span>
                </TableCell>
                <TableCell>
                  <RoleDropdown 
                    userId={profile.id}
                    currentRole={roleName}
                    isMasterAdmin={isMasterAdmin}
                  />
                </TableCell>
              </TableRow>
            )})}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
