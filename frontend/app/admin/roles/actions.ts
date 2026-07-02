'use server'

import { fetchAPI } from '@/utils/api'
import { revalidatePath } from 'next/cache'

export async function togglePermission(roleId: string, permissionId: string, isGranted: boolean) {
  try {
    const formData = new FormData()
    formData.append('role_id', roleId)
    formData.append('permission_id', permissionId)
    formData.append('is_granted', isGranted.toString())
    
    await fetchAPI('/api/admin/roles/permissions/toggle', {
      method: 'POST',
      body: formData
    })
    
    revalidatePath('/admin/roles')
    return { success: true }
  } catch (error: any) {
    throw new Error(error.message)
  }
}

export async function createModule(formData: FormData) {
  try {
    await fetchAPI('/api/admin/roles/modules', {
      method: 'POST',
      body: formData
    })
    
    revalidatePath('/admin/roles')
    return { success: true }
  } catch (error: any) {
    throw new Error(error.message)
  }
}
