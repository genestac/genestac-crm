import { fetchAPI } from '@/utils/api'
import { AddUserDialog } from '@/components/sales/add-user-dialog'
import { LeadsTable } from '@/components/sales/leads-table'
import { cookies } from 'next/headers'
import { Flame } from 'lucide-react'

export default async function MyLeadsPage() {
  let leads: any[] = []
  let total: number = 0
  let hotLeads: any[] = []
  let errorMessage: string | null = null
  let statusOptions: { value: string, label: string }[] = []
  let sourceOptions: { value: string, label: string }[] = []

  try {
    const cookieHeader = (await cookies()).toString()
    const [response, hotResponse, settingsResponse, metaResponse] = await Promise.all([
      fetchAPI('/api/sales/leads?statuses=NEW,UNREAD,CONTACT_ATTEMPTED', {
        headers: { Cookie: cookieHeader }
      }),
      fetchAPI('/api/sales/leads?hot_only=true&limit=6', {
        headers: { Cookie: cookieHeader }
      }).catch(() => null),
      fetchAPI('/api/admin/crm-settings/global', {
        headers: { Cookie: cookieHeader }
      }).catch(() => null),
      fetchAPI('/api/sales/metadata', {
        headers: { Cookie: cookieHeader }
      }).catch(() => null),
    ])

    leads = response?.data || []
    total = response?.total || leads.length
    hotLeads = hotResponse?.data || []

    if (metaResponse?.sources) {
      sourceOptions = metaResponse.sources.map((s: any) => ({ value: s.id, label: s.name }))
    }
    if (settingsResponse?.data?.lead_statuses) {
      statusOptions = settingsResponse.data.lead_statuses
    } else {
      statusOptions = [
        { value: 'NEW', label: 'New' },
        { value: 'UNREAD', label: 'Unread' },
        { value: 'CONTACT_ATTEMPTED', label: 'Contact Attempted' },
        { value: 'QUALIFIED', label: 'Qualified' },
        { value: 'CONSULTATION_SCHEDULED', label: 'Consultation Scheduled' },
        { value: 'SPAM', label: 'Spam' },
        { value: 'DEAD', label: 'Dead' }
      ]
    }
  } catch (error: any) {
    console.error('[sales/leads] Failed to load leads:', error)
    errorMessage = error?.message || 'Unable to load leads right now.'
  }

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

      {/* 🔥 Hot Leads Section */}
      {hotLeads.length > 0 && (
        <div className="bg-gradient-to-r from-red-50 to-orange-50 border border-red-200 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="p-1.5 bg-red-100 rounded-lg">
              <Flame className="w-4 h-4 text-red-600" />
            </div>
            <h2 className="font-bold text-red-800 text-sm uppercase tracking-wider">🔥 Hot Leads — Call Now</h2>
            <span className="ml-auto text-xs text-red-500 font-medium">{hotLeads.length} leads scored Hot by AI</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {hotLeads.map((lead: any) => (
              <div key={lead.id} className="bg-white rounded-xl border border-red-100 p-4 shadow-sm hover:shadow-md transition-shadow flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-gray-900 text-sm truncate">{lead.name || 'Unnamed'}</span>
                  <span className="text-lg">🔥</span>
                </div>
                {(lead.city || lead.metadata?.city) && (
                  <span className="text-xs text-gray-500">{lead.city || lead.metadata?.city}</span>
                )}
                {lead.phone && (
                  <a href={`tel:${lead.phone}`} className="text-xs text-indigo-600 font-medium hover:underline mt-1">
                    {lead.phone}
                  </a>
                )}
                {lead.lead_score != null && (
                  <div className="mt-1 flex items-center gap-1">
                    <div className="h-1.5 bg-red-100 rounded-full flex-1">
                      <div className="h-1.5 bg-red-500 rounded-full" style={{ width: `${lead.lead_score}%` }} />
                    </div>
                    <span className="text-xs font-bold text-red-600">{lead.lead_score}/100</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        {errorMessage ? (
          <div className="p-10 text-center text-sm text-red-600">
            <p className="font-medium">We could not load your leads.</p>
            <p className="mt-1 text-red-500">{errorMessage}</p>
          </div>
        ) : (
          <LeadsTable initialLeads={leads} initialTotal={total} statusOptions={statusOptions} sourceOptions={sourceOptions} />
        )}
      </div>
    </div>
  )
}
