import { fetchAPI } from '@/utils/api'
import { redirect } from 'next/navigation'

export default async function Home() {
  const data = await fetchAPI('/api/auth/me').catch(() => null)
  
  if (!data || !data.user) {
    // If we have no user data but they hit the home page, clear any invalid tokens
    redirect('/auth?clear=1')
  }
  
  const role = data.user.role
  const isMasterAdmin = role === 'master_admin' || role === 'superadmin'
  
  if (isMasterAdmin || role === 'admin') {
    redirect('/admin')
  } else if (role === 'doctor') {
    redirect('/doctor')
  } else if (role === 'sales' || role === 'manager' || role === 'support') {
    redirect('/sales')
  } else if (role === 'digital_marketing') {
    redirect('/digital-marketing')
  } else {
    redirect('/auth?error=norole')
  }
}
