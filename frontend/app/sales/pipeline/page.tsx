import { fetchAPI } from '@/utils/api'
import { ProspectLeadsBoard } from './board'

export const dynamic = 'force-dynamic'

export default async function PipelinePage() {
  const response = await fetchAPI('/api/sales/leads').catch(() => ({ data: [] }))
  const users = response.data || []

  return (
    <div className="h-full flex flex-col">
      <div className="mb-6 shrink-0">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">Prospect Leads</h1>
        <p className="text-muted-foreground mt-2">
          Visual overview of all your users across every lifecycle stage.
        </p>
      </div>

      <div className="flex-1 overflow-x-auto pb-4">
        <ProspectLeadsBoard initialLeads={users} />
      </div>
    </div>
  )
}
