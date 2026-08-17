'use client'

/**
 * OrderDetailsSheet
 * A centered modal dialog showing user profile information, medical history, order items, and transaction history.
 */
import { useState, useTransition } from 'react'
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
import { Eye, User, FileText, CreditCard, Activity, ShoppingBag, Upload } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { approveOrderPrescription, uploadOrderPrescriptionAction } from './actions'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function OrderDetailsSheet({ order }: { order: any }) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()


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

  const handleApprove = () => {
    startTransition(async () => {
      const res = await approveOrderPrescription(order.id)
      if (res.success) {
        toast.success("Prescription approved successfully.")
        setOpen(false)
      } else {
        toast.error("Failed to approve prescription: " + res.error)
      }
    })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleUploadRx = async (e: any) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.append("file", file);
        const res = await uploadOrderPrescriptionAction(order.id, formData);
        if (res.success) {
          toast.success("Prescription uploaded successfully.")
        } else {
          toast.error("Failed to upload prescription: " + res.error)
        }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (err: any) {
        toast.error("Failed to upload: " + err.message)
      }
    })
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

            {/* Prescription Section */}
            {(order.prescription_status && order.prescription_status !== 'not_required') && (
              <section className="px-6 py-4 bg-purple-50/50 border-b">
                <h3 className="text-lg font-semibold flex items-center gap-2 mb-4 text-purple-900">
                  <FileText className="h-5 w-5 text-purple-500" /> Prescription Details
                </h3>
                <div className="bg-white rounded-xl border shadow-sm p-4 space-y-4">
                  <div className="flex justify-between items-center">
                    <div>
                      <span className="text-sm font-medium text-gray-700">Status</span>
                      <div className="mt-1">
                        <Badge className="capitalize">{order.prescription_status.replace('_', ' ')}</Badge>
                      </div>
                    </div>
                    {order.prescription_url && (
                      <a href={order.prescription_url} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline flex items-center gap-1">
                        <Eye className="w-4 h-4" /> View Document
                      </a>
                    )}
                  </div>
                  
                  {order.prescription_status === 'pending_review' && (
                    <div className="flex gap-2 pt-2 border-t">
                      <Button onClick={handleApprove} disabled={isPending} className="bg-green-600 hover:bg-green-700 text-white flex-1">
                        {isPending ? 'Processing...' : 'Approve Prescription'}
                      </Button>
                      {user?.phone && (
                        <a 
                          href={`https://wa.me/${user.phone.replace(/\D/g, '')}?text=${encodeURIComponent(`Hi ${user.name || 'there'},\n\nWe received your order which is currently pending prescription review. We need a bit more information to proceed.`)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border h-9 px-4 py-2 text-green-700 border-green-200 bg-green-50 hover:bg-green-100"
                          title="Message on WhatsApp"
                        >
                          <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/>
                          </svg>
                          WhatsApp
                        </a>
                      )}
                    </div>
                  )}

                  {order.prescription_status === 'consultation_booked' && (
                    <div className="flex flex-col gap-2 pt-2 border-t">
                      <label className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium cursor-pointer disabled:opacity-50 transition">
                        <Upload className="w-4 h-4" />
                        Upload Prescription After Consultation
                        <input type="file" className="hidden" accept="image/*,.pdf" onChange={handleUploadRx} disabled={isPending} />
                      </label>
                    </div>
                  )}
                </div>
              </section>
            )}

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
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
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
                
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
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
