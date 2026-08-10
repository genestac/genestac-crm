'use client'

import { useState } from 'react'
import { updateSubscription, upgradeSubscription } from './actions'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

type Plan = { id: string; name: string }
type Variant = { id: string; plan_id: string; duration_label: string; duration_days: number; base_price: number }

export function SubscriptionActions({
  subscription,
  plans,
  variants,
}: {
  subscription: any
  plans: Plan[]
  variants: Variant[]
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [tab, setTab] = useState<'status' | 'upgrade'>('status')
  const [status, setStatus] = useState(subscription.status)
  const [selectedPlanId, setSelectedPlanId] = useState('')
  const [selectedVariantId, setSelectedVariantId] = useState('')
  const [loading, setLoading] = useState(false)

  const filteredVariants = variants.filter(v => v.plan_id === selectedPlanId)

  const handleSaveStatus = async () => {
    setLoading(true)
    try {
      await updateSubscription(subscription.id, { status })
      setIsOpen(false)
    } catch {
      alert('Failed to update subscription')
    } finally {
      setLoading(false)
    }
  }

  const handleUpgrade = async () => {
    if (!selectedPlanId || !selectedVariantId) {
      alert('Please select a plan and duration')
      return
    }
    setLoading(true)
    try {
      await upgradeSubscription(subscription.id, selectedPlanId, selectedVariantId)
      setIsOpen(false)
    } catch (err: any) {
      alert(err.message || 'Failed to upgrade subscription')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        Manage
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Manage Subscription</DialogTitle>
          <p className="text-sm text-muted-foreground">{subscription.users?.name}</p>
        </DialogHeader>

        {/* Tabs */}
        <div className="flex gap-2 border-b pb-2">
          <button
            onClick={() => setTab('status')}
            className={`text-sm px-3 py-1.5 rounded-md font-medium transition-colors ${tab === 'status' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            Change Status
          </button>
          <button
            onClick={() => setTab('upgrade')}
            className={`text-sm px-3 py-1.5 rounded-md font-medium transition-colors ${tab === 'upgrade' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            Upgrade Plan
          </button>
        </div>

        {tab === 'status' ? (
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Status</label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="expired">Expired</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsOpen(false)} disabled={loading}>Cancel</Button>
              <Button onClick={handleSaveStatus} disabled={loading}>
                {loading ? 'Saving...' : 'Save Changes'}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground bg-amber-50 border border-amber-200 rounded-md p-3">
              ⚡ Upgrading will cancel the current plan and start a fresh one from today.
            </p>
            <div className="space-y-2">
              <label className="text-sm font-medium">New Plan</label>
              <Select value={selectedPlanId} onValueChange={(v) => { setSelectedPlanId(v); setSelectedVariantId('') }}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a plan..." />
                </SelectTrigger>
                <SelectContent>
                  {plans.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {selectedPlanId && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Duration</label>
                <Select value={selectedVariantId} onValueChange={setSelectedVariantId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select duration..." />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredVariants.map(v => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.duration_label} — ₹{v.base_price?.toLocaleString('en-IN')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsOpen(false)} disabled={loading}>Cancel</Button>
              <Button onClick={handleUpgrade} disabled={loading || !selectedVariantId}>
                {loading ? 'Upgrading...' : 'Upgrade Plan'}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
