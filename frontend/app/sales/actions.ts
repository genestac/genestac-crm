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
}

export async function updateLeadDetails(formData: FormData) {
  const leadId = formData.get('lead_id') as string
  await fetchAPI(`/api/sales/leads/${leadId}`, {
    method: 'PUT',
    body: formData
  })
  revalidatePath('/sales/leads')
}

export async function bulkUpdateLeadsStatus(leadIds: string[], status: string) {
  await fetchAPI('/api/sales/leads/bulk-status', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      lead_ids: leadIds,
      status: status
    })
  })
  revalidatePath('/sales/leads')
}

export async function uploadLeadDocument(formData: FormData) {
  const leadId = formData.get('lead_id') as string
  await fetchAPI(`/api/sales/leads/${leadId}/documents`, {
    method: 'POST',
    body: formData
  })
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

export async function generateRazorpayLink(leadId: string, planId: string, discount: number = 0, invoiceId?: string) {
  const formData = new FormData()
  if (planId) formData.append('plan_id', planId)
  formData.append('discount', discount.toString())
  if (invoiceId) formData.append('invoice_id', invoiceId)
  
  const response = await fetchAPI(`/api/sales/leads/${leadId}/generate-payment`, {
    method: 'POST',
    body: formData
  })
  
  return response
}

export async function getProformaInvoices(leadId: string) {
  const res = await fetchAPI(`/api/sales/leads/${leadId}/invoices`)
  return res.data || []
}

export async function deleteProformaInvoice(invoiceId: string) {
  await fetchAPI(`/api/admin/crm-settings/invoices/${invoiceId}`, {
    method: 'DELETE',
    headers: { 'Cookie': (await cookies()).toString() }
  })
}

export async function getCurrentUserRole() {
  const data = await fetchAPI('/api/auth/me', {
    headers: { 'Cookie': (await cookies()).toString() }
  })
  return data?.user?.role || data?.role || 'USER'
}

export async function getPaginatedLeads(page: number, limit: number, sortBy: string, sortOrder: string, search: string, sourceId: string, status: string) {
  const query = new URLSearchParams()
  query.append('page', page.toString())
  query.append('limit', limit.toString())
  query.append('sort_by', sortBy)
  query.append('sort_order', sortOrder)
  if (search) query.append('search', search)
  if (sourceId) query.append('source_id', sourceId)
  if (status) query.append('statuses', status)

  const data = await fetchAPI(`/api/sales/leads?${query.toString()}`, {
    headers: { 'Cookie': (await cookies()).toString() }
  })
  return data
}

export async function getAICallLogs(leadId: string) {
  const response = await fetchAPI(`/api/sales/leads/${leadId}/ai-calls`)
  return response.data || []
}


export async function triggerAICall(leadId: string) {
  const response = await fetchAPI(`/api/sales/leads/${leadId}/trigger-ai-call`, {
    method: 'POST',
    headers: { 'Cookie': (await cookies()).toString() }
  })
  return response
}
