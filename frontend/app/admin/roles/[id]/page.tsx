import { fetchAPI } from '@/utils/api'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { RoleModulePermissions } from './role-module-permissions'
import { AddModuleDialog } from '../add-module-dialog'

export default async function RoleConfigPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  let data;
  try {
    data = await fetchAPI(`/api/admin/roles/${id}`)
  } catch (error: any) {
    if (error.status === 401 || error.status === 403) redirect('/auth?error=unauthorized')
    redirect('/admin/roles')
  }

  const { role, permissions, role_permissions: rolePermissions, currentUserProfile } = data

  // @ts-ignore
  const isMasterAdmin = currentUserProfile?.roles?.name === 'master_admin' || currentUserProfile?.roles?.name === 'superadmin'
  if (!isMasterAdmin) redirect('/auth?error=unauthorized')

  if (!role) redirect('/admin/roles')

  const activePermissionIds = new Set(rolePermissions?.map((rp: any) => rp.permission_id) || [])

  // Group permissions by module
  const modulesMap = new Map<string, any[]>()
  permissions?.forEach(p => {
    const moduleName = p.module || 'General'
    if (!modulesMap.has(moduleName)) {
      modulesMap.set(moduleName, [])
    }
    modulesMap.get(moduleName)?.push(p)
  })

  const modules = Array.from(modulesMap.entries()).map(([name, perms]) => ({
    name,
    permissions: perms
  }))

  return (
    <div className="max-w-4xl mx-auto pb-12">
      <Link href="/admin/roles" className="inline-flex items-center text-sm text-gray-500 hover:text-gray-900 mb-6">
        <ArrowLeft className="w-4 h-4 mr-1" /> Back to Roles
      </Link>

      <div className="flex justify-between items-start mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 capitalize">
            {role.name.replace('_', ' ')}
          </h1>
          <p className="text-muted-foreground mt-2">
            Configure module access and specific permissions for this role.
          </p>
        </div>
        <AddModuleDialog />
      </div>

      <RoleModulePermissions 
        roleId={role.id}
        modules={modules}
        initialActiveIds={Array.from(activePermissionIds)}
      />
    </div>
  )
}
