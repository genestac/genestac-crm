import { WorkInProgress } from '@/components/ui/work-in-progress'

export default function AnalyticsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Analytics</h1>
          <p className="text-muted-foreground mt-2">
            View detailed metrics and performance data.
          </p>
        </div>
      </div>
      <WorkInProgress title="Analytics Module in Development" description="We are building powerful charts and reporting tools for this section. They will be available in the next release." />
    </div>
  )
}
