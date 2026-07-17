import { fetchDoctorConsultations, fetchDoctorDetails } from '../../actions'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, Calendar as CalendarIcon, Clock, User, AlertCircle } from 'lucide-react'
import Link from 'next/link'
import { format } from 'date-fns'

export const dynamic = 'force-dynamic'

export default async function DoctorConsultationsPage({ params }: { params: Promise<{ id: string }> }) {
  const unwrappedParams = await params
  const id = unwrappedParams.id

  const [docRes, consultationsRes] = await Promise.all([
    fetchDoctorDetails(id),
    fetchDoctorConsultations(id)
  ])

  const doctor = docRes.success ? docRes.data : null
  const consultations = consultationsRes.success ? consultationsRes.data : []
  const error = (!docRes.success && docRes.error) || (!consultationsRes.success && consultationsRes.error)

  if (error && !doctor) {
    return (
      <div className="p-4 bg-red-50 text-red-600 rounded-md flex items-center gap-2">
        <AlertCircle className="w-5 h-5" />
        {error}
      </div>
    )
  }

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'completed': return 'bg-green-100 text-green-800'
      case 'cancelled': return 'bg-red-100 text-red-800'
      case 'scheduled': return 'bg-blue-100 text-blue-800'
      case 'pending': return 'bg-yellow-100 text-yellow-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/admin/doctors">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Consultations</h1>
          <p className="text-muted-foreground">{doctor?.full_name}</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Consultations</CardTitle>
          <CardDescription>View upcoming and past appointments for this doctor.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {consultations.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground border-2 border-dashed rounded-lg">
                No consultations found for this doctor.
              </div>
            ) : (
              consultations.map((apt: any) => (
                <div key={apt.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 border rounded-xl bg-card hover:bg-accent/50 transition-colors gap-4">
                  
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <CalendarIcon className="w-6 h-6 text-primary" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-lg">{apt.patients?.name || 'Unknown Patient'}</h4>
                      <div className="flex items-center text-sm text-muted-foreground gap-3 mt-1">
                        <span className="flex items-center gap-1">
                          <User className="w-4 h-4" />
                          {apt.patients?.phone || 'No Phone'}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-4 h-4" />
                          {format(new Date(apt.scheduled_at), "MMM d, yyyy h:mm a")} ({apt.duration_minutes} min)
                        </span>
                      </div>
                      {apt.reason && (
                        <p className="text-sm mt-2 font-medium text-foreground/80 line-clamp-1">
                          Reason: {apt.reason}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:flex-col sm:items-end gap-2 shrink-0">
                    <span className={`px-2.5 py-1 text-xs font-semibold rounded-full capitalize ${getStatusColor(apt.status)}`}>
                      {apt.status}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      ID: {apt.id.substring(0, 8)}
                    </span>
                  </div>

                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
