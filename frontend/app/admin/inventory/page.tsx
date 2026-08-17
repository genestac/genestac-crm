import { fetchAPI } from '@/utils/api'
import { InventoryClient } from './inventory-client'
import { AddInventoryModal } from './add-inventory-modal'

export const dynamic = 'force-dynamic'

export default async function InventoryPage() {
  let items: any[] = []
  try {
    const res = await fetchAPI('/api/admin/inventory')
    items = res?.data || []
  } catch (e) {
    console.error('Failed to load inventory:', e)
    items = []
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Inventory</h1>
          <p className="text-muted-foreground mt-2">
            Track and manage product stock levels, variants, and medical details.
          </p>
        </div>
        <AddInventoryModal />
      </div>
      <InventoryClient items={items} />
    </div>
  )
}
