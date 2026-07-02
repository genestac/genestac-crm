'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { PlusCircle } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createCoupon } from './actions'

export function AddCouponModal({ plans }: { plans: any[] }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [planDiscounts, setPlanDiscounts] = useState<Record<string, string>>({})

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
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create New Coupon</DialogTitle>
          </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-6 mt-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Influencer Name *</Label>
              <Input name="influencer_name" required placeholder="John Doe" />
            </div>
            <div className="space-y-2">
              <Label>Coupon Code *</Label>
              <Input name="coupon_code" required placeholder="JOHNDOE20" className="uppercase" />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" name="influencer_email" placeholder="john@example.com" />
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input type="tel" name="influencer_phone" placeholder="+1234567890" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Start Date *</Label>
              <Input type="date" name="start_date" required />
            </div>
            <div className="space-y-2">
              <Label>End Date</Label>
              <Input type="date" name="end_date" />
            </div>
            <div className="space-y-2">
              <Label>Max Uses</Label>
              <Input type="number" name="max_uses" placeholder="Unlimited" min="1" />
            </div>
          </div>

          <div className="space-y-3">
            <Label>Plan Discounts (%)</Label>
            <div className="bg-gray-50 p-4 rounded-lg border grid grid-cols-2 gap-4">
              {plans.map(plan => (
                <div key={plan.id} className="flex items-center justify-between gap-4">
                  <Label className="text-sm font-normal truncate flex-1">{plan.name}</Label>
                  <Input 
                    type="number" 
                    placeholder="0%" 
                    min="0" 
                    max="100" 
                    className="w-20"
                    value={planDiscounts[plan.id] || ''}
                    onChange={e => setPlanDiscounts({...planDiscounts, [plan.id]: e.target.value})}
                  />
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-500">Leave blank if the coupon is not valid for a specific plan.</p>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Creating...' : 'Create Coupon'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
    </>
  )
}
