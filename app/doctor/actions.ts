'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'

export async function getDoctorAppointments() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Not authenticated")

  // Due to schema refactoring, leads is users, profiles is staffs (or still patients?)
  // Wait! lead_id references public.users
  // patient_id references public.users (wait, users?) No, I changed it to users for lead_id and users for patient_id?
  // Let me check what I changed it to.
  
  const { data, error } = await supabase
    .from('appointments')
    .select(`
      *,
      patients:users!patient_id (
        id, name, phone, email
      ),
      sales:staffs!sales_rep_id (
        id, full_name
      )
    `)
    .eq('doctor_id', user.id)
    .order('scheduled_at', { ascending: true })

  if (error) throw new Error(error.message)
  return data || []
}

export async function getAppointmentById(id: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Not authenticated")

  const { data, error } = await supabase
    .from('appointments')
    .select(`
      *,
      patients:users!patient_id (
        id, name, phone, email
      ),
      sales:staffs!sales_rep_id (
        id, full_name
      )
    `)
    .eq('id', id)
    .single()

  if (error) throw new Error(error.message)
  return data
}

export async function updateAppointmentStatus(appointmentId: string, status: string) {
  const supabase = await createClient()
  
  const { error } = await supabase
    .from('appointments')
    .update({ status })
    .eq('id', appointmentId)

  if (error) throw new Error(error.message)
  revalidatePath('/doctor', 'layout')
  return { success: true }
}

export async function getDoctorMetrics() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Not authenticated")

  // Fetch today's appointments
  const startOfDay = new Date()
  startOfDay.setHours(0, 0, 0, 0)
  const endOfDay = new Date()
  endOfDay.setHours(23, 59, 59, 999)

  const { count: dailyCount } = await supabase
    .from('appointments')
    .select('id', { count: 'exact' })
    .eq('doctor_id', user.id)
    .gte('scheduled_at', startOfDay.toISOString())
    .lte('scheduled_at', endOfDay.toISOString())

  const { count: totalConsultations } = await supabase
    .from('appointments')
    .select('id', { count: 'exact' })
    .eq('doctor_id', user.id)
    .eq('status', 'completed')

  // Active patients (number of unique patients seen)
  const { data: patientsData } = await supabase
    .from('appointments')
    .select('patient_id')
    .eq('doctor_id', user.id)
    .eq('status', 'completed')

  const uniquePatients = new Set()
  patientsData?.forEach(p => {
    if (p.patient_id) uniquePatients.add(p.patient_id)
  })

  // Dummy revenue and success rate for now
  const monthlyRevenue = uniquePatients.size * 500 // Assuming $500/consultation equivalent

  return {
    dailyQueue: dailyCount || 0,
    totalConsultations: totalConsultations || 0,
    activePatients: uniquePatients.size,
    treatmentSuccessRate: 85, // Dummy %
    monthlyRevenue
  }
}

export async function getPatientHistory(patientId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('clinical_assessments')
    .select('*')
    .eq('patient_id', patientId)
    .order('created_at', { ascending: true })

  if (error) throw new Error(error.message)
  return data || []
}

export async function getRecentPrescriptions(patientId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('prescriptions')
    .select(`
      *,
      prescription_items (
        id, dosage, frequency, duration_days, total_quantity_prescribed,
        inventory ( name, sku )
      )
    `)
    .eq('patient_id', patientId)
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  return data || []
}

export async function getPrescriptionById(id: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('prescriptions')
    .select(`
      *,
      patients:users!patient_id ( id, name, phone, email, date_of_birth ),
      doctors:staffs!doctor_id ( id, full_name, email, phone ),
      prescription_items (
        id, dosage, frequency, duration_days, total_quantity_prescribed, time, before_lunch, after_lunch,
        inventory ( name, sku )
      )
    `)
    .eq('id', id)
    .single()

  if (error) throw new Error(error.message)
  return data
}

export async function writePrescription(data: any) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Not authenticated")

  // 1. Create prescription
  const { data: rxData, error: rxError } = await supabase
    .from('prescriptions')
    .insert({
      patient_id: data.patientId,
      doctor_id: user.id,
      general_instructions: data.instructions,
      valid_until: data.validUntil,
      status: 'active'
    })
    .select()
    .single()

  if (rxError) throw new Error(rxError.message)

  // 2. Create prescription_items
  if (data.items && data.items.length > 0) {
    const itemsToInsert = data.items.map((item: any) => ({
      prescription_id: rxData.id,
      inventory_id: item.inventoryId,
      dosage: item.dosage,
      frequency: item.frequency,
      duration_days: parseInt(item.durationDays) || 30,
      total_quantity_prescribed: parseInt(item.quantity) || 1,
      before_lunch: !!item.beforeLunch,
      after_lunch: !!item.afterLunch,
      time: item.time || null
    }))

    const { error: itemsError } = await supabase
      .from('prescription_items')
      .insert(itemsToInsert)

    if (itemsError) throw new Error(itemsError.message)
  }

  revalidatePath('/doctor', 'layout')
  return { success: true }
}

