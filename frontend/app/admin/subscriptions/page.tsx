import { getSubscriptions } from './actions'
import { format } from 'date-fns'
import { Badge } from '@/components/ui/badge'

export default async function SubscriptionsPage() {
  const subscriptions = await getSubscriptions()

  const getStatusBadge = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'active': return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Active</Badge>
      case 'expired': return <Badge className="bg-gray-100 text-gray-800 hover:bg-gray-100">Expired</Badge>
      case 'cancelled': return <Badge className="bg-red-100 text-red-800 hover:bg-red-100">Cancelled</Badge>
      default: return <Badge variant="outline">{status}</Badge>
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Subscriptions</h1>
          <p className="text-muted-foreground mt-2">
            Manage your subscribed members and their plan accesses.
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        {subscriptions.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left whitespace-nowrap">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-6 py-4 font-medium text-gray-900">Member</th>
                  <th className="px-6 py-4 font-medium text-gray-900">Subscription Type</th>
                  <th className="px-6 py-4 font-medium text-gray-900">Duration</th>
                  <th className="px-6 py-4 font-medium text-gray-900">Status</th>
                  <th className="px-6 py-4 font-medium text-gray-900 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {subscriptions.map((sub: any) => (
                  <tr key={sub.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-medium text-gray-900">{sub.users?.name || 'Unknown'}</div>
                      <div className="text-muted-foreground text-xs mt-1">{sub.users?.phone || sub.users?.email || 'No contact'}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-medium text-gray-900">
                        {sub.plans?.name ? `Plan: ${sub.plans.name}` : (sub.inventory?.medicine_name ? `Medicine: ${sub.inventory.medicine_name}` : 'Unknown')}
                      </div>
                      {sub.plan_variants?.duration_label && (
                        <div className="text-muted-foreground text-xs mt-1">{sub.plan_variants.duration_label}</div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-xs">
                        <span className="font-medium">Start:</span> {sub.start_date ? format(new Date(sub.start_date), 'MMM d, yyyy') : 'N/A'}<br/>
                        <span className="font-medium">End:</span> {sub.end_date ? format(new Date(sub.end_date), 'MMM d, yyyy') : 'N/A'}
                      </div>
                    </td>
                    <td className="px-6 py-4">{getStatusBadge(sub.status)}</td>
                    <td className="px-6 py-4 text-right">
                      {/* Placeholder for future Actions like Renew, Cancel, etc. */}
                      <span className="text-gray-400 text-xs">Manage</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <div className="h-12 w-12 rounded-full bg-gray-100 flex items-center justify-center mb-4">
              <span className="text-gray-400 text-xl">📅</span>
            </div>
            <h3 className="text-lg font-medium text-gray-900">No subscriptions found</h3>
            <p className="text-muted-foreground mt-1 max-w-sm">
              Your users haven't purchased any plans or medicines yet.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
