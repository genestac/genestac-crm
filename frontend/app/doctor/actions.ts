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

export async function getPatientHistory(patientId: string) {
  const response = await fetchAPI(`/api/doctor/patients/${patientId}/history`)
  return response || []
}

export async function getRecentPrescriptions(patientId: string) {
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

export async function addTimelineEntry(patientId: string, type: 'clinical' | 'communication', content: string) {
  await fetchAPI(`/api/doctor/patients/${patientId}/timeline`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, content })
  })
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

export async function getInventory() {
  const response = await fetchAPI('/api/doctor/inventory')
  return response || []
}
