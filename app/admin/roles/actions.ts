'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'

export async function togglePermission(roleId: string, permissionId: string, isGranted: boolean) {
  const supabase = await createClient()

  // Verify the current user is master_admin
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Not authenticated")

  const { data: profile } = await supabase
    .from('staffs')
    .select('roles(name)')
    .eq('id', user.id)
    .single()

  // @ts-ignore
  if (profile?.roles?.name !== 'master_admin') {
    throw new Error("Unauthorized to modify roles")
  }

  if (isGranted) {
    const { error } = await supabase
      .from('role_permissions')
      .insert({ role_id: roleId, permission_id: permissionId })
    if (error) throw new Error(error.message)
  } else {
    const { error } = await supabase
      .from('role_permissions')
      .delete()
      .eq('role_id', roleId)
      .eq('permission_id', permissionId)
    if (error) throw new Error(error.message)
  }

  revalidatePath('/admin/roles')
  return { success: true }
}

export async function createModule(formData: FormData) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Not authenticated")

  const { data: profile } = await supabase
    .from('staffs')
    .select('roles(name)')
    .eq('id', user.id)
    .single()

  // @ts-ignore
  if (profile?.roles?.name !== 'master_admin') {
    throw new Error("Unauthorized to modify permissions")
  }

  const moduleName = formData.get('module') as string
  if (!moduleName) throw new Error("Module name is required")

  // Generate the 4 CRUD permissions
  const permissionsToInsert = [
    { action: `${moduleName}:create`, module: moduleName, description: `Create ${moduleName}` },
    { action: `${moduleName}:read`, module: moduleName, description: `View ${moduleName}` },
    { action: `${moduleName}:update`, module: moduleName, description: `Update ${moduleName}` },
    { action: `${moduleName}:delete`, module: moduleName, description: `Delete ${moduleName}` },
  ]

  const { error } = await supabase
    .from('permissions')
    .insert(permissionsToInsert)

  if (error) throw new Error(error.message)

  revalidatePath('/admin/roles')
  return { success: true }
}
