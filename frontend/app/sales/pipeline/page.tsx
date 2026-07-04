import { fetchAPI } from '@/utils/api'
import { ProspectLeadsBoard } from './board'

export const dynamic = 'force-dynamic'

export default async function PipelinePage() {
  let users: any[] = []
  let errorMessage: string | null = null

  try {
    const response = await fetchAPI('/api/sales/leads')
    users = response?.data || []
  } catch (error: any) {
    console.error('[sales/pipeline] Failed to load leads:', error)
    errorMessage = error?.message || 'Unable to load pipeline data right now.'
  }

  return (
    <div className="h-full flex flex-col">
      <div className="mb-6 shrink-0">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">Prospect Leads</h1>
        <p className="text-muted-foreground mt-2">
          Visual overview of all your users across every lifecycle stage.
        </p>
      </div>

      <div className="flex-1 overflow-x-auto pb-4">
        {errorMessage ? (
          <div className="rounded-xl border bg-white p-8 text-center text-sm text-red-600 shadow-sm">
            <p className="font-medium">We could not load the pipeline.</p>
            <p className="mt-1 text-red-500">{errorMessage}</p>
          </div>
        ) : (
          <ProspectLeadsBoard initialLeads={users} />
        )}
      </div>
    </div>
  )
}
