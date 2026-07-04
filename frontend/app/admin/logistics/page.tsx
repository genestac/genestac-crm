import { WorkInProgress } from '@/components/ui/work-in-progress'

export default function LogisticsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Logistics</h1>
          <p className="text-muted-foreground mt-2">
            Monitor shipments and delivery status.
          </p>
        </div>
      </div>
      <WorkInProgress title="Logistics Module in Development" description="Shipment tracking and delivery partner integrations are being worked on right now." />
    </div>
  )
}
