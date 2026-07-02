'use server'

import { fetchAPI } from '@/utils/api'
import { revalidatePath } from 'next/cache'

export async function addSource(formData: FormData) {
  try {
    await fetchAPI('/api/admin/crm-settings/sources', {
      method: 'POST',
      body: formData
    })
    revalidatePath('/admin/crm-settings')
    return { success: true }
  } catch (error: any) {
    throw new Error(error.message)
  }
}

export async function toggleSource(id: string, isActive: boolean) {
  try {
    const formData = new FormData()
    formData.append('is_active', isActive.toString())
    await fetchAPI(`/api/admin/crm-settings/sources/${id}/toggle`, {
      method: 'PUT',
      body: formData
    })
    revalidatePath('/admin/crm-settings')
  } catch (error: any) {
    throw new Error(error.message)
  }
}

import { cookies } from 'next/headers'

export async function updateGlobalSettings(settings: { shared_lead_pool: boolean }) {
  const res = await fetchAPI('/api/admin/crm-settings/global', {
    method: 'PUT',
    headers: { 
      'Cookie': (await cookies()).toString(),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(settings)
  })
  revalidatePath('/admin/crm-settings')
}
