'use server'

import { fetchAPI } from '@/utils/api'

export async function getAdminProformaInvoices() {
  const data = await fetchAPI('/api/v2/admin/proforma-invoices')
  return data.data || []
}

export async function deleteAdminProformaInvoice(id: string) {
  const data = await fetchAPI(`/api/v2/admin/proforma-invoices/${id}`, {
    method: 'DELETE'
  })
  if (!data.success) {
    throw new Error(data.detail || 'Failed to delete invoice')
  }
  return data
}
