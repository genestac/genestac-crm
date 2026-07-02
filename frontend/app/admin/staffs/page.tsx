import { fetchAPI } from '@/utils/api'
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

export default async function StaffsPage() {
  let data;
  try {
    data = await fetchAPI('/api/admin/staffs')
  } catch (error: any) {
    if (error.status === 401 || error.status === 403) {
      // Handled by middleware or just show error
    }
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold text-red-500 mb-4">Error loading staffs</h1>
        <p>{error.message}</p>
      </div>
    )
  }

  const { profiles, roles } = data
  const meData = await fetchAPI('/api/admin/staffs/me').catch(() => null)

  // @ts-ignore
  const isMasterAdmin = meData?.data?.roles?.name === 'master_admin' || meData?.data?.roles?.name === 'superadmin'

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
                    roleName === 'master_admin' || roleName === 'superadmin' ? 'bg-purple-100 text-purple-800' :
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
