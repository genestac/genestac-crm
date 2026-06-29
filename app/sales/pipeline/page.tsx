import { createClient } from '@/utils/supabase/server'
import { UserManagementSheet } from '@/components/sales/user-management-sheet'
import { Card, CardContent } from '@/components/ui/card'

const PIPELINE_STAGES = [
  'NEW',
  'UNREAD',
  'ASSIGNED',
  'CONTACT_ATTEMPTED',
  'CONTACTED',
  'QUALIFIED',
  'CONSULTATION_SCHEDULED',
  'CONSULTATION_COMPLETED',
  'CONVERTED'
]

export default async function PipelinePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: users } = await supabase
    .from('users')
    .select('*, plans(name)')
    .eq('assigned_sales_rep_id', user?.id)

  const usersByStage = PIPELINE_STAGES.reduce((acc, stage) => {
    acc[stage] = users?.filter(u => u.status === stage) || []
    return acc
  }, {} as Record<string, any[]>)

  return (
    <div className="h-full flex flex-col">
      <div className="mb-6 shrink-0">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">Pipeline Board</h1>
        <p className="text-muted-foreground mt-2">
          Visual overview of all your users across every lifecycle stage.
        </p>
      </div>

      <div className="flex-1 overflow-x-auto pb-4">
        <div className="flex gap-4 min-w-max h-full">
          {PIPELINE_STAGES.map(stage => (
            <div key={stage} className="w-80 flex flex-col bg-gray-50/50 rounded-xl border border-gray-200">
              <div className="p-3 border-b border-gray-200 bg-gray-100/50 rounded-t-xl shrink-0">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-gray-700 text-sm">{stage.replace(/_/g, ' ')}</h3>
                  <span className="bg-white text-gray-600 text-xs py-0.5 px-2 rounded-full border shadow-sm">
                    {usersByStage[stage].length}
                  </span>
                </div>
              </div>
              
              <div className="flex-1 p-3 overflow-y-auto space-y-3">
                {usersByStage[stage].map(u => (
                  <UserManagementSheet key={u.id} lead={u}>
                    <button type="button" className="w-full text-left outline-none appearance-none focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xl">
                      <Card className="cursor-pointer hover:border-primary/50 hover:shadow-md transition-all">
                        <CardContent className="p-4 space-y-2">
                          <div className="flex justify-between items-start">
                            <p className="font-medium text-sm">{u.name || u.phone}</p>
                            {u.priority === 'HIGH' && (
                              <span className="w-2 h-2 rounded-full bg-red-500 mt-1.5" />
                            )}
                          </div>
                          {u.name && <p className="text-xs text-gray-500">{u.phone}</p>}
                          
                          {u.plans && (
                            <div className="inline-flex text-[10px] uppercase font-semibold tracking-wider bg-indigo-50 text-indigo-700 px-2 py-1 rounded">
                              {u.plans.name}
                            </div>
                          )}
                          
                          {u.next_followup_date && (
                            <p className="text-xs text-gray-500 flex items-center pt-2 border-t mt-2">
                              <span className="mr-1">🕒</span> 
                              {new Date(u.next_followup_date).toLocaleDateString()}
                            </p>
                          )}
                        </CardContent>
                      </Card>
                    </button>
                  </UserManagementSheet>
                ))}
                
                {usersByStage[stage].length === 0 && (
                  <div className="text-center p-4 border-2 border-dashed rounded-lg border-gray-200 text-gray-400 text-xs">
                    No users in this stage
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
