import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { Shield, ChevronRight } from 'lucide-react'
import { AddRoleDialog } from './add-role-dialog'

export default async function RolesPage() {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) redirect('/auth')

  const { data: currentUserProfile } = await supabase
    .from('staffs')
    .select('roles(name)')
    .eq('id', user.id)
    .single()

  // @ts-ignore
  const isMasterAdmin = currentUserProfile?.roles?.name === 'master_admin'
  if (!isMasterAdmin) redirect('/auth?error=unauthorized')

  const { data: roles } = await supabase.from('roles').select('*').order('name')

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Roles Directory</h1>
          <p className="text-muted-foreground mt-2">
            Select a role to configure its module permissions.
          </p>
        </div>
        {isMasterAdmin && (
          <AddRoleDialog />
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {roles?.map((role) => (
          <Link key={role.id} href={`/admin/roles/${role.id}`}>
            <div className="bg-white border rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow cursor-pointer flex flex-col h-full group">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-3 bg-blue-50 text-blue-600 rounded-lg group-hover:bg-blue-600 group-hover:text-white transition-colors">
                  <Shield className="w-6 h-6" />
                </div>
                <h3 className="font-semibold text-lg text-gray-900 capitalize">
                  {role.name.replace('_', ' ')}
                </h3>
              </div>
              <p className="text-gray-500 text-sm flex-1">
                {role.description || 'System role.'}
              </p>
              <div className="mt-6 flex items-center text-sm font-medium text-blue-600 group-hover:text-blue-700">
                Configure Permissions <ChevronRight className="w-4 h-4 ml-1" />
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
