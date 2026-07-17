import { fetchAdminDoctors } from './actions'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { AlertCircle, User, Calendar, Settings } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function DoctorsPage() {
  const { success, data, error } = await fetchAdminDoctors()
  
  if (!success) {
    return (
      <div className="p-4 bg-red-50 text-red-600 rounded-md flex items-center gap-2">
        <AlertCircle className="w-5 h-5" />
        {error}
      </div>
    )
  }

  const doctors = data || []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Doctors</h1>
          <p className="text-muted-foreground mt-2">
            Manage medical professionals and their schedules.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {doctors.map((doctor: any) => {
          const schedule = doctor.schedule || {}
          return (
            <Card key={doctor.id} className="overflow-hidden">
              <CardHeader className="bg-gray-50 border-b pb-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                      <User className="w-5 h-5" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">{doctor.full_name}</CardTitle>
                      <p className="text-sm text-muted-foreground">{doctor.email}</p>
                    </div>
                  </div>
                  <Badge variant={schedule.is_active ? 'default' : 'secondary'}>
                    {schedule.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="pt-4 space-y-4">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="text-muted-foreground">AI Calls:</div>
                  <div className="font-medium text-right">
                    {schedule.allow_ai_calls !== false ? <span className="text-green-600">Enabled</span> : <span className="text-red-600">Disabled</span>}
                  </div>
                  <div className="text-muted-foreground">Scheduling:</div>
                  <div className="font-medium text-right">
                    {schedule.allow_scheduling !== false ? <span className="text-green-600">Enabled</span> : <span className="text-red-600">Disabled</span>}
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <Link href={`/admin/doctors/${doctor.id}`} className="flex-1">
                    <Button variant="outline" className="w-full" size="sm">
                      <Settings className="w-4 h-4 mr-2" />
                      Settings
                    </Button>
                  </Link>
                  <Link href={`/admin/doctors/${doctor.id}/consultations`} className="flex-1">
                    <Button variant="outline" className="w-full" size="sm">
                      <Calendar className="w-4 h-4 mr-2" />
                      Consultations
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          )
        })}

        {doctors.length === 0 && (
          <div className="col-span-full py-12 text-center text-muted-foreground bg-white rounded-xl border border-dashed">
            No doctors found. Add a staff member with the "doctor" role.
          </div>
        )}
      </div>
    </div>
  )
}
