import { getAdminMetrics } from './actions'
import { Activity } from 'lucide-react'
import AdminDashboardClient from './AdminDashboardClient'

export default async function AdminDashboard() {
  const metrics = await getAdminMetrics()

  if (!metrics) {
    return (
      <div className="flex items-center justify-center h-[50vh] text-gray-500">
        <Activity className="w-6 h-6 animate-spin mr-2" />
        <span>Loading insights...</span>
      </div>
    )
  }

  return <AdminDashboardClient metrics={metrics} />
}
