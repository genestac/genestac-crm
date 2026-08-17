'use server'

import { fetchAPI } from '@/utils/api'
import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'

export async function createInventoryItem(data: any) {
  const res = await fetchAPI('/api/admin/inventory', {
    method: 'POST',
    headers: {
      'Cookie': (await cookies()).toString(),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(data)
  })
  revalidatePath('/admin/inventory')
  return res
}

export async function updateInventoryItem(id: string, data: any) {
  const res = await fetchAPI(`/api/admin/inventory/${id}`, {
    method: 'PUT',
    headers: {
      'Cookie': (await cookies()).toString(),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(data)
  })
  revalidatePath('/admin/inventory')
  return res
}

export async function deleteInventoryItem(id: string) {
  await fetchAPI(`/api/admin/inventory/${id}`, {
    method: 'DELETE',
    headers: { 'Cookie': (await cookies()).toString() }
  })
  revalidatePath('/admin/inventory')
}
