'use server'

import { cookies } from 'next/headers'
import { fetchAPI } from '@/utils/api'

export async function getCustomFields() {
  const data = await fetchAPI('/api/admin/custom-fields/', {
    headers: { 'Cookie': (await cookies()).toString() }
  })
  return data.data || []
}

export async function createCustomField(formData: FormData) {
  const payload = {
    name: formData.get('name') as string,
    label: formData.get('label') as string,
    type: formData.get('type') as string,
    entity_type: formData.get('entity_type') as string,
    is_required: formData.get('is_required') === 'true'
  }
  
  const data = await fetchAPI('/api/admin/custom-fields/', {
    method: 'POST',
    headers: { 
      'Cookie': (await cookies()).toString(),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  })
  
  return data
}

export async function deleteCustomField(id: string) {
  const data = await fetchAPI(`/api/admin/custom-fields/${id}`, {
    method: 'DELETE',
    headers: { 'Cookie': (await cookies()).toString() }
  })
  
  return data
}
