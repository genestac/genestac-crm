import { redirect } from 'next/navigation'
import { fetchAPI } from '@/utils/api'
import { DMSidebar } from '@/components/digital-marketing/DMSidebar'
import { DMHeader } from '@/components/digital-marketing/DMHeader'

const ALLOWED_ROLES = ['digital_marketing', 'superadmin', 'master_admin', 'SUPER_ADMIN']

export default async function DigitalMarketingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const data = await fetchAPI('/api/auth/me').catch(() => null)

  if (!data || !data.user) {
    redirect('/auth')
  }

  const roleName: string = data.user.role

  if (!roleName || !ALLOWED_ROLES.includes(roleName)) {
    redirect('/auth?error=unauthorized')
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50 dark:bg-background">
      <DMSidebar />
      <div className="flex flex-col flex-1 overflow-hidden">
        <DMHeader role={roleName} />
        <main className="flex-1 overflow-y-auto bg-gray-50/50 dark:bg-background p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
