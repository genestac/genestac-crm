import { fetchAPI } from '@/utils/api'
import { format } from 'date-fns'

export default async function CartsPage() {
  const response = await fetchAPI('/api/sales/carts')
  const carts = response?.data || []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Abandoned Carts</h1>
          <p className="text-muted-foreground mt-2">
            View items added to the cart by users across the platform that haven't been purchased yet.
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        {carts.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left whitespace-nowrap">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-6 py-4 font-medium text-gray-900">Date Added</th>
                  <th className="px-6 py-4 font-medium text-gray-900">Customer</th>
                  <th className="px-6 py-4 font-medium text-gray-900">Item Name</th>
                  <th className="px-6 py-4 font-medium text-gray-900">Quantity</th>
                  <th className="px-6 py-4 font-medium text-gray-900">Est. Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {carts.map((cart: any) => (
                  <tr key={cart.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 text-muted-foreground">
                      {cart.added_at ? format(new Date(cart.added_at), 'PPP p') : 'N/A'}
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-medium text-gray-900">{cart.user?.name || cart.user?.full_name || 'Unknown'}</div>
                      <div className="text-muted-foreground text-xs mt-1">{cart.user?.email || cart.user?.phone || 'No contact'}</div>
                    </td>
                    <td className="px-6 py-4 font-medium">{cart.inventory?.name || 'Unknown Item'}</td>
                    <td className="px-6 py-4">{cart.quantity || 1}</td>
                    <td className="px-6 py-4 font-medium text-green-600">
                      ₹{cart.inventory?.price ? (cart.inventory.price * (cart.quantity || 1)) : 0}
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
            <h3 className="text-lg font-medium text-gray-900">No carts found</h3>
            <p className="text-muted-foreground mt-1 max-w-sm">
              Your assigned leads haven't added any items to their carts yet.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
