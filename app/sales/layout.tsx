import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { SalesSidebar } from '@/components/sales/sidebar'
import { SalesHeader } from '@/components/sales/header'

export default async function SalesLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()

  // Verify auth
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) redirect('/auth')

  // Verify role (sales, admin, or master_admin)
  const { data: profile } = await supabase
    .from('staffs')
    .select('roles(name)')
    .eq('id', user.id)
    .single()

  // @ts-ignore
  const roleName = profile?.roles?.name
  if (!roleName || !['sales', 'admin', 'master_admin'].includes(roleName)) {
    redirect('/auth?error=unauthorized')
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <SalesSidebar />
      <div className="flex flex-col flex-1 w-full">
        <SalesHeader />
        <main className="flex-1 overflow-y-auto bg-gray-50/50 p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
