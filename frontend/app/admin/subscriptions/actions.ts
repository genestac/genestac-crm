'use server'

import { fetchAPI } from '@/utils/api'
import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'

export async function getSubscriptions(status?: string) {
  try {
    const url = status ? `/api/admin/subscriptions?status=${status}` : '/api/admin/subscriptions'
    const response = await fetchAPI(url, {
      headers: { 'Cookie': (await cookies()).toString() }
    })
    return response.data || []
  } catch (error: any) {
    console.error('Failed to fetch subscriptions:', error)
    return []
  }
}

export async function createSubscription(data: any) {
  try {
    await fetchAPI('/api/admin/subscriptions', {
      method: 'POST',
      headers: { 'Cookie': (await cookies()).toString(), 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    revalidatePath('/admin/subscriptions')
    return { success: true }
  } catch (error: any) {
    throw new Error(error.message)
  }
}

export async function updateSubscription(id: string, data: any) {
  try {
    await fetchAPI(`/api/admin/subscriptions/${id}`, {
      method: 'PUT',
      headers: { 'Cookie': (await cookies()).toString(), 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    revalidatePath('/admin/subscriptions')
    return { success: true }
  } catch (error: any) {
    throw new Error(error.message)
  }
}
