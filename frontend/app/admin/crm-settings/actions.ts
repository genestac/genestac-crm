'use server'

import { fetchAPI } from '@/utils/api'
import { revalidatePath } from 'next/cache'

export async function addSource(formData: FormData) {
  try {
    await fetchAPI('/api/admin/crm-settings/sources', {
      method: 'POST',
      headers: { 'Cookie': (await cookies()).toString() },
      body: formData
    })
    revalidatePath('/admin/crm-settings')
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
      headers: { 'Cookie': (await cookies()).toString() },
      body: formData
    })
    revalidatePath('/admin/crm-settings')
  } catch (error: any) {
    throw new Error(error.message)
  }
}

import { cookies } from 'next/headers'

export async function updateGlobalSettings(settings: any) {
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
