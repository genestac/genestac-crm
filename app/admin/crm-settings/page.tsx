import { createClient } from '@/utils/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { addPlan, addSource } from './actions'

export default async function CRMSettingsPage() {
  const supabase = await createClient()

  const { data: plans } = await supabase.from('plans').select('*').order('created_at', { ascending: false })
  const { data: sources } = await supabase.from('user_sources').select('*').order('created_at', { ascending: false })

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">CRM Settings</h1>
        <p className="text-muted-foreground mt-2">
          Manage dynamic dropdowns like Sales Plans and User Sources.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        {/* Plans Management */}
        <Card>
          <CardHeader>
            <CardTitle>Medical Plans</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={async (fd) => { await addPlan(fd) }} className="flex gap-2 mb-6">
              <Input name="name" placeholder="Plan Name (e.g. Premium Health)" required />
              <Input name="price" type="number" placeholder="Price (₹)" className="w-32" required />
              <Button type="submit">Add</Button>
            </form>

            <div className="space-y-3">
              {plans?.map((plan) => (
                <div key={plan.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border">
                  <div>
                    <p className="font-medium">{plan.name}</p>
                    <p className="text-sm text-gray-500">₹{plan.price}</p>
                  </div>
                  <span className={`px-2 py-1 text-xs rounded-full ${plan.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}`}>
                    {plan.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Sources Management */}
        <Card>
          <CardHeader>
            <CardTitle>Lead Sources</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={async (fd) => { await addSource(fd) }} className="flex gap-2 mb-6">
              <Input name="name" placeholder="Source Name (e.g. Google Ads)" required />
              <Button type="submit">Add</Button>
            </form>

            <div className="space-y-3">
              {sources?.map((source) => (
                <div key={source.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border">
                  <p className="font-medium">{source.name}</p>
                  <span className={`px-2 py-1 text-xs rounded-full ${source.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}`}>
                    {source.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
