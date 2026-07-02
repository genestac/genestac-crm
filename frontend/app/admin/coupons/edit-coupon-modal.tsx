'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Pencil } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { updateCoupon } from './actions'

export function EditCouponModal({ coupon, plans }: { coupon: any; plans: any[] }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [planDiscounts, setPlanDiscounts] = useState<Record<string, string>>(
    Object.fromEntries(
      Object.entries(coupon.plan_discounts || {}).map(([k, v]) => [k, String(v)])
    )
  )

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
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Coupon — {coupon.coupon_code}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-6 mt-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Influencer Name *</Label>
                <Input name="influencer_name" required defaultValue={coupon.influencer_name} />
              </div>
              <div className="space-y-2">
                <Label>Coupon Code *</Label>
                <Input name="coupon_code" required defaultValue={coupon.coupon_code} className="uppercase" />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input type="email" name="influencer_email" defaultValue={coupon.influencer_email || ''} placeholder="john@example.com" />
              </div>
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input type="tel" name="influencer_phone" defaultValue={coupon.influencer_phone || ''} placeholder="+1234567890" />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Start Date *</Label>
                <Input type="date" name="start_date" required defaultValue={toDateInput(coupon.start_date)} />
              </div>
              <div className="space-y-2">
                <Label>End Date</Label>
                <Input type="date" name="end_date" defaultValue={toDateInput(coupon.end_date)} />
              </div>
              <div className="space-y-2">
                <Label>Max Uses</Label>
                <Input type="number" name="max_uses" placeholder="Unlimited" min="1" defaultValue={coupon.max_uses || ''} />
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
                      onChange={e => setPlanDiscounts({ ...planDiscounts, [plan.id]: e.target.value })}
                    />
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-500">Leave blank to remove the discount for that plan.</p>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={loading}>
                {loading ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
