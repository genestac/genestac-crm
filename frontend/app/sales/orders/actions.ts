'use server'

import { fetchAPI } from '@/utils/api'
import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'

export async function approveOrderPrescription(orderId: string) {
  try {
    const response = await fetchAPI(`/api/sales/orders/${orderId}`, {
      method: 'PUT',
      headers: { 'Cookie': (await cookies()).toString(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'confirmed',
        prescription_status: 'approved'
      })
    })
    revalidatePath('/admin/orders')
    return { success: true, data: response }
  } catch (error: any) {
    console.error('Failed to approve prescription:', error)
    return { success: false, error: error.message }
  }
}

export async function updateOrderPrescription(orderId: string, url: string) {
  try {
    const response = await fetchAPI(`/api/sales/orders/${orderId}`, {
      method: 'PUT',
      headers: { 'Cookie': (await cookies()).toString(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'under_review',
        prescription_status: 'pending_review',
        prescription_url: url
      })
    })
    revalidatePath('/admin/orders')
    return { success: true, data: response }
  } catch (error: any) {
    console.error('Failed to update prescription:', error)
    return { success: false, error: error.message }
  }
}

export async function uploadOrderPrescriptionAction(orderId: string, formData: FormData) {
  try {
    const response = await fetchAPI(`/api/sales/orders/${orderId}/prescription/upload`, {
      method: 'POST',
      headers: { 'Cookie': (await cookies()).toString() },
      body: formData // fetchAPI will handle FormData correctly if no Content-Type is set (browser/undici handles boundary)
    })
    revalidatePath('/admin/orders')
    return { success: true, url: response.url }
  } catch (error: any) {
    console.error('Failed to upload prescription:', error)
    return { success: false, error: error.message }
  }
}

