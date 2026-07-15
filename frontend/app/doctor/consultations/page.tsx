'use client'

import { useState, useEffect } from 'react'
import { getDoctorAppointments } from '@/app/doctor/actions'
import { Stethoscope, Search, Calendar, ChevronRight, Activity } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { useRouter } from 'next/navigation'

export default function DoctorConsultationsPage() {
  const router = useRouter()
  const [consultations, setConsultations] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    loadConsultations()
  }, [])

  const loadConsultations = async () => {
    try {
      const appointments = await getDoctorAppointments()
      // Only show completed/historical appointments
      const completed = appointments.filter((a: any) => a.status === 'completed' || a.status === 'rejected')
      
      // Sort by newest first
      completed.sort((a: any, b: any) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime())
      
      setConsultations(completed)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const filteredConsultations = consultations.filter(c => {
    const patientName = c.patients?.name || c.patients?.full_name || 'Unknown Patient'
    return patientName.toLowerCase().includes(searchQuery.toLowerCase()) || 
           (c.title && c.title.toLowerCase().includes(searchQuery.toLowerCase()))
  })

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
          <Stethoscope className="w-8 h-8 text-teal-600" />
          Consultations
        </h1>
        <p className="text-gray-500 mt-1">Review past clinical consultations, reports, and AI notes.</p>
      </div>

      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 space-y-6">
        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input 
              placeholder="Search by patient name or title..." 
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-9 bg-gray-50 border-transparent focus:border-teal-500 focus:bg-white transition-all"
            />
          </div>
        </div>

        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-20 bg-gray-100 animate-pulse rounded-xl"></div>
            ))}
          </div>
        ) : filteredConsultations.length === 0 ? (
          <div className="text-center py-16 px-4">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Stethoscope className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-1">No consultations found</h3>
            <p className="text-gray-500 max-w-sm mx-auto">
              {searchQuery ? "No records match your search criteria." : "You haven't completed any consultations yet."}
            </p>
          </div>
        ) : (
          <div className="overflow-hidden border border-gray-100 rounded-xl">
            <table className="w-full text-sm text-left">
              <thead className="bg-gray-50 text-gray-500 uppercase text-xs font-semibold">
                <tr>
                  <th className="px-6 py-4">Date</th>
                  <th className="px-6 py-4">Patient</th>
                  <th className="px-6 py-4">Title / Type</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {filteredConsultations.map(c => (
                  <tr 
                    key={c.id} 
                    className="hover:bg-teal-50/50 transition-colors cursor-pointer group"
                    onClick={() => router.push(`/doctor/appointments/${c.id}`)}
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2 text-gray-900 font-medium">
                        <Calendar className="w-4 h-4 text-teal-600" />
                        {new Date(c.scheduled_at).toLocaleDateString()}
                      </div>
                      <div className="text-xs text-gray-500 mt-1 pl-6">
                        {new Date(c.scheduled_at).toLocaleTimeString([], {timeStyle: 'short'})}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-teal-100 flex items-center justify-center text-teal-700 font-bold">
                          {(c.patients?.name || c.patients?.full_name || 'U').charAt(0).toUpperCase()}
                        </div>
                        <span className="font-semibold text-gray-900">
                          {c.patients?.name || c.patients?.full_name || 'Unknown Patient'}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-gray-600 max-w-[200px] truncate">
                      {c.title || 'General Consultation'}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                        c.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                      }`}>
                        {c.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-teal-600 ml-auto transition-colors" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
