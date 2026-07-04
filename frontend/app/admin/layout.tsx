import { AdminSidebar } from '@/components/admin/sidebar'
import { AdminHeader } from '@/components/admin/header'
import { fetchAPI } from '@/utils/api'

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const data = await fetchAPI('/api/auth/me').catch(() => null)
  const roleName = data?.user?.role

  return (
    <div className="flex h-[100dvh] bg-gray-50 overflow-hidden overscroll-none">
      <AdminSidebar />
      <div className="flex flex-col flex-1 overflow-hidden">
        <AdminHeader role={roleName} />
        <main className="flex-1 overflow-y-auto overscroll-contain bg-gray-50 p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
