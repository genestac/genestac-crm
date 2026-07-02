'use server'

import { fetchAPI } from '@/utils/api'
import { revalidatePath } from 'next/cache'

export async function adminCreateUser(formData: FormData) {
  try {
    await fetchAPI('/api/admin/staffs/', {
      method: 'POST',
      body: formData
    })
    revalidatePath('/admin/staffs')
    return { success: true }
  } catch (error: any) {
    throw new Error(error.message)
  }
}

export async function updateUserRole(userId: string, newRole: string) {
  try {
    const formData = new FormData()
    formData.append('new_role', newRole)
    
    await fetchAPI(`/api/admin/staffs/${userId}/role`, {
      method: 'PUT',
      body: formData
    })
    revalidatePath('/admin/staffs')
    return { success: true }
  } catch (error: any) {
    throw new Error(error.message)
  }
}

export async function updateStaffDetails(userId: string, formData: FormData) {
  try {
    await fetchAPI(`/api/admin/staffs/${userId}/details`, {
      method: 'PUT',
      body: formData
    })
    revalidatePath('/admin/staffs')
    return { success: true }
  } catch (error: any) {
    throw new Error(error.message)
  }
}
