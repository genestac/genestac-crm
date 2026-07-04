'use server'

import { fetchAPI } from '@/utils/api'
import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'

export async function updateGlobalSettings(settings: any) {
  await fetchAPI('/api/admin/crm-settings/global', {
    method: 'PUT',
    headers: { 
      'Cookie': (await cookies()).toString(),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(settings)
  })
  revalidatePath('/admin/invoice-settings')
}

export async function uploadInvoiceAssets(formData: FormData) {
  const cookieHeader = (await cookies()).toString()
  
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/v2/admin/invoice-settings/upload-assets`, {
    method: 'POST',
    headers: {
      Cookie: cookieHeader,
    },
    body: formData
  })
  
  if (!res.ok) {
    const error = await res.json().catch(() => ({}))
    throw new Error(error.detail || 'Failed to upload assets')
  }
  
  revalidatePath('/admin/invoice-settings')
  return await res.json()
}
