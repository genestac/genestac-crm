'use server'

import { createClient, createAdminClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'

export async function adminCreateUser(formData: FormData) {
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
    throw new Error("Unauthorized to create staffs")
  }

  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const full_name = formData.get('full_name') as string
  const role_id = formData.get('role_id') as string

  // Use the admin client to bypass RLS and Auth settings
  const adminAuthClient = await createAdminClient()
  
  const { data: newUser, error: createError } = await adminAuthClient.auth.admin.createUser({
    email: email,
    password: password,
    email_confirm: true, // Auto confirm so they can log in immediately
    user_metadata: {
      full_name: full_name
    }
  })

  if (createError) throw new Error(createError.message)

  // Wait a second for the DB trigger to fire and create the profile
  await new Promise(r => setTimeout(r, 1000))

  // Update the new user's role
  const { error: roleError } = await adminAuthClient
    .from('staffs')
    .update({ role_id: role_id })
    .eq('id', newUser.user.id)

  if (roleError) throw new Error("Created user but failed to assign role: " + roleError.message)

  revalidatePath('/admin/staffs')
  return { success: true }
}

export async function updateUserRole(userId: string, newRole: string) {
  const supabase = await createClient()
  
  // Verify the current user is authenticated
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    throw new Error('Not authenticated')
  }
  
  // Fetch current user's role
  const { data: currentProfile } = await supabase
    .from('staffs')
    .select('roles(name)')
    .eq('id', user.id)
    .single()
  
  if (!currentProfile) {
    throw new Error('Profile not found')
  }

  // @ts-ignore
  const roleName = currentProfile.roles?.name

  const isMasterAdmin = roleName === 'master_admin'
  const isAdmin = roleName === 'admin'

  if (!isMasterAdmin && !isAdmin) {
    throw new Error('Unauthorized')
  }

  // Enforce Master Admin exclusive powers
  if ((newRole === 'admin' || newRole === 'master_admin') && !isMasterAdmin) {
    throw new Error('Only Master Admins can assign Admin roles')
  }

  // Lookup the target role id
  const { data: roleData, error: roleError } = await supabase
    .from('roles')
    .select('id')
    .eq('name', newRole)
    .single()
    
  if (roleError || !roleData) {
    throw new Error('Invalid role specified')
  }

  // Update the target user's role_id
  const { error } = await supabase
    .from('staffs')
    .update({ role_id: roleData.id })
    .eq('id', userId)

  if (error) {
    throw new Error(error.message)
  }

  revalidatePath('/admin/staffs')
  return { success: true }
}
