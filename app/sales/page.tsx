import { createClient } from '@/utils/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Users, AlertCircle, CheckCircle2, Clock } from 'lucide-react'
import { UserManagementSheet } from '@/components/sales/user-management-sheet'

export default async function SalesDashboard() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  // Fetch metrics
  const { count: untouchedCount } = await supabase
    .from('users')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'UNREAD')
    
  const { count: assignedCount } = await supabase
    .from('users')
    .select('*', { count: 'exact', head: true })
    .eq('assigned_sales_rep_id', user?.id)
    .neq('status', 'CONVERTED')
    .neq('status', 'LOST')
    
  const { count: convertedCount } = await supabase
    .from('users')
    .select('*', { count: 'exact', head: true })
    .eq('assigned_sales_rep_id', user?.id)
    .eq('status', 'CONVERTED')

  // Fetch follow-ups due today
  const today = new Date()
  today.setHours(0,0,0,0)
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)

  const { data: followUpsToday } = await supabase
    .from('users')
    .select('id, phone, status, priority, followup_notes')
    .eq('assigned_sales_rep_id', user?.id)
    .gte('next_followup_date', today.toISOString())
    .lt('next_followup_date', tomorrow.toISOString())

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">Dashboard</h1>
        <p className="text-muted-foreground mt-2">
          Welcome to your personal sales workspace. Here's what needs your attention.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Untouched Users</CardTitle>
            <AlertCircle className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{untouchedCount || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">
              New users requiring initial contact
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">My Active Pipeline</CardTitle>
            <Users className="h-4 w-4 text-indigo-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{assignedCount || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Users actively being worked
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Follow-ups Today</CardTitle>
            <Clock className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{followUpsToday?.length || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Scheduled for today
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">My Conversions</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{convertedCount || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Total users converted
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Follow-ups List */}
      <div className="mt-8">
        <h2 className="text-xl font-semibold mb-4">Urgent Follow-ups</h2>
        <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
          {followUpsToday && followUpsToday.length > 0 ? (
            <table className="w-full text-sm text-left">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-6 py-4 font-medium text-gray-900">Phone</th>
                  <th className="px-6 py-4 font-medium text-gray-900">Status</th>
                  <th className="px-6 py-4 font-medium text-gray-900">Priority</th>
                  <th className="px-6 py-4 font-medium text-gray-900">Notes</th>
                  <th className="px-6 py-4 font-medium text-gray-900 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {followUpsToday.map((lead) => (
                  <tr key={lead.id} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="px-6 py-4 font-medium">{lead.phone}</td>
                    <td className="px-6 py-4">
                      <span className="px-2 py-1 bg-indigo-100 text-indigo-700 rounded-md text-xs font-medium">
                        {lead.status}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded-md text-xs font-medium ${
                        lead.priority === 'HIGH' ? 'bg-red-100 text-red-700' :
                        lead.priority === 'MEDIUM' ? 'bg-amber-100 text-amber-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {lead.priority || 'MEDIUM'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-500 truncate max-w-[200px]">
                      {lead.followup_notes || '-'}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <UserManagementSheet lead={lead}>
                        <button className="text-indigo-600 hover:text-indigo-900 font-medium text-sm">
                          Open User
                        </button>
                      </UserManagementSheet>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="p-12 text-center text-gray-500">
              <CheckCircle2 className="w-12 h-12 mx-auto text-green-200 mb-4" />
              <p>No follow-ups scheduled for today. You're all caught up!</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
