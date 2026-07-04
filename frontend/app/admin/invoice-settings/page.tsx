import { fetchAPI } from '@/utils/api'
import { InvoiceSettingsForm } from './invoice-settings-form'
import { cookies } from 'next/headers'

export default async function InvoiceSettingsPage() {
  const cookieHeader = (await cookies()).toString()
  
  const { data: globalSettings } = await fetchAPI('/api/admin/crm-settings/global', {
    headers: { Cookie: cookieHeader }
  }).catch(() => ({ data: {} }))

  return (
    <div className="space-y-8 p-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">Invoice Settings</h1>
        <p className="text-muted-foreground mt-2">
          Manage company information, logos, signatures, and PDF layout settings.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-8">
        <InvoiceSettingsForm initialSettings={globalSettings} />
      </div>
    </div>
  )
}
