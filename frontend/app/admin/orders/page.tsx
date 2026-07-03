import { fetchAPI } from '@/utils/api'
import { format } from 'date-fns'
import { Badge } from '@/components/ui/badge'
import { OrderDetailsSheet } from '@/app/sales/orders/order-details-sheet'

export default async function OrdersPage() {
  const response = await fetchAPI('/api/sales/orders')
  const orders = response?.data || []

  const getStatusBadge = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'confirmed': return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">Confirmed</Badge>
      case 'pending': return <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">Pending</Badge>
      case 'fulfilled': return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Fulfilled</Badge>
      case 'cancelled': return <Badge className="bg-red-100 text-red-800 hover:bg-red-100">Cancelled</Badge>
      default: return <Badge variant="outline">{status}</Badge>
    }
  }

  const getPaymentStatusBadge = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'paid': return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Paid</Badge>
      case 'unpaid': return <Badge className="bg-gray-100 text-gray-800 hover:bg-gray-100">Unpaid</Badge>
      case 'partial': return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">Partial</Badge>
      case 'refunded': return <Badge className="bg-purple-100 text-purple-800 hover:bg-purple-100">Refunded</Badge>
      default: return <Badge variant="outline">{status}</Badge>
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Orders</h1>
          <p className="text-muted-foreground mt-2">
            View and manage all orders across the platform.
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        {orders.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left whitespace-nowrap">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-6 py-4 font-medium text-gray-900">Order ID / Date</th>
                  <th className="px-6 py-4 font-medium text-gray-900">Customer</th>
                  <th className="px-6 py-4 font-medium text-gray-900">Status</th>
                  <th className="px-6 py-4 font-medium text-gray-900">Payment</th>
                  <th className="px-6 py-4 font-medium text-gray-900">Total Amount</th>
                  <th className="px-6 py-4 font-medium text-gray-900 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {orders.map((order: any) => (
                  <tr key={order.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-medium text-gray-900">{order.id.slice(0, 8).toUpperCase()}</div>
                      <div className="text-muted-foreground text-xs mt-1">
                        {order.created_at ? format(new Date(order.created_at), 'PPP') : 'N/A'}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-medium text-gray-900">{order.user?.name || order.user?.full_name || 'Unknown'}</div>
                      <div className="text-muted-foreground text-xs mt-1">{order.user?.email || order.user?.phone || 'No contact'}</div>
                    </td>
                    <td className="px-6 py-4">{getStatusBadge(order.status)}</td>
                    <td className="px-6 py-4">{getPaymentStatusBadge(order.payment_status)}</td>
                    <td className="px-6 py-4 font-medium">₹{order.grand_total || 0}</td>
                    <td className="px-6 py-4 text-right">
                      <OrderDetailsSheet order={order} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <div className="h-12 w-12 rounded-full bg-gray-100 flex items-center justify-center mb-4">
              <span className="text-gray-400 text-xl">🛒</span>
            </div>
            <h3 className="text-lg font-medium text-gray-900">No orders found</h3>
            <p className="text-muted-foreground mt-1 max-w-sm">
              Your assigned leads haven't placed any orders yet. Check back later when they make a purchase.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
