'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'

export async function createRole(formData: FormData) {
  const supabase = await createClient()

  // Verify the current user is master_admin
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Not authenticated")

  const { data: profile } = await supabase
    .from('staffs')
    .select('roles(name)')
    .eq('id', user.id)
    .single()

  // @ts-ignore
  if (profile?.roles?.name !== 'master_admin') {
    throw new Error("Unauthorized to modify roles")
  }

  const name = formData.get('name') as string
  const description = formData.get('description') as string

  // Simple formatting: lowercase and underscores
  const formattedName = name.toLowerCase().replace(/[^a-z0-9]+/g, '_')

  const { error } = await supabase
    .from('roles')
    .insert({ name: formattedName, description })

  if (error) throw new Error(error.message)

  revalidatePath('/admin/roles')
  return { success: true }
}
