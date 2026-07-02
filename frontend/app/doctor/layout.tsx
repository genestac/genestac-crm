import { DoctorSidebar } from '@/components/doctor/sidebar'
import { DoctorHeader } from '@/components/doctor/header'

export default function DoctorLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <DoctorSidebar />
      <div className="flex flex-col flex-1 overflow-hidden">
        <DoctorHeader />
        <main className="flex-1 overflow-y-auto bg-gray-50 p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
