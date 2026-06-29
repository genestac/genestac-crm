'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'

// Note: Function names still say "Lead" to avoid breaking any other components, but they refer to the "users" table.

export async function createLead(formData: FormData) {
  const supabase = await createClient()
  const phone = formData.get('phone') as string
  const name = formData.get('name') as string
  const source_id = formData.get('source_id') as string

  const { data: { user } } = await supabase.auth.getUser()

  const payload: any = {
    phone,
    name: name || null,
    source_id: source_id || null,
    status: 'NEW',
    assigned_sales_rep_id: user?.id,
  }

  const fields = [
    'email', 'street_address', 'city', 'state', 'postal_code', 'country',
    'interested_plan_id', 'priority', 'followup_notes'
  ]

  fields.forEach(field => {
    const val = formData.get(field)
    if (val !== null && val !== '') {
      payload[field] = val
    }
  })

  const { error } = await supabase.from('users').insert(payload)

  if (error) throw new Error(error.message)
  revalidatePath('/sales/leads')
}

export async function updateLeadDetails(formData: FormData) {
  const supabase = await createClient()
  
  const leadId = formData.get('lead_id') as string
  
  const payload: any = {}
  
  const fields = [
    'status', 'priority', 'next_followup_date', 'followup_notes',
    'name', 'email', 'street_address', 'city', 'state', 'postal_code', 'country',
    'source_id', 'interested_plan_id'
  ]

  fields.forEach(field => {
    const val = formData.get(field)
    if (val !== null) {
      if (val === '') {
        payload[field] = null
      } else {
        payload[field] = val
      }
    }
  })

  const { error } = await supabase
    .from('users')
    .update(payload)
    .eq('id', leadId)

  if (error) throw new Error(error.message)
  revalidatePath('/sales', 'layout')
}

export async function uploadLeadDocument(formData: FormData) {
  const supabase = await createClient()
  
  const leadId = formData.get('lead_id') as string
  const file = formData.get('file') as File

  if (!file || !leadId) throw new Error("Missing file or lead ID")

  const fileName = `${leadId}/${Date.now()}_${file.name}`

  // 1. Upload to storage bucket "user_documents"
  const { error: uploadError } = await supabase.storage
    .from('user_documents')
    .upload(fileName, file)

  if (uploadError) throw new Error(uploadError.message)

  // 2. Insert into "user_documents" table
  const { data: publicUrlData } = supabase.storage.from('user_documents').getPublicUrl(fileName)

  const { error: dbError } = await supabase
    .from('user_documents')
    .insert({
      user_id: leadId,
      file_name: file.name,
      storage_path: fileName,
      file_url: publicUrlData.publicUrl
    })

  if (dbError) throw new Error(dbError.message)

  revalidatePath('/sales', 'layout')
  return { success: true }
}

export async function getLeadDocuments(leadId: string) {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('user_documents')
    .select('*')
    .eq('user_id', leadId)
    .order('uploaded_at', { ascending: false })

  if (error) throw new Error(error.message)
  return data || []
}

export async function addInteractionNote(userId: string, content: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Not authenticated")

  const { error } = await supabase.from('user_notes').insert({
    user_id: userId,
    author_id: user.id,
    content
  })

  if (error) throw new Error(error.message)
  revalidatePath('/sales', 'layout')
  return { success: true }
}

export async function getUserNotes(userId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('user_notes')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  return data || []
}

export async function getDoctors() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('staffs')
    .select('id, full_name, roles!inner(name)')
    .eq('roles.name', 'doctor')

  if (error) throw new Error(error.message)
  return data || []
}

export async function bookAppointment(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Not authenticated")

  const leadId = formData.get('lead_id') as string
  const doctorId = formData.get('doctor_id') as string
  const dateStr = formData.get('date') as string
  const timeStr = formData.get('time') as string
  const notes = formData.get('notes') as string

  if (!doctorId || !dateStr || !timeStr) throw new Error("Missing required fields")

  const scheduledAt = new Date(`${dateStr}T${timeStr}:00`).toISOString()

  const { error } = await supabase.from('appointments').insert({
    patient_id: leadId,
    doctor_id: doctorId,
    sales_rep_id: user.id,
    scheduled_at: scheduledAt,
    notes: notes || null,
    status: 'pending',
    duration_minutes: 30
  })

  if (error) throw new Error(error.message)
  revalidatePath('/sales', 'layout')
  return { success: true }
}
