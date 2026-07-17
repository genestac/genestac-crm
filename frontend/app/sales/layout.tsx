import { redirect } from 'next/navigation'
import { fetchAPI } from '@/utils/api'
import { SalesSidebar } from '@/components/sales/sidebar'
import { SalesHeader } from '@/components/sales/header'

export default async function SalesLayout({ children }: { children: React.ReactNode }) {
  const data = await fetchAPI('/api/auth/me').catch(() => null)
  
  if (!data || !data.user) {
    redirect('/auth')
  }

  const roleName = data.user.role
  if (!roleName || !['sales', 'admin', 'master_admin', 'superadmin', 'SUPER_ADMIN', 'manager', 'support'].includes(roleName)) {
    redirect('/auth?error=unauthorized')
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <SalesSidebar />
      <div className="flex flex-col flex-1 w-full">
        <SalesHeader user={data.user} />
        <main className="flex-1 overflow-y-auto bg-gray-50/50 p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
