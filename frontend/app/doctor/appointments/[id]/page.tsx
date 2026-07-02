import { getAppointmentById } from '@/app/doctor/actions'
import { ConsultationWorkspace } from '@/components/doctor/consultation-workspace'
import { notFound } from 'next/navigation'

export default async function ConsultationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  
  let appointment
  try {
    appointment = await getAppointmentById(id)
  } catch (error) {
    console.error("Failed to load appointment:", error)
  }

  if (!appointment) {
    notFound()
  }

  return (
    <div className="h-full bg-gray-50 flex flex-col -mx-8 -my-6 min-h-[calc(100vh-64px)]">
      <ConsultationWorkspace appointment={appointment} />
    </div>
  )
}
