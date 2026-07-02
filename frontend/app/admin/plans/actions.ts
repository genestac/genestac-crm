'use server'

import { fetchAPI } from '@/utils/api'
import { revalidatePath } from 'next/cache'

export async function addPlan(payload: any) {
  try {
    await fetchAPI('/api/admin/crm-settings/plans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    revalidatePath('/admin/plans')
    return { success: true }
  } catch (error: any) {
    throw new Error(error.message)
  }
}

export async function updatePlan(id: string, payload: any) {
  try {
    await fetchAPI(`/api/admin/crm-settings/plans/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    revalidatePath('/admin/plans')
    return { success: true }
  } catch (error: any) {
    throw new Error(error.message)
  }
}

export async function togglePlan(id: string, isActive: boolean) {
  try {
    const formData = new FormData()
    formData.append('is_active', isActive.toString())
    await fetchAPI(`/api/admin/crm-settings/plans/${id}/toggle`, {
      method: 'PUT',
      body: formData
    })
    revalidatePath('/admin/plans')
  } catch (error: any) {
    throw new Error(error.message)
  }
}
