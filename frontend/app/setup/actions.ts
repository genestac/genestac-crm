'use server';

import { fetchAPI } from '@/utils/api'

export async function checkSetupStatus() {
  try {
    const res = await fetchAPI('/api/auth/setup/status')
    return res
  } catch (error) {
    console.error('Failed to check setup status:', error)
    return { isSetup: false } // Fallback
  }
}

export async function registerSuperadmin(formData: FormData) {
  try {
    const data = {
      email: formData.get('email'),
      password: formData.get('password'),
      full_name: formData.get('fullName'),
    }

    const res = await fetchAPI('/api/auth/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    
    return { success: true }
  } catch (error: any) {
    return { error: error.message || 'Failed to register superadmin' }
  }
}
