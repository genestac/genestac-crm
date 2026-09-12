'use server'

import { fetchAPI } from '@/utils/api'

export async function getAdminProformaInvoices() {
  const data = await fetchAPI('/api/v2/admin/proforma-invoices')
  return data.data || []
}

export async function deleteAdminProformaInvoice(id: string) {
  const data = await fetchAPI(`/api/v2/admin/proforma-invoices/${id}`, {
    method: 'DELETE',
  })
  if (!data.success) {
    throw new Error(data.detail || 'Failed to delete invoice')
  }
  return data
}

export async function searchLeadsForPI(q: string) {
  const data = await fetchAPI(
    `/api/v2/admin/proforma-invoices/search-leads?q=${encodeURIComponent(q)}`
  )
  return data.data || []
}

export async function searchItemsForPI(q: string) {
  const data = await fetchAPI(
    `/api/v2/admin/proforma-invoices/search-items?q=${encodeURIComponent(q)}`
  )
  return data.data || []
}

export async function createAdminPI(payload: {
  lead_id: string
  items: Array<{
    item_type: string
    item_id: string
    plan_id?: string
    quantity: number
    discount_pct: number
  }>
}) {
  const data = await fetchAPI('/api/v2/admin/proforma-invoices/create', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  if (!data.success) {
    throw new Error(data.detail || 'Failed to create invoice')
  }
  return data.data
}

export async function sendPIWhatsapp(invoiceId: string) {
  const data = await fetchAPI(
    `/api/v2/admin/proforma-invoices/${invoiceId}/send-whatsapp`,
    { method: 'POST' }
  )
  if (!data.success) {
    throw new Error(data.detail || 'Failed to send WhatsApp')
  }
  return data
}
