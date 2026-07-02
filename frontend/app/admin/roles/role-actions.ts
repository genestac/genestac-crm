'use server'

import { fetchAPI } from '@/utils/api'
import { revalidatePath } from 'next/cache'

export async function createRole(formData: FormData) {
  try {
    await fetchAPI('/api/admin/roles/', {
      method: 'POST',
      body: formData
    })
    
    revalidatePath('/admin/roles')
    return { success: true }
  } catch (error: any) {
    throw new Error(error.message)
  }
}
