'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'

export async function addPlan(formData: FormData) {
  const supabase = await createClient()
  const name = formData.get('name') as string
  const price = formData.get('price') as string

  if (!name || !price) throw new Error('Name and price required')

  const { error } = await supabase.from('plans').insert({ name, price: Number(price) })
  if (error) throw new Error(error.message)
  
  revalidatePath('/admin/crm-settings')
  return { success: true }
}

export async function addSource(formData: FormData) {
  const supabase = await createClient()
  const name = formData.get('name') as string

  if (!name) throw new Error('Name required')

  const { error } = await supabase.from('user_sources').insert({ name })
  if (error) throw new Error(error.message)
  
  revalidatePath('/admin/crm-settings')
  return { success: true }
}

export async function togglePlan(id: string, isActive: boolean) {
  const supabase = await createClient()
  const { error } = await supabase.from('plans').update({ is_active: isActive }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/crm-settings')
}

export async function toggleSource(id: string, isActive: boolean) {
  const supabase = await createClient()
  const { error } = await supabase.from('user_sources').update({ is_active: isActive }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/crm-settings')
}
