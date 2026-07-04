import { WorkInProgress } from '@/components/ui/work-in-progress'

export default function DoctorsPage() {
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
      <WorkInProgress title="Doctors Module in Development" description="Doctor management and scheduling features are currently under construction." />
    </div>
  )
}
