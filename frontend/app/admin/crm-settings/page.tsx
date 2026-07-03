import { fetchAPI } from '@/utils/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { addSource } from './actions'

import { SharedPoolToggle } from './shared-pool-toggle'

export default async function CRMSettingsPage() {
  const { data: sources } = await fetchAPI('/api/admin/crm-settings/sources').catch(() => ({ data: [] }))
  const { data: globalSettings } = await fetchAPI('/api/admin/crm-settings/global').catch(() => ({ data: { shared_lead_pool: false } }))

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">CRM Settings</h1>
          <p className="text-muted-foreground mt-2">
            Manage global configurations and User Sources.
          </p>
        </div>
        
        <Card className="w-80 shadow-sm border-amber-200 bg-amber-50/50">
          <CardContent className="pt-6 pb-6 flex items-center justify-between">
            <SharedPoolToggle initialValue={globalSettings?.shared_lead_pool || false} />
          </CardContent>
        </Card>
      </div>

      <div className="grid md:grid-cols-2 gap-8">        {/* Sources Management */}
        <Card>
          <CardHeader>
            <CardTitle>Lead Sources</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={addSource} className="flex gap-2 mb-6">
              <Input name="name" placeholder="Source Name (e.g. Google Ads)" required />
              <Button type="submit">Add</Button>
            </form>

            <div className="space-y-3">
              {sources?.map((source: any) => (
                <div key={source.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border">
                  <p className="font-medium">{source.name}</p>
                  <span className={`px-2 py-1 text-xs rounded-full ${source.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}`}>
                    {source.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
