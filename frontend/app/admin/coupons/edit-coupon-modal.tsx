'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Pencil } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Ticket, User, Calendar, Percent } from 'lucide-react'
import { updateCoupon } from './actions'

export function EditCouponModal({ coupon, plans }: { coupon: any; plans: any[] }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [planDiscounts, setPlanDiscounts] = useState<Record<string, string>>(
    Object.fromEntries(
      Object.entries(coupon.plan_discounts || {}).map(([k, v]) => [k, String(v)])
    )
  )
  const [globalDiscount, setGlobalDiscount] = useState('')

  const handleApplyToAll = () => {
    if (!globalDiscount) return
    const newDiscounts: Record<string, string> = {}
    plans.forEach(plan => {
      if (plan.plan_variants?.length > 0) {
        plan.plan_variants.forEach((v: any) => {
          newDiscounts[v.id] = globalDiscount
        })
      } else {
        newDiscounts[plan.id] = globalDiscount
      }
    })
    setPlanDiscounts(newDiscounts)
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)

    const formData = new FormData(e.currentTarget)

    const discounts: Record<string, number> = {}
    Object.entries(planDiscounts).forEach(([id, val]) => {
      if (val && !isNaN(Number(val))) discounts[id] = Number(val)
    })

    const startDateRaw = formData.get('start_date') as string
    const endDateRaw = formData.get('end_date') as string
    const maxUsesRaw = formData.get('max_uses') as string

    const payload: any = {
      influencer_name: formData.get('influencer_name'),
      influencer_email: formData.get('influencer_email') || null,
      influencer_phone: formData.get('influencer_phone') || null,
      coupon_code: formData.get('coupon_code'),
      start_date: startDateRaw ? new Date(startDateRaw).toISOString() : undefined,
      end_date: endDateRaw ? new Date(endDateRaw).toISOString() : null,
      max_uses: maxUsesRaw ? Number(maxUsesRaw) : null,
      plan_discounts: discounts,
    }

    // Remove undefined keys
    Object.keys(payload).forEach(k => payload[k] === undefined && delete payload[k])

    try {
      await updateCoupon(coupon.id, payload)
      setOpen(false)
    } catch (err: any) {
      alert(err.message)
    } finally {
      setLoading(false)
    }
  }

  const toDateInput = (isoString: string | null) => {
    if (!isoString) return ''
    return new Date(isoString).toISOString().split('T')[0]
  }

  return (
    <>
      <Button variant="outline" size="sm" className="gap-1" onClick={() => setOpen(true)}>
        <Pencil className="w-3 h-3" /> Edit
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[700px] p-0 rounded-xl overflow-hidden flex flex-col">
          <div className="bg-gradient-to-br from-indigo-50 to-white px-6 py-6 border-b shrink-0">
            <DialogHeader>
              <DialogTitle className="text-2xl font-bold text-indigo-950 flex items-center gap-2">
                <Ticket className="w-5 h-5 text-indigo-600" /> Edit Coupon — {coupon.coupon_code}
              </DialogTitle>
              <DialogDescription className="text-indigo-900/60 mt-1">
                Update promotional code details and discount rules for specific plans.
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="overflow-y-auto flex-1 p-6 max-h-[70vh]">
            <form id={`edit-coupon-form-${coupon.id}`} onSubmit={handleSubmit} className="space-y-8">
              
              {/* Basic Info Section */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2 border-b pb-2">
                  <User className="w-4 h-4 text-indigo-500" /> Influencer Details
                </h3>
                <div className="grid grid-cols-2 gap-5">
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold text-gray-600">Influencer Name *</Label>
                    <Input name="influencer_name" required defaultValue={coupon.influencer_name} className="bg-gray-50/50" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold text-gray-600">Coupon Code *</Label>
                    <Input name="coupon_code" required defaultValue={coupon.coupon_code} className="uppercase font-mono bg-indigo-50/30 border-indigo-200 focus-visible:ring-indigo-500" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold text-gray-600">Email Address</Label>
                    <Input type="email" name="influencer_email" defaultValue={coupon.influencer_email || ''} placeholder="john@example.com" className="bg-gray-50/50" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold text-gray-600">Phone Number</Label>
                    <Input type="tel" name="influencer_phone" defaultValue={coupon.influencer_phone || ''} placeholder="+1234567890" className="bg-gray-50/50" />
                  </div>
                </div>
              </div>

              {/* Usage & Dates Section */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2 border-b pb-2">
                  <Calendar className="w-4 h-4 text-indigo-500" /> Validity & Usage
                </h3>
                <div className="grid grid-cols-3 gap-5">
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold text-gray-600">Start Date *</Label>
                    <Input type="date" name="start_date" required defaultValue={toDateInput(coupon.start_date)} className="bg-gray-50/50" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold text-gray-600">End Date</Label>
                    <Input type="date" name="end_date" defaultValue={toDateInput(coupon.end_date)} className="bg-gray-50/50" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold text-gray-600">Max Uses</Label>
                    <Input type="number" name="max_uses" placeholder="Unlimited" min="1" defaultValue={coupon.max_uses || ''} className="bg-gray-50/50" />
                  </div>
                </div>
              </div>

              {/* Plan Discounts Section */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2 border-b pb-2">
                  <Percent className="w-4 h-4 text-indigo-500" /> Plan Discounts
                </h3>
                <div className="flex items-center justify-between">
                  <p className="text-xs text-gray-500">Configure the percentage discount applied when this coupon is used.</p>
                  <div className="flex items-center gap-2">
                    <Input 
                      type="number" 
                      placeholder="%" 
                      min="0" 
                      max="100" 
                      value={globalDiscount}
                      onChange={e => setGlobalDiscount(e.target.value)}
                      className="w-16 h-8 text-sm px-2 bg-gray-50"
                    />
                    <Button type="button" onClick={handleApplyToAll} variant="secondary" size="sm" className="h-8 text-xs bg-indigo-50 text-indigo-600 hover:bg-indigo-100">
                      Apply to All
                    </Button>
                  </div>
                </div>
                <div className="bg-gray-50 p-5 rounded-xl border flex flex-col gap-5">
                  {plans.map(plan => (
                    <div key={plan.id} className="space-y-2">
                       <h4 className="font-semibold text-gray-800 text-sm border-b border-gray-200 pb-1">{plan.name}</h4>
                       <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                         {plan.plan_variants?.length > 0 ? plan.plan_variants.map((v: any) => (
                           <div key={v.id} className="flex items-center justify-between gap-3 bg-white p-2.5 rounded-lg border shadow-sm hover:border-indigo-200 transition-colors">
                             <Label className="text-sm font-medium text-gray-700 truncate flex-1">{v.duration_label}</Label>
                             <div className="relative w-24 shrink-0">
                               <Input 
                                 type="number" placeholder="0" min="0" max="100" step="any"
                                 className="pr-8 text-right font-mono h-8 bg-gray-50 focus:bg-white"
                                 value={planDiscounts[v.id] || ''}
                                 onChange={e => setPlanDiscounts({...planDiscounts, [v.id]: e.target.value})}
                               />
                               <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs font-semibold">%</span>
                             </div>
                           </div>
                         )) : (
                           <div className="flex items-center justify-between gap-3 bg-white p-2.5 rounded-lg border shadow-sm">
                             <Label className="text-sm font-medium text-gray-700 truncate flex-1">Base Plan</Label>
                             <div className="relative w-24 shrink-0">
                               <Input 
                                 type="number" placeholder="0" min="0" max="100" step="any"
                                 className="pr-8 text-right font-mono h-8 bg-gray-50 focus:bg-white"
                                 value={planDiscounts[plan.id] || ''}
                                 onChange={e => setPlanDiscounts({...planDiscounts, [plan.id]: e.target.value})}
                               />
                               <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs font-semibold">%</span>
                             </div>
                           </div>
                         )}
                       </div>
                    </div>
                  ))}
                </div>
              </div>
            </form>
          </div>

          <div className="flex justify-end gap-3 px-6 py-4 border-t bg-gray-50 shrink-0">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} className="px-6">Cancel</Button>
            <Button type="submit" form={`edit-coupon-form-${coupon.id}`} disabled={loading} className="px-8 bg-indigo-600 hover:bg-indigo-700 text-white shadow-md">
              {loading ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
