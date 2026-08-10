'use server'

import { fetchAPI } from '@/utils/api'
import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'

async function getHeaders() {
  return { 'Cookie': (await cookies()).toString(), 'Content-Type': 'application/json' }
}

export async function getSubscriptions(status?: string) {
  try {
    const url = status ? `/api/admin/subscriptions?status=${status}` : '/api/admin/subscriptions'
    const response = await fetchAPI(url, { headers: { 'Cookie': (await cookies()).toString() } })
    return response.data || []
  } catch (error: any) {
    console.error('Failed to fetch subscriptions:', error)
    return []
  }
}

export async function getPlansAndVariants() {
  try {
    const response = await fetchAPI('/api/admin/subscriptions/plans-and-variants', {
      headers: { 'Cookie': (await cookies()).toString() }
    })
    return { plans: response.plans || [], variants: response.variants || [] }
  } catch (error: any) {
    console.error('Failed to fetch plans and variants:', error)
    return { plans: [], variants: [] }
  }
}

export async function updateSubscription(id: string, data: any) {
  try {
    await fetchAPI(`/api/admin/subscriptions/${id}`, {
      method: 'PUT',
      headers: await getHeaders(),
      body: JSON.stringify(data)
    })
    revalidatePath('/admin/subscriptions')
    return { success: true }
  } catch (error: any) {
    throw new Error(error.message)
  }
}

export async function upgradeSubscription(id: string, planId: string, variantId: string) {
  try {
    await fetchAPI(`/api/admin/subscriptions/${id}/upgrade`, {
      method: 'POST',
      headers: await getHeaders(),
      body: JSON.stringify({ plan_id: planId, variant_id: variantId })
    })
    revalidatePath('/admin/subscriptions')
    return { success: true }
  } catch (error: any) {
    throw new Error(error.message)
  }
}
