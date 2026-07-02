import { fetchAPI } from '@/utils/api'
import { Card, CardContent } from '@/components/ui/card'
import { PlusCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AddCouponModal } from './add-coupon-modal'
import { EditCouponModal } from './edit-coupon-modal'
import { DeleteCouponButton } from './delete-coupon-button'
import { ToggleCouponButton } from './toggle-coupon-button'

export const dynamic = 'force-dynamic'

export default async function CouponsPage() {
  const { data: coupons, plans } = await fetchAPI('/api/admin/coupons').catch(() => ({ data: [], plans: [] }))

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Coupons & Influencers</h1>
          <p className="text-muted-foreground mt-2">
            Manage promotional discount codes and track influencer performance.
          </p>
        </div>
        <AddCouponModal plans={plans || []} />
      </div>

      <div className="grid gap-4">
        {coupons?.length === 0 ? (
          <div className="text-center py-12 text-gray-500 border rounded-xl bg-gray-50">
            No coupons found. Create your first one!
          </div>
        ) : (
          coupons?.map((coupon: any) => (
            <Card key={coupon.id}>
              <CardContent className="p-6">
                <div className="flex justify-between items-start gap-4">
                  {/* Left — Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 flex-wrap">
                      <h3 className="text-xl font-bold font-mono text-purple-700 bg-purple-100 px-3 py-1 rounded">
                        {coupon.coupon_code}
                      </h3>
                      <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${coupon.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {coupon.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </div>

                    <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-6">
                      <div>
                        <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Influencer</p>
                        <p className="text-sm font-medium">{coupon.influencer_name}</p>
                        <p className="text-xs text-gray-500">{coupon.influencer_email || '-'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Valid Dates</p>
                        <p className="text-sm">From: {new Date(coupon.start_date).toLocaleDateString()}</p>
                        <p className="text-sm">To: {coupon.end_date ? new Date(coupon.end_date).toLocaleDateString() : 'Forever'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Usage</p>
                        <p className="text-sm font-medium">
                          {coupon.usage_count || 0} / {coupon.max_uses ? coupon.max_uses : 'Unlimited'}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Discounts</p>
                        {Object.entries(coupon.plan_discounts || {}).map(([planId, discount]: any) => {
                          const planName = plans?.find((p: any) => p.id === planId)?.name || planId
                          return (
                            <div key={planId} className="text-sm flex justify-between gap-2">
                              <span className="text-gray-600 truncate">{planName}:</span>
                              <span className="font-semibold whitespace-nowrap">{discount}% off</span>
                            </div>
                          )
                        })}
                        {Object.keys(coupon.plan_discounts || {}).length === 0 && (
                          <p className="text-xs text-gray-400 italic">No discounts set</p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right — Actions */}
                  <div className="flex flex-col gap-2 shrink-0">
                    <EditCouponModal coupon={coupon} plans={plans || []} />
                    <ToggleCouponButton id={coupon.id} isActive={coupon.is_active} />
                    <DeleteCouponButton id={coupon.id} code={coupon.coupon_code} />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  )
}
