'use server'

import { fetchAPI } from '@/utils/api'

export interface Customer {
  id: string
  name: string
  phone?: string
  email?: string
  type: 'lead' | 'user'
}

export interface CatalogItem {
  id: string
  type: 'inventory' | 'inventory_variant' | 'plan_variant' | 'plan'
  inventory_id?: string
  plan_id?: string
  name: string
  mrp: number
  unit: string
  gst_pct?: number
}

export interface CustomerAddress {
  id: string
  user_id: string
  house_no?: string
  address_line_1: string
  address_line_2?: string
  landmark?: string
  city: string
  state: string
  postal_code: string
  country?: string
  is_default?: boolean
}

export interface InvoiceAddressInput {
  contact_name: string
  contact_phone: string
  house_no?: string
  address_line_1: string
  address_line_2?: string
  landmark?: string
  city: string
  state: string
  postal_code: string
  country?: string
  address_id?: string
  save_to_user?: boolean
}

export interface CreateInvoicePayload {
  customer_id: string
  customer_type: string
  razorpay_payment_id?: string
  razorpay_order_id?: string
  razorpay_payment_link_id?: string
  payment_note?: string
  pi_id?: string
  total_amount: number
  items: Array<{
    item_type: string
    item_id: string
    inventory_id?: string
    plan_id?: string
    name: string
    mrp: number
    quantity: number
    unit: string
  }>
  billing_address?: InvoiceAddressInput
  shipping_address?: InvoiceAddressInput
  place_of_supply?: string
  place_of_delivery?: string
}

export async function searchCustomersForInvoice(q: string): Promise<Customer[]> {
  const data = await fetchAPI(
    `/api/v2/admin/invoices/search-customers?q=${encodeURIComponent(q)}`
  )
  return data.data || []
}

export async function searchItemsForInvoice(q: string): Promise<CatalogItem[]> {
  const data = await fetchAPI(
    `/api/v2/admin/invoices/search-items?q=${encodeURIComponent(q)}`
  )
  return data.data || []
}

export async function createInvoice(payload: CreateInvoicePayload) {
  const data = await fetchAPI('/api/v2/admin/invoices/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!data.success) {
    throw new Error(data.detail || 'Failed to create invoice')
  }
  return data.data
}

export async function getAdminInvoices() {
  const data = await fetchAPI('/api/v2/admin/invoices/')
  return data.data || []
}

export async function deleteAdminInvoice(id: string) {
  const data = await fetchAPI(`/api/v2/admin/invoices/${id}`, {
    method: 'DELETE',
  })
  if (!data.success) {
    throw new Error(data.detail || 'Failed to delete invoice')
  }
  return data
}

export async function getCustomerAddresses(customerId: string): Promise<CustomerAddress[]> {
  const data = await fetchAPI(`/api/v2/admin/invoices/customer/${customerId}/addresses`)
  return data.data || []
}

export async function saveCustomerAddress(customerId: string, address: Partial<CustomerAddress>): Promise<CustomerAddress> {
  const data = await fetchAPI(`/api/v2/admin/invoices/customer/${customerId}/addresses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(address),
  })
  if (!data.success) {
    throw new Error(data.detail || 'Failed to save address')
  }
  return data.data
}
