'use server'

import { fetchAPI } from '@/utils/api'
import { revalidatePath } from 'next/cache'

export async function getDoctorAppointments() {
  const response = await fetchAPI('/api/doctor/appointments')
  return response || []
}

export async function getAppointmentById(id: string) {
  const response = await fetchAPI(`/api/doctor/appointments/${id}`)
  return response
}

export async function triggerAppointmentCall(id: string) {
  const response = await fetchAPI(`/api/doctor/appointments/${id}/call`, {
    method: 'POST',
  })
  return response
}

export async function updateAppointmentStatus(appointmentId: string, status: string) {
  await fetchAPI(`/api/doctor/appointments/${appointmentId}/status`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status })
  })
  revalidatePath('/doctor', 'layout')
  return { success: true }
}

export async function getDoctorMetrics() {
  const response = await fetchAPI('/api/doctor/metrics')
  return response
}

export async function getOnboardedPatients() {
  const response = await fetchAPI('/api/doctor/patients/onboarded')
  return response || []
}

export async function getPatientUserPlans(userId: string) {
  if (!userId) return null
  const response = await fetchAPI(`/api/doctor/patients/${userId}/user-plans`)
  return response
}

export async function generatePatientPlans(userId: string, target: 'diet' | 'exercise' | 'both', healthGoals?: string, patientName?: string) {
  // AI plan generation can take 60–90s for both plans — use a 2 min timeout
  const response = await fetchAPI(`/api/doctor/patients/${userId}/generate-plans`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ target, health_goals: healthGoals || '', patient_name: patientName || '' })
  }, 120000)
  revalidatePath('/doctor/onboarded')
  return response
}

export async function updatePatientUserPlans(userId: string, data: { diet_plan?: any, exercise_plan?: any, doctor_review?: boolean }) {
  const response = await fetchAPI(`/api/doctor/patients/${userId}/user-plans`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  })
  revalidatePath('/doctor/onboarded')
  return response
}

export async function getDoctorExerciseLibrary(category?: string) {
  const params = category && category !== 'all' ? `?category=${encodeURIComponent(category)}` : ''
  const response = await fetchAPI(`/api/doctor/patients/exercise-library${params}`)
  return response || []
}

export async function getPatientHistory(patientId: string) {
  if (!patientId || patientId === 'null' || patientId === 'undefined') return []
  const response = await fetchAPI(`/api/doctor/patients/${patientId}/history`)
  return response || []
}

export async function getRecentPrescriptions(patientId: string) {
  if (!patientId || patientId === 'null' || patientId === 'undefined') return []
  const response = await fetchAPI(`/api/doctor/patients/${patientId}/prescriptions`)
  return response || []
}

export async function getPrescriptionById(id: string) {
  const response = await fetchAPI(`/api/doctor/prescriptions/${id}`)
  return response
}

export async function writePrescription(data: any) {
  await fetchAPI('/api/doctor/prescriptions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  })
  revalidatePath('/doctor', 'layout')
  return { success: true }
}

export async function addClinicalAssessment(data: any) {
  await fetchAPI('/api/doctor/assessments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  })
  revalidatePath('/doctor', 'layout')
  return { success: true }
}

export async function logAdverseEvent(patientId: string, eventDetails: string) {
  await fetchAPI(`/api/doctor/patients/${patientId}/adverse-events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ eventDetails })
  })
  revalidatePath('/doctor', 'layout')
  return { success: true }
}

export async function updateAppointmentDetails(id: string, data: any) {
  await fetchAPI(`/api/doctor/appointments/${id}/details`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  })
  revalidatePath('/doctor', 'layout')
  return { success: true }
}

export async function createNextAppointment(data: any) {
  await fetchAPI('/api/doctor/appointments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  })
  revalidatePath('/doctor', 'layout')
  return { success: true }
}

export async function generatePaymentLink(appointmentId: string, planData: any) {
  const response = await fetchAPI(`/api/doctor/appointments/${appointmentId}/payment-link`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(planData)
  })
  revalidatePath('/doctor', 'layout')
  return response
}

export async function fetchPatientTimeline(patientId: string) {
  const response = await fetchAPI(`/api/doctor/patients/${patientId}/timeline`)
  return response
}

export async function addTimelineEntry(patientId: string | null, type: 'clinical' | 'communication', content: string, appointmentId?: string) {
  if (!patientId || patientId === 'null') {
    if (!appointmentId) throw new Error("No appointment ID provided for note fallback");
    await fetchAPI(`/api/doctor/appointments/${appointmentId}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content })
    })
  } else {
    await fetchAPI(`/api/doctor/patients/${patientId}/timeline`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, content })
    })
  }
  revalidatePath('/doctor', 'layout')
  return { success: true }
}

export async function uploadPatientReport(patientId: string, appointmentId: string, fileData: { title: string, url: string, type: string }) {
  await fetchAPI(`/api/doctor/patients/${patientId}/reports`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ appointmentId, fileData })
  })
  revalidatePath('/doctor', 'layout')
  return { success: true }
}

export async function getPlans() {
  const response = await fetchAPI('/api/admin/crm-settings/plans')
  return response.data || []
}

export async function getDoctorInventory() {
  const response = await fetchAPI('/api/doctor/inventory')
  if (!response.ok) throw new Error('Failed to fetch inventory')
  return response.json()
}

export async function getDoctorAvailability() {
  const response = await fetchAPI('/api/doctor/availability')
  return response
}

export async function updateDoctorAvailability(data: {
  is_active: boolean
  start_time: string
  end_time: string
  available_days: string[]
}) {
  const response = await fetchAPI('/api/doctor/availability', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  revalidatePath('/doctor', 'layout')
  return response
}

export async function getInventory() {
  const response = await fetchAPI('/api/doctor/inventory')
  return response || []
}

export async function getDoctorNotifications() {
  const response = await fetchAPI('/api/doctor/notifications')
  return response || []
}

export async function markNotificationRead(id: string) {
  const response = await fetchAPI(`/api/doctor/notifications/${id}/read`, {
    method: 'PUT',
  })
  revalidatePath('/doctor', 'layout')
  return response
}

export async function retranscribeCall(appointmentId: string, recordingUrl: string) {
  const response = await fetchAPI(`/api/doctor/appointments/${appointmentId}/retranscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recording_url: recordingUrl })
  })
  return response
}

export async function getTestRequests(status?: string) {
  const url = status ? `/api/doctor/test-requests?status=${status}` : '/api/doctor/test-requests'
  const response = await fetchAPI(url)
  return response || []
}

export async function updateTestRequest(id: string, data: { status?: string; doctor_notes?: string; suggested_tests?: any[] }) {
  const response = await fetchAPI(`/api/doctor/test-requests/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  })
  revalidatePath('/doctor/test-requests')
  revalidatePath('/doctor', 'layout')
  return response
}

export async function getTestTypes() {
  const response = await fetchAPI('/api/doctor/test-types')
  return response || []
}

export async function createTestType(data: { name: string; category?: string; description?: string }) {
  const response = await fetchAPI('/api/doctor/test-types', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  })
  return response
}

