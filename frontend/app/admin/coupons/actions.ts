'use server'

import { fetchAPI } from '@/utils/api'
import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'

export async function createCoupon(data: any) {
  const res = await fetchAPI('/api/admin/coupons', {
    method: 'POST',
    headers: { 
      'Cookie': (await cookies()).toString(),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(data)
  })
  revalidatePath('/admin/coupons')
  return res
}

export async function toggleCoupon(id: string, isActive: boolean) {
  const formData = new FormData()
  formData.append('is_active', isActive.toString())
  await fetchAPI(`/api/admin/coupons/${id}/toggle`, {
    method: 'PUT',
    headers: { 'Cookie': (await cookies()).toString() },
    body: formData
  })
  revalidatePath('/admin/coupons')
}

export async function updateCoupon(id: string, data: any) {
  const res = await fetchAPI(`/api/admin/coupons/${id}`, {
    method: 'PUT',
    headers: {
      'Cookie': (await cookies()).toString(),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(data)
  })
  revalidatePath('/admin/coupons')
  return res
}

export async function deleteCoupon(id: string) {
  await fetchAPI(`/api/admin/coupons/${id}`, {
    method: 'DELETE',
    headers: { 'Cookie': (await cookies()).toString() }
  })
  revalidatePath('/admin/coupons')
}
