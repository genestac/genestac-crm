'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { PlusCircle } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Ticket, User, Calendar, Percent } from 'lucide-react'
import { createCoupon } from './actions'

export function AddCouponModal({ plans }: { plans: any[] }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [planDiscounts, setPlanDiscounts] = useState<Record<string, string>>({})
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
    
    // Clean up empty strings
    const discounts: Record<string, number> = {}
    Object.entries(planDiscounts).forEach(([id, val]) => {
      if (val && !isNaN(Number(val))) {
        discounts[id] = Number(val)
      }
    })

    const payload = {
      influencer_name: formData.get('influencer_name'),
      influencer_email: formData.get('influencer_email') || null,
      influencer_phone: formData.get('influencer_phone') || null,
      coupon_code: formData.get('coupon_code'),
      start_date: new Date(formData.get('start_date') as string).toISOString(),
      end_date: formData.get('end_date') ? new Date(formData.get('end_date') as string).toISOString() : null,
      max_uses: formData.get('max_uses') ? Number(formData.get('max_uses')) : null,
      plan_discounts: discounts
    }

    try {
      await createCoupon(payload)
      setOpen(false)
    } catch (err: any) {
      alert(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Button className="gap-2" onClick={() => setOpen(true)}>
        <PlusCircle className="w-4 h-4" /> Create Coupon
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[700px] p-0 rounded-xl overflow-hidden flex flex-col">
          <div className="bg-gradient-to-br from-indigo-50 to-white px-6 py-6 border-b shrink-0">
            <DialogHeader>
              <DialogTitle className="text-2xl font-bold text-indigo-950 flex items-center gap-2">
                <Ticket className="w-5 h-5 text-indigo-600" /> Create New Coupon
              </DialogTitle>
              <DialogDescription className="text-indigo-900/60 mt-1">
                Generate a promotional code and set discount rules for specific plans.
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="overflow-y-auto flex-1 p-6 max-h-[70vh]">
            <form id="add-coupon-form" onSubmit={handleSubmit} className="space-y-8">
              
              {/* Basic Info Section */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2 border-b pb-2">
                  <User className="w-4 h-4 text-indigo-500" /> Influencer Details
                </h3>
                <div className="grid grid-cols-2 gap-5">
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold text-gray-600">Influencer Name *</Label>
                    <Input name="influencer_name" required placeholder="John Doe" className="bg-gray-50/50" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold text-gray-600">Coupon Code *</Label>
                    <Input name="coupon_code" required placeholder="JOHNDOE20" className="uppercase font-mono bg-indigo-50/30 border-indigo-200 focus-visible:ring-indigo-500" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold text-gray-600">Email Address</Label>
                    <Input type="email" name="influencer_email" placeholder="john@example.com" className="bg-gray-50/50" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold text-gray-600">Phone Number</Label>
                    <Input type="tel" name="influencer_phone" placeholder="+1234567890" className="bg-gray-50/50" />
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
                    <Input type="date" name="start_date" required className="bg-gray-50/50" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold text-gray-600">End Date</Label>
                    <Input type="date" name="end_date" className="bg-gray-50/50" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold text-gray-600">Max Uses</Label>
                    <Input type="number" name="max_uses" placeholder="Unlimited" min="1" className="bg-gray-50/50" />
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
            <Button type="submit" form="add-coupon-form" disabled={loading} className="px-8 bg-indigo-600 hover:bg-indigo-700 text-white shadow-md">
              {loading ? 'Creating...' : 'Create Coupon'}
            </Button>
          </div>
        </DialogContent>
    </Dialog>
    </>
  )
}
