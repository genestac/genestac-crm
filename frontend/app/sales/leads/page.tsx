import { fetchAPI } from '@/utils/api'
import { AddUserDialog } from '@/components/sales/add-user-dialog'
import { LeadsTable } from '@/components/sales/leads-table'
import { cookies } from 'next/headers'

export default async function MyLeadsPage() {
  let leads: any[] = []
  let total: number = 0
  let errorMessage: string | null = null
  let statusOptions: { value: string, label: string }[] = []

  try {
    const cookieHeader = (await cookies()).toString()
    const response = await fetchAPI('/api/sales/leads?statuses=NEW,UNREAD,CONTACT_ATTEMPTED', {
      headers: { Cookie: cookieHeader }
    })
    leads = response?.data || []
    total = response?.total || leads.length

    const settingsResponse = await fetchAPI('/api/admin/crm-settings/global', {
      headers: { Cookie: cookieHeader }
    }).catch(() => null)
    
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

      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        {errorMessage ? (
          <div className="p-10 text-center text-sm text-red-600">
            <p className="font-medium">We could not load your leads.</p>
            <p className="mt-1 text-red-500">{errorMessage}</p>
          </div>
        ) : (
          <LeadsTable initialLeads={leads} initialTotal={total} statusOptions={statusOptions} />
        )}
      </div>
    </div>
  )
}
