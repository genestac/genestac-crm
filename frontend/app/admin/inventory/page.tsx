import { WorkInProgress } from '@/components/ui/work-in-progress'

export default function InventoryPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Inventory</h1>
          <p className="text-muted-foreground mt-2">
            Track and manage product stock levels.
          </p>
        </div>
      </div>
      <WorkInProgress title="Inventory Module in Development" description="Advanced inventory tracking and stock management features will be here soon." />
    </div>
  )
}
