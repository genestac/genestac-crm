import { fetchAPI } from '@/utils/api'
import { UserStatusUpdater } from '@/components/sales/user-status-updater'
import { AddUserDialog } from '@/components/sales/add-user-dialog'
import { UserManagementSheet } from '@/components/sales/user-management-sheet'
import { Button } from '@/components/ui/button'
import { Calendar, Mail, Phone, Settings2 } from 'lucide-react'

export default async function MyLeadsPage() {
  const response = await fetchAPI('/api/sales/leads?statuses=NEW,UNREAD,ASSIGNED,CONTACT_ATTEMPTED')
  const leads = response.data

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Leads</h1>
          <p className="text-muted-foreground mt-2">
            New leads that require your immediate attention. Once successfully contacted, they will move to the Contacted page.
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
                        {lead.phone && (
                          <a 
                            href={`https://wa.me/${lead.phone.replace(/\D/g, '')}`} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="w-8 h-8 rounded-full bg-[#22c55e] text-white flex items-center justify-center hover:bg-[#16a34a] transition-colors shadow-sm"
                            title="Chat on WhatsApp"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                              <path d="M16.6 14c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1-.2.2-.6.8-.8 1-.1.2-.3.2-.5.1-.7-.3-1.4-.7-2-1.2-.5-.5-1-1.1-1.4-1.7-.1-.2 0-.4.1-.5.1-.1.2-.3.4-.4.1-.1.2-.3.2-.4.1-.2 0-.4 0-.5C10 9.4 9.4 8 9.3 7.8c-.1-.2-.3-.2-.5-.2h-.4c-.2 0-.5.1-.7.3-.2.2-.7.7-.7 1.6 0 .9.8 1.8 1 2 .1.2 1.3 2.1 3.2 2.9 1.9.8 2.6.8 3.1.8.5 0 1.5-.6 1.7-1.2.2-.6.2-1.1.1-1.2-.1-.1-.3-.2-.5-.3z"/>
                              <path d="M12 2C6.5 2 2 6.5 2 12c0 1.8.5 3.5 1.4 5l-1.3 4.8 4.9-1.3c1.4.8 3 1.3 4.8 1.3 5.5 0 10-4.5 10-10S17.5 2 12 2zm0 18.2c-1.5 0-2.9-.4-4.2-1.1l-.3-.2-3.1.8.8-3-.2-.3C4.4 15 4 13.5 4 12c0-4.4 3.6-8 8-8s8 3.6 8-8 8z"/>
                            </svg>
                          </a>
                        )}
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
