'use server'

import { fetchAPI } from '@/utils/api'
import { revalidatePath } from 'next/cache'

export async function fetchAdminDoctors() {
  try {
    const response = await fetchAPI('/api/admin/doctors', {
      cache: 'no-store'
    })
    return { success: true, data: response }
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to fetch doctors' }
  }
}

export async function fetchDoctorDetails(doctorId: string) {
  try {
    const response = await fetchAPI(`/api/admin/doctors/${doctorId}`, {
      cache: 'no-store'
    })
    return { success: true, data: response }
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to fetch doctor details' }
  }
}

export async function updateDoctorSchedule(doctorId: string, payload: any) {
  try {
    const response = await fetchAPI(`/api/admin/doctors/${doctorId}/schedule`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })
    revalidatePath('/admin/doctors')
    revalidatePath(`/admin/doctors/${doctorId}`)
    return { success: true, data: response }
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to update schedule' }
  }
}

export async function fetchDoctorConsultations(doctorId: string) {
  try {
    const response = await fetchAPI(`/api/admin/doctors/${doctorId}/consultations`, {
      cache: 'no-store'
    })
    return { success: true, data: response }
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to fetch consultations' }
  }
}
