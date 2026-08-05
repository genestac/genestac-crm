'use server'

import { fetchAPI } from '@/utils/api'
import { revalidatePath } from 'next/cache'

export async function fetchAdminConsultations(statusFilter: string = 'all') {
  try {
    const response = await fetchAPI(`/api/admin/consultations?status_filter=${statusFilter}`, {
      cache: 'no-store'
    })
    return { success: true, data: response }
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to fetch consultations' }
  }
}

export async function fetchPendingDoctorAppointments() {
  try {
    const response = await fetchAPI('/api/admin/consultations/pending-doctor', { cache: 'no-store' })
    return { success: true, data: response }
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to fetch pending appointments' }
  }
}

export async function reassignConsultation(appointmentId: string, doctorId: string) {
  try {
    const response = await fetchAPI(`/api/admin/consultations/${appointmentId}/assign`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ doctor_id: doctorId })
    })
    revalidatePath('/admin/consultations')
    return { success: true, data: response }
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to reassign consultation' }
  }
}

export async function createConsultation(payload: any) {
  try {
    const response = await fetchAPI(`/api/admin/consultations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })
    revalidatePath('/admin/consultations')
    return { success: true, data: response }
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to create consultation' }
  }
}

export async function fetchAvailableSlots(doctorId: string, dateStr: string) {
  try {
    const response = await fetchAPI(
      `/api/admin/consultations/available-slots?doctor_id=${doctorId}&date=${dateStr}`,
      { cache: 'no-store' }
    )
    return { success: true, data: response }
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to fetch slots' }
  }
}

export async function bookPendingAppointment(appointmentId: string, doctorId: string, scheduledAt: string) {
  try {
    const response = await fetchAPI(`/api/admin/consultations/${appointmentId}/book`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ doctor_id: doctorId, scheduled_at: scheduledAt })
    })
    revalidatePath('/admin/consultations')
    return { success: true, data: response }
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to book appointment' }
  }
}

export async function fetchPatients() {
  try {
    const response = await fetchAPI('/api/admin/consultations/patients', { cache: 'no-store' })
    return { success: true, data: response }
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to fetch patients' }
  }
}

export async function fetchActiveDoctors() {
  try {
    const response = await fetchAPI('/api/admin/doctors', { cache: 'no-store' })
    return { success: true, data: response }
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to fetch doctors' }
  }
}
