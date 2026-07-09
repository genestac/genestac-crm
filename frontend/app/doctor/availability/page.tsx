import { getDoctorAvailability } from '@/app/doctor/actions'
import AvailabilityForm from './availability-form'

export default async function AvailabilityPage() {
  const data = await getDoctorAvailability()

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">Availability & Schedule</h1>
        <p className="text-gray-500 mt-2">
          Manage your live AI call routing status. The AI will only route live calls to you when you are active or within your scheduled working hours.
        </p>
      </div>

      <div className="bg-white rounded-2xl shadow-xl shadow-gray-200/50 border border-gray-100 p-8">
        <AvailabilityForm initialData={data} />
      </div>
    </div>
  )
}
