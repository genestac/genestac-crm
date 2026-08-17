'use server'

import { fetchAPI } from '@/utils/api'
import { cookies } from 'next/headers'

export async function getOrderSettings() {
  try {
    const response = await fetchAPI('/api/admin/metrics/order-settings', {
      headers: { 'Cookie': (await cookies()).toString() }
    })
    return response || { order_review_notifications_enabled: true }
  } catch (error) {
    console.error('Failed to fetch order settings:', error)
    return { order_review_notifications_enabled: true }
  }
}

export async function updateOrderSettings(enabled: boolean) {
  try {
    const response = await fetchAPI('/api/admin/metrics/order-settings', {
      method: 'POST',
      headers: { 'Cookie': (await cookies()).toString(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ order_review_notifications_enabled: enabled })
    })
    return response
  } catch (error) {
    console.error('Failed to update order settings:', error)
    throw error
  }
}
