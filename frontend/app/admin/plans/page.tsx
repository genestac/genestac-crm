import { fetchAPI } from '@/utils/api'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Switch } from '@/components/ui/switch'
import { AddPlanModal } from './add-plan-modal'
import { EditPlanModal } from './edit-plan-modal'
import { togglePlan } from './actions'

// Helper component for toggle
function PlanToggle({ plan }: { plan: any }) {
  return (
    <form action={async () => {
      'use server'
      await togglePlan(plan.id, !plan.is_active)
    }}>
      <Switch checked={plan.is_active} {...({ type: 'submit' } as any)} />
    </form>
  )
}

export default async function PlansPage() {
  let plans: any[] = []
  let errorMsg = null

  try {
    const res = await fetchAPI('/api/admin/crm-settings/plans')
    plans = res.data || []
  } catch (err: any) {
    errorMsg = err.message
  }

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Medical Plans</h1>
          <p className="text-muted-foreground mt-2">
            Manage the plans that are available for purchase by your patients.
          </p>
        </div>
        <AddPlanModal />
      </div>

      {errorMsg ? (
        <div className="bg-red-50 text-red-700 p-4 rounded-md">
          Failed to load plans: {errorMsg}
        </div>
      ) : (
        <div className="bg-white border rounded-lg overflow-hidden shadow-sm">
          <Table>
            <TableHeader className="bg-gray-50/50">
              <TableRow>
                <TableHead>Plan Name</TableHead>
                <TableHead>Pricing & Durations</TableHead>
                <TableHead>Features</TableHead>
                <TableHead>GST</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {plans.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-gray-500">
                    No plans found. Create one above.
                  </TableCell>
                </TableRow>
              ) : (
                plans.map((plan: any) => (
                  <TableRow key={plan.id}>
                    <TableCell className="font-medium">
                      {plan.name}
                      {plan.is_featured && <span className="ml-2 text-[10px] bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded-full">Featured</span>}
                      {plan.is_entry_level && <span className="ml-2 text-[10px] bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full">Entry</span>}
                    </TableCell>
                    <TableCell className="text-gray-500 text-sm">
                      {plan.plan_variants?.length > 0 ? (
                        <div className="flex flex-col gap-1">
                          {plan.plan_variants.map((v: any) => (
                            <div key={v.id} className="flex justify-between gap-4">
                              <span>{v.duration_label}:</span>
                              <span className="font-mono font-medium">₹{v.discounted_price || v.base_price}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span>₹{plan.price} ({plan.cadence || '-'})</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-gray-500">
                      {plan.features?.length || 0} features
                    </TableCell>
                    <TableCell className="text-sm text-gray-500 font-medium">
                      {plan.gst_percentage || 0}%
                    </TableCell>
                    <TableCell>
                      <PlanToggle plan={plan} />
                    </TableCell>
                    <TableCell className="text-right">
                      <EditPlanModal plan={plan} />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
