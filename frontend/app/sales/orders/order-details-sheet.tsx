'use client'

import { useState } from 'react'
import { format } from 'date-fns'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Eye, User, FileText, CreditCard, Activity, ShoppingBag } from 'lucide-react'

export function OrderDetailsSheet({ order }: { order: any }) {
  const [open, setOpen] = useState(false)

  const items = order.order_items || []
  const payments = order.payments || []
  
  // Use order.user if available, otherwise fall back to fields stored directly on the order row
  const user = {
    name: order.user?.name || order.user?.full_name || order.full_name || 'N/A',
    full_name: order.user?.full_name || order.full_name || 'N/A',
    email: order.user?.email || order.email || 'No email',
    phone: order.user?.phone || order.phone || 'No phone',
  }
  
  const metadata = {
    age: order.user?.metadata?.age || order.age || 'N/A',
    height_cm: order.user?.metadata?.height_cm || order.height_cm,
    weight_kg: order.user?.metadata?.weight_kg || order.weight_kg,
    diabetes: order.user?.metadata?.diabetes || order.diabetes || false,
    thyroid_disease: order.user?.metadata?.thyroid_disease || order.thyroid_disease || false,
    pcos: order.user?.metadata?.pcos || order.pcos || false,
    fatty_liver: order.user?.metadata?.fatty_liver || order.fatty_liver || false,
    pancreatitis: order.user?.metadata?.pancreatitis || order.pancreatitis || false,
    kidney_disease: order.user?.metadata?.kidney_disease || order.kidney_disease || false,
    current_medications: order.user?.metadata?.current_medications || order.current_medications,
  }

  const getStatusBadge = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'confirmed': return <Badge className="bg-blue-100 text-blue-800 border-none">Confirmed</Badge>
      case 'pending': return <Badge className="bg-yellow-100 text-yellow-800 border-none">Pending</Badge>
      case 'fulfilled': return <Badge className="bg-green-100 text-green-800 border-none">Fulfilled</Badge>
      case 'cancelled': return <Badge className="bg-red-100 text-red-800 border-none">Cancelled</Badge>
      default: return <Badge variant="outline">{status}</Badge>
    }
  }

  const getPaymentStatusBadge = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'paid': return <Badge className="bg-green-100 text-green-800 border-none">Paid</Badge>
      case 'unpaid': return <Badge className="bg-gray-100 text-gray-800 border-none">Unpaid</Badge>
      case 'partial': return <Badge className="bg-blue-100 text-blue-800 border-none">Partial</Badge>
      case 'refunded': return <Badge className="bg-purple-100 text-purple-800 border-none">Refunded</Badge>
      default: return <Badge variant="outline">{status}</Badge>
    }
  }

  return (
    <>
      <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setOpen(true)}>
        <span className="sr-only">Open menu</span>
        <Eye className="h-4 w-4" />
      </Button>
      
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[700px] p-0 rounded-xl overflow-hidden flex flex-col max-h-[85vh] outline-none border-none shadow-2xl">
          <div className="bg-gradient-to-br from-teal-50/50 to-white px-6 py-6 border-b shrink-0 flex items-center justify-between">
            <DialogHeader>
              <DialogTitle className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                <ShoppingBag className="w-6 h-6 text-primary" /> Order Details
              </DialogTitle>
              <DialogDescription className="text-muted-foreground mt-1">
                View transaction details and customer medical profile.
              </DialogDescription>
            </DialogHeader>
          </div>
          
          <div className="bg-gray-50/50 border-b px-6 py-4 flex items-center gap-6 text-sm shrink-0">
            <div className="flex flex-col">
              <span className="text-xs text-muted-foreground">Order ID</span>
              <span className="font-mono font-medium text-gray-900">{order.id?.slice(0, 8).toUpperCase()}</span>
            </div>
            <div className="w-px h-8 bg-gray-200" />
            <div className="flex flex-col">
              <span className="text-xs text-muted-foreground">Date</span>
              <span className="font-medium text-gray-900">{order.created_at ? format(new Date(order.created_at), 'PPP') : 'N/A'}</span>
            </div>
            <div className="w-px h-8 bg-gray-200" />
            <div className="flex flex-col">
              <span className="text-xs text-muted-foreground">Status</span>
              <div className="mt-1">{getStatusBadge(order.status)}</div>
            </div>
          </div>

          <div className="overflow-y-auto flex-1 p-6 space-y-8">
          <div className="space-y-8">
            
            {/* Customer Details */}
            <section>
              <h3 className="text-lg font-semibold flex items-center gap-2 mb-4 text-gray-900">
                <User className="h-5 w-5 text-gray-500" /> Customer Information
              </h3>
              <div className="grid grid-cols-2 gap-4 bg-white p-4 rounded-xl border shadow-sm">
                <div>
                  <span className="text-sm text-muted-foreground block">Name</span>
                  <span className="font-medium">{user.name || user.full_name || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-sm text-muted-foreground block">Contact</span>
                  <span className="font-medium block">{user.email || 'No email'}</span>
                  <span className="font-medium text-sm text-gray-600">{user.phone || 'No phone'}</span>
                </div>
              </div>
            </section>

            {/* Medical Profile / Metadata */}
            <section>
              <h3 className="text-lg font-semibold flex items-center gap-2 mb-4 text-gray-900">
                <Activity className="h-5 w-5 text-gray-500" /> Medical Profile
              </h3>
              <div className="bg-white p-4 rounded-xl border shadow-sm space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <span className="text-sm text-muted-foreground block">Age</span>
                    <span className="font-medium">{metadata.age || 'N/A'}</span>
                  </div>
                  <div>
                    <span className="text-sm text-muted-foreground block">Height</span>
                    <span className="font-medium">{metadata.height_cm ? `${metadata.height_cm} cm` : 'N/A'}</span>
                  </div>
                  <div>
                    <span className="text-sm text-muted-foreground block">Weight</span>
                    <span className="font-medium">{metadata.weight_kg ? `${metadata.weight_kg} kg` : 'N/A'}</span>
                  </div>
                </div>
                
                <hr className="border-gray-200" />
                
                <div>
                  <span className="text-sm text-muted-foreground block mb-2">Conditions</span>
                  <div className="flex flex-wrap gap-2">
                    {metadata.diabetes && <Badge variant="secondary">Diabetes</Badge>}
                    {metadata.thyroid_disease && <Badge variant="secondary">Thyroid</Badge>}
                    {metadata.pcos && <Badge variant="secondary">PCOS</Badge>}
                    {metadata.fatty_liver && <Badge variant="secondary">Fatty Liver</Badge>}
                    {metadata.pancreatitis && <Badge variant="secondary">Pancreatitis</Badge>}
                    {metadata.kidney_disease && <Badge variant="secondary">Kidney Disease</Badge>}
                    {(!metadata.diabetes && !metadata.thyroid_disease && !metadata.pcos && !metadata.fatty_liver && !metadata.pancreatitis && !metadata.kidney_disease) && (
                      <span className="text-sm text-gray-500">No major conditions reported.</span>
                    )}
                  </div>
                </div>

                {metadata.current_medications && (
                  <>
                    <hr className="border-gray-200" />
                    <div>
                      <span className="text-sm text-muted-foreground block">Current Medications</span>
                      <p className="text-sm mt-1">{metadata.current_medications}</p>
                    </div>
                  </>
                )}
              </div>
            </section>

            {/* Order Items */}
            <section>
              <h3 className="text-lg font-semibold flex items-center gap-2 mb-4 text-gray-900">
                <ShoppingBag className="h-5 w-5 text-gray-500" /> Order Items
              </h3>
              <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
                <table className="w-full text-sm text-left">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-4 py-3 font-medium text-gray-900">Item</th>
                      <th className="px-4 py-3 font-medium text-gray-900">Qty</th>
                      <th className="px-4 py-3 font-medium text-gray-900 text-right">Price</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {items.length > 0 ? items.map((item: any) => (
                      <tr key={item.id}>
                        <td className="px-4 py-3">
                          <div className="font-medium">{item.item_name}</div>
                          <div className="text-xs text-muted-foreground capitalize">{item.item_type}</div>
                        </td>
                        <td className="px-4 py-3">{item.quantity || 1}</td>
                        <td className="px-4 py-3 text-right font-medium">₹{item.total_price || 0}</td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan={3} className="px-4 py-4 text-center text-muted-foreground">No items found.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
                <div className="bg-gray-50 p-4 border-t space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span>₹{order.original_amount || 0}</span>
                  </div>
                  <div className="flex justify-between text-green-600">
                    <span>Discount</span>
                    <span>-₹{order.discount_amount || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Tax</span>
                    <span>₹{order.tax_amount || 0}</span>
                  </div>
                  <hr className="my-2 border-gray-200" />
                  <div className="flex justify-between font-bold text-lg">
                    <span>Total</span>
                    <span>₹{order.grand_total || 0}</span>
                  </div>
                </div>
              </div>
            </section>

            {/* Payments */}
            <section>
              <h3 className="text-lg font-semibold flex items-center gap-2 mb-4 text-gray-900">
                <CreditCard className="h-5 w-5 text-gray-500" /> Payment Log
              </h3>
              <div className="space-y-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm text-muted-foreground">Current Status:</span>
                  {getPaymentStatusBadge(order.payment_status)}
                </div>
                
                {payments.length > 0 ? payments.map((payment: any) => (
                  <div key={payment.id} className="bg-white p-4 rounded-xl border shadow-sm flex items-center justify-between">
                    <div>
                      <div className="font-medium capitalize">{payment.provider}</div>
                      <div className="text-xs text-muted-foreground font-mono mt-1">ID: {payment.provider_payment_id || payment.provider_order_id}</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {payment.created_at ? format(new Date(payment.created_at), 'PP p') : 'N/A'}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-lg">₹{payment.amount || 0}</div>
                      {payment.status === 'successful' || payment.status === 'paid' ? (
                        <Badge className="mt-1 bg-green-100 text-green-800 border-none">Success</Badge>
                      ) : (
                        <Badge variant="outline" className="mt-1 capitalize">{payment.status}</Badge>
                      )}
                    </div>
                  </div>
                )) : (
                  <div className="bg-gray-50 p-4 rounded-xl border text-center text-sm text-muted-foreground">
                    No payment transactions logged yet.
                  </div>
                )}
              </div>
            </section>

          </div>
        </div>
      </DialogContent>
    </Dialog>
  </>
  )
}
