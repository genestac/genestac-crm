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
            <Card key={coupon.id} className="overflow-hidden border-gray-200 shadow-sm hover:shadow-md transition-shadow duration-200 group">
              <div className="bg-gradient-to-r from-indigo-50/50 to-white px-6 py-4 border-b flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <h3 className="text-xl font-bold font-mono text-indigo-700 bg-indigo-100/80 px-3 py-1 rounded-md border border-indigo-200 shadow-sm">
                    {coupon.coupon_code}
                  </h3>
                  <span className={`px-2.5 py-1 text-xs rounded-full font-semibold uppercase tracking-wider ${coupon.is_active ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-red-100 text-red-700 border border-red-200'}`}>
                    {coupon.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <EditCouponModal coupon={coupon} plans={plans || []} />
                  <ToggleCouponButton id={coupon.id} isActive={coupon.is_active} />
                  <DeleteCouponButton id={coupon.id} code={coupon.coupon_code} />
                </div>
              </div>

              <CardContent className="p-0">
                <div className="grid grid-cols-1 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x border-b">
                  <div className="p-5">
                    <p className="text-[11px] text-gray-500 uppercase tracking-wider font-bold mb-1.5 flex items-center gap-1.5">
                      Influencer Details
                    </p>
                    <p className="text-sm font-semibold text-gray-900">{coupon.influencer_name}</p>
                    {coupon.influencer_email && <p className="text-sm text-gray-600">{coupon.influencer_email}</p>}
                    {coupon.influencer_phone && <p className="text-sm text-gray-600">{coupon.influencer_phone}</p>}
                  </div>
                  
                  <div className="p-5">
                    <p className="text-[11px] text-gray-500 uppercase tracking-wider font-bold mb-1.5">
                      Valid Dates
                    </p>
                    <p className="text-sm text-gray-900"><span className="text-gray-500 mr-2">From:</span> {new Date(coupon.start_date).toLocaleDateString()}</p>
                    <p className="text-sm text-gray-900"><span className="text-gray-500 mr-2">To:</span> {coupon.end_date ? new Date(coupon.end_date).toLocaleDateString() : 'Forever'}</p>
                  </div>
                  
                  <div className="p-5">
                    <p className="text-[11px] text-gray-500 uppercase tracking-wider font-bold mb-1.5">
                      Usage
                    </p>
                    <div className="flex items-end gap-2">
                      <span className="text-2xl font-bold text-gray-900 leading-none">{coupon.usage_count || 0}</span>
                      <span className="text-sm text-gray-500 pb-0.5">/ {coupon.max_uses ? coupon.max_uses : 'Unlimited'}</span>
                    </div>
                  </div>
                  
                  <div className="p-5 bg-gray-50/50">
                    <p className="text-[11px] text-gray-500 uppercase tracking-wider font-bold mb-2">
                      Plan Discounts
                    </p>
                    <div className="space-y-1.5">
                      {Object.entries(coupon.plan_discounts || {}).map(([targetId, discount]: any) => {
                        let displayName = targetId
                        
                        // Try to find if it's a plan ID
                        const matchingPlan = plans?.find((p: any) => p.id === targetId)
                        if (matchingPlan) {
                          displayName = matchingPlan.name
                        } else {
                          // Try to find if it's a variant ID
                          plans?.forEach((p: any) => {
                            const matchingVariant = p.plan_variants?.find((v: any) => v.id === targetId)
                            if (matchingVariant) {
                              displayName = `${p.name} (${matchingVariant.duration_label})`
                            }
                          })
                        }

                        return (
                          <div key={targetId} className="text-sm flex justify-between items-center gap-2 bg-white px-2.5 py-1 rounded border border-gray-100 shadow-sm">
                            <span className="text-gray-700 truncate font-medium">{displayName}</span>
                            <span className="font-bold text-amber-600 whitespace-nowrap bg-amber-50 px-1.5 rounded">{discount}% OFF</span>
                          </div>
                        )
                      })}
                      {Object.keys(coupon.plan_discounts || {}).length === 0 && (
                        <p className="text-xs text-gray-400 italic">No discounts set</p>
                      )}
                    </div>
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
