'use server'

import { fetchAPI } from '@/utils/api'
import { cookies } from 'next/headers'

export async function getAdminMetrics() {
  try {
    const response = await fetchAPI('/api/admin/metrics', {
      headers: { 'Cookie': (await cookies()).toString() }
    })
    return response.data || null
  } catch (error) {
    console.error('Failed to fetch admin metrics:', error)
    return null
  }
}
