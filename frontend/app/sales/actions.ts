'use server'

import { revalidatePath } from 'next/cache'
import { fetchAPI } from '@/utils/api'
import { cookies } from 'next/headers'

export async function getPlans() {
  try {
    const response = await fetchAPI('/api/admin/crm-settings/plans')
    return response.data || []
  } catch (error) {
    return []
  }
}

export async function getSources() {
  const data = await fetchAPI('/api/sales/metadata', {
    headers: { 'Cookie': (await cookies()).toString() }
  })
  return data.sources || []
}

export async function getCustomFields() {
  const data = await fetchAPI('/api/admin/custom-fields/', {
    headers: { 'Cookie': (await cookies()).toString() }
  })
  return data.data || []
}

export async function createLead(formData: FormData) {
  await fetchAPI('/api/sales/leads', {
    method: 'POST',
    body: formData // send as multipart/form-data implicitly by not setting Content-Type
  })
  revalidatePath('/sales/leads')
}

export async function updateLeadDetails(formData: FormData) {
  const leadId = formData.get('lead_id') as string
  await fetchAPI(`/api/sales/leads/${leadId}`, {
    method: 'PUT',
    body: formData
  })
  revalidatePath('/sales', 'layout')
}

export async function uploadLeadDocument(formData: FormData) {
  const leadId = formData.get('lead_id') as string
  await fetchAPI(`/api/sales/leads/${leadId}/documents`, {
    method: 'POST',
    body: formData
  })
  revalidatePath('/sales', 'layout')
  return { success: true }
}

export async function getLeadDocuments(leadId: string) {
  const response = await fetchAPI(`/api/sales/leads/${leadId}/documents`)
  return response.data || []
}

export async function addInteractionNote(userId: string, content: string, createdAt?: string) {
  await fetchAPI(`/api/sales/leads/${userId}/notes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, created_at: createdAt })
  })
  revalidatePath('/sales', 'layout')
  return { success: true }
}

export async function getUserNotes(userId: string) {
  const response = await fetchAPI(`/api/sales/leads/${userId}/notes`)
  return response.data || []
}

export async function getDoctors() {
  const response = await fetchAPI('/api/doctor/')
  return response.data || []
}

export async function bookAppointment(formData: FormData) {
  await fetchAPI('/api/sales/appointments', {
    method: 'POST',
    body: formData
  })
  revalidatePath('/sales', 'layout')
  return { success: true }
}
