import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { RoleModulePermissions } from './role-module-permissions'
import { AddModuleDialog } from '../add-module-dialog'

export default async function RoleConfigPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) redirect('/auth')

  const { data: currentUserProfile } = await supabase
    .from('staffs')
    .select('roles(name)')
    .eq('id', user.id)
    .single()

  // @ts-ignore
  const isMasterAdmin = currentUserProfile?.roles?.name === 'master_admin'
  if (!isMasterAdmin) redirect('/auth?error=unauthorized')

  const { data: role } = await supabase.from('roles').select('*').eq('id', id).single()
  if (!role) redirect('/admin/roles')

  // Fetch all permissions, and the active permissions for THIS role
  const { data: permissions } = await supabase.from('permissions').select('*').order('action')
  const { data: rolePermissions } = await supabase
    .from('role_permissions')
    .select('permission_id')
    .eq('role_id', role.id)

  const activePermissionIds = new Set(rolePermissions?.map(rp => rp.permission_id) || [])

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
