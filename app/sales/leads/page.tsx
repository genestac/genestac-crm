import { createClient } from '@/utils/supabase/server'
import { UserStatusUpdater } from '@/components/sales/user-status-updater'
import { AddUserDialog } from '@/components/sales/add-user-dialog'
import { UserManagementSheet } from '@/components/sales/user-management-sheet'
import { Button } from '@/components/ui/button'
import { Calendar, Mail, Phone, Settings2 } from 'lucide-react'

export default async function MyLeadsPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  // Fetch early stage users assigned to this sales rep, joining sources and plans
  const { data: leads } = await supabase
    .from('users')
    .select(`
      *,
      user_sources ( name ),
      plans ( name, price )
    `)
    .eq('assigned_sales_rep_id', user?.id)
    .in('status', ['NEW', 'UNREAD', 'ASSIGNED', 'CONTACT_ATTEMPTED'])
    .order('created_at', { ascending: false })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">My Users</h1>
          <p className="text-muted-foreground mt-2">
            New users that require your immediate attention. Once successfully contacted, they will move to the Contacted page.
          </p>
        </div>
        <AddUserDialog />
      </div>

      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        {leads && leads.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left whitespace-nowrap">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-6 py-4 font-medium text-gray-900">User Details</th>
                  <th className="px-6 py-4 font-medium text-gray-900">Contact</th>
                  <th className="px-6 py-4 font-medium text-gray-900">Source & Plan</th>
                  <th className="px-6 py-4 font-medium text-gray-900">Next Follow-up</th>
                  <th className="px-6 py-4 font-medium text-gray-900">Status</th>
                  <th className="px-6 py-4 font-medium text-gray-900 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {leads.map((lead: any) => (
                  <tr key={lead.id} className="hover:bg-gray-50/50 transition-colors">
                    
                    {/* User Details */}
                    <td className="px-6 py-4">
                      <div className="font-semibold text-gray-900">{lead.name || 'Unnamed User'}</div>
                      <div className="text-xs text-gray-500 mt-1">ID: {lead.id.substring(0, 8)}</div>
                    </td>

                    {/* Contact */}
                    <td className="px-6 py-4">
                      <div className="flex items-center text-gray-700">
                        <Phone className="w-3 h-3 mr-2 text-gray-400" />
                        {lead.phone}
                      </div>
                      {lead.email && (
                        <div className="flex items-center text-gray-500 text-xs mt-1">
                          <Mail className="w-3 h-3 mr-2 text-gray-400" />
                          {lead.email}
                        </div>
                      )}
                    </td>

                    {/* Source & Plan */}
                    <td className="px-6 py-4">
                      <div className="text-gray-900 font-medium text-xs uppercase tracking-wider">
                        {lead.user_sources?.name || 'Unknown'}
                      </div>
                      <div className="text-indigo-600 text-xs mt-1 font-medium">
                        {lead.plans?.name || 'No Plan Selected'}
                      </div>
                    </td>

                    {/* Next Follow-up */}
                    <td className="px-6 py-4">
                      {lead.next_followup_date ? (
                        <div className="flex items-center text-amber-700 bg-amber-50 px-2 py-1 rounded w-fit border border-amber-200">
                          <Calendar className="w-3 h-3 mr-2" />
                          {new Date(lead.next_followup_date).toLocaleString([], { 
                            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' 
                          })}
                        </div>
                      ) : (
                        <span className="text-gray-400 text-xs italic">Not scheduled</span>
                      )}
                    </td>

                    {/* Status */}
                    <td className="px-6 py-4">
                      <span className="px-2.5 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-md text-xs font-semibold tracking-wide">
                        {lead.status.replace('_', ' ')}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-2">
                        <UserStatusUpdater leadId={lead.id} currentStatus={lead.status} />
                        
                        <UserManagementSheet lead={lead}>
                          <Button variant="secondary" size="sm" className="bg-gray-100 hover:bg-gray-200 text-gray-900">
                            <Settings2 className="w-4 h-4 mr-2" /> Manage
                          </Button>
                        </UserManagementSheet>
                      </div>
                    </td>
                    
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-16 flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <span className="text-2xl">🎉</span>
            </div>
            <h3 className="text-lg font-medium text-gray-900">Inbox Zero!</h3>
            <p className="text-gray-500 mt-1 max-w-sm">You have no active early-stage users. Check the Contacted page or add a new user.</p>
          </div>
        )}
      </div>
    </div>
  )
}