export async function addClinicalAssessment(data: any) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Not authenticated")

  const { error } = await supabase
    .from('clinical_assessments')
    .insert({
      patient_id: data.patientId,
      recorded_by: user.id,
      weight_kg: parseFloat(data.weight) || null,
      conditions: data.conditions || {},
      doctor_timeline_notes: data.notes
    })

  if (error) throw new Error(error.message)
  revalidatePath('/doctor', 'layout')
  return { success: true }
}

export async function logAdverseEvent(patientId: string, eventDetails: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Not authenticated")

  // Treat an adverse event as a clinical assessment with a specific condition flag
  const { error } = await supabase
    .from('clinical_assessments')
    .insert({
      patient_id: patientId,
      recorded_by: user.id,
      conditions: { adverse_event: true, details: eventDetails },
      doctor_timeline_notes: `[ADVERSE EVENT LOGGED]: ${eventDetails}`
    })

  if (error) throw new Error(error.message)
  revalidatePath('/doctor', 'layout')
  return { success: true }
}

export async function updateAppointmentDetails(id: string, data: any) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('appointments')
    .update({
      title: data.title,
      type: data.type,
      related_to: data.related_to,
      location: data.location,
      meeting_link: data.link,
      notes: data.description,
      duration_minutes: data.duration,
      scheduled_at: data.scheduled_at,
    })
    .eq('id', id)

  if (error) throw new Error(error.message)
  revalidatePath('/doctor', 'layout')
  return { success: true }
}

export async function createNextAppointment(data: any) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Not authenticated")

  // Fallback sales rep if not provided
  let salesRepId = data.sales_rep_id
  if (!salesRepId) {
    const { data: admin } = await supabase.from('staffs').select('id').eq('email', 'admin@example.com').single()
    salesRepId = admin?.id || user.id
  }

  const { error } = await supabase
    .from('appointments')
    .insert({
      title: data.title,
      type: data.type,
      patient_id: data.patient_id,
      doctor_id: user.id,
      sales_rep_id: salesRepId,
      scheduled_at: data.scheduled_at,
      duration_minutes: data.duration || 30,
      notes: data.description,
      location: data.location,
      meeting_link: data.link,
      status: 'pending'
    })

  if (error) throw new Error(error.message)
  revalidatePath('/doctor', 'layout')
  return { success: true }
}

export async function generatePaymentLink(appointmentId: string, planData: any) {
  const supabase = await createClient()
  
  // Mock Razorpay payment link generation
  const mockLink = `https://rzp.io/i/${Math.random().toString(36).substring(2, 10)}`
  
  const { error } = await supabase
    .from('appointments')
    .update({
      plan_details: {
        products: planData.products,
        discount: planData.discount,
        total: planData.total,
        payment_link: mockLink,
        generated_at: new Date().toISOString()
      },
      plan_id: planData.plan_id
    })
    .eq('id', appointmentId)

  if (error) throw new Error(error.message)
  revalidatePath('/doctor', 'layout')
  return { success: true, payment_link: mockLink }
}

export async function fetchPatientTimeline(patientId: string) {
  const supabase = await createClient()
  
  const { data: assessments } = await supabase
    .from('clinical_assessments')
    .select('id, created_at, doctor_timeline_notes, conditions, recorded_by, staffs!recorded_by(full_name, roles!inner(name))')
    .eq('patient_id', patientId)
    .order('created_at', { ascending: false })

  const { data: communications } = await supabase
    .from('communications')
    .select('id, created_at, content, type, sender_id, staffs!sender_id(full_name, roles!inner(name))')
    .eq('lead_id', patientId)
    .order('created_at', { ascending: false })
    
  return { assessments: assessments || [], communications: communications || [] }
}

export async function addTimelineEntry(patientId: string, type: 'clinical' | 'communication', content: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Not authenticated")

  if (type === 'clinical') {
    await supabase.from('clinical_assessments').insert({
      patient_id: patientId,
      recorded_by: user.id,
      doctor_timeline_notes: content
    })
  } else {
    await supabase.from('communications').insert({
      lead_id: patientId,
      sender_id: user.id,
      content: content,
      type: 'note'
    })
  }
  revalidatePath('/doctor', 'layout')
  return { success: true }
}

export async function uploadPatientReport(patientId: string, appointmentId: string, fileData: { title: string, url: string, type: string }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  const { error } = await supabase
    .from('patient_reports')
    .insert({
      patient_id: patientId,
      appointment_id: appointmentId,
      uploaded_by: user?.id,
      title: fileData.title,
      file_url: fileData.url,
      file_type: fileData.type
    })

  if (error) throw new Error(error.message)
  revalidatePath('/doctor', 'layout')
  return { success: true }
}

export async function getPlans() {
  const supabase = await createClient()
  const { data } = await supabase.from('plans').select('*').eq('is_active', true)
  return data || []
}

export async function getInventory() {
  const supabase = await createClient()
  const { data } = await supabase.from('inventory').select('*')
  return data || []
}
