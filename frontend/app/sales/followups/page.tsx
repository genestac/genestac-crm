import { fetchAPI } from '@/utils/api'
import { UserManagementSheet } from '@/components/sales/user-management-sheet'
import { MarkFollowupDoneButton } from '@/components/sales/mark-followup-done-button'
import { LocalDate } from '@/components/sales/local-date'
import { Button } from '@/components/ui/button'
import { Calendar, Mail, Phone, Settings2 } from 'lucide-react'

export default async function FollowupsPage() {
  const response = await fetchAPI('/api/sales/leads?exclude_statuses=LOST,CONVERTED&require_followup=true&sort_by=next_followup_date&sort_order=asc')
  const leads = response.data

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">Scheduled Follow-ups</h1>
        <p className="text-muted-foreground mt-2">
          Your pipeline of upcoming calls and meetings, ordered by schedule date.
        </p>
      </div>

      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        {leads && leads.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left whitespace-nowrap">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-6 py-4 font-medium text-gray-900">User Details</th>
                  <th className="px-6 py-4 font-medium text-gray-900">Contact</th>
                  <th className="px-6 py-4 font-medium text-gray-900">Next Follow-up</th>
                  <th className="px-6 py-4 font-medium text-gray-900">Status</th>
                  <th className="px-6 py-4 font-medium text-gray-900 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {leads.map((lead: any) => {
                  const isPastDue = new Date(lead.next_followup_date) < new Date();
                  return (
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

                    {/* Next Follow-up */}
                    <td className="px-6 py-4">
                      <div className={`flex items-center px-2 py-1 rounded w-fit border ${
                        isPastDue 
                          ? 'text-red-700 bg-red-50 border-red-200' 
                          : 'text-amber-700 bg-amber-50 border-amber-200'
                      }`}>
                        <Calendar className="w-3 h-3 mr-2" />
                        <LocalDate iso={lead.next_followup_date} />
                        {isPastDue && <span className="ml-2 text-[10px] uppercase font-bold text-red-600">Past Due</span>}
                      </div>
                    </td>

                    {/* Status */}
                    <td className="px-6 py-4">
                      <span className="px-2.5 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-md text-xs font-semibold tracking-wide">
                        {lead.status.replace('_', ' ')}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end items-center">
                        <MarkFollowupDoneButton lead={lead} />
                        <UserManagementSheet lead={lead}>
                          <Button variant="secondary" size="sm" className="bg-gray-100 hover:bg-gray-200 text-gray-900">
                            <Settings2 className="w-4 h-4 mr-2" /> Manage
                          </Button>
                        </UserManagementSheet>
                      </div>
                    </td>
                    
                  </tr>
                )})}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-16 flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <span className="text-2xl">☕</span>
            </div>
            <h3 className="text-lg font-medium text-gray-900">All caught up!</h3>
            <p className="text-gray-500 mt-1 max-w-sm">You have no follow-ups scheduled. Time to assign some dates to your new users.</p>
          </div>
        )}
      </div>
    </div>
  )
}
