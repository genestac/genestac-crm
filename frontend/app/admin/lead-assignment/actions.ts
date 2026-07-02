'use server'

import { fetchAPI } from '@/utils/api'
import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'

export async function getUnassignedLeads() {
  const data = await fetchAPI('/api/admin/lead-assignment/', {
    headers: { 'Cookie': (await cookies()).toString() }
  })
  return data.data || []
}

export async function getSalesReps() {
  const data = await fetchAPI('/api/admin/lead-assignment/sales-reps', {
    headers: { 'Cookie': (await cookies()).toString() }
  })
  return data.data || []
}

export async function assignLead(formData: FormData) {
  const lead_id = formData.get('lead_id') as string
  const record_type = formData.get('record_type') as string
  const sales_rep_id = formData.get('sales_rep_id') as string
  
  if (!sales_rep_id) throw new Error("Please select a sales representative")
  
  const data = await fetchAPI('/api/admin/lead-assignment/assign', {
    method: 'POST',
    headers: { 
      'Cookie': (await cookies()).toString(),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ lead_id, record_type, sales_rep_id })
  })
  
  revalidatePath('/admin/lead-assignment')
  return data
}
