'use client'

import { useState, useEffect } from 'react'
import { getDoctorAppointments, updateAppointmentStatus } from '@/app/doctor/actions'
import { Calendar, CheckCircle, XCircle, Clock, FileText } from 'lucide-react'
import { useRouter } from 'next/navigation'

export default function DoctorAppointmentsPage() {
  const router = useRouter()
  const [appointments, setAppointments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadAppointments()
  }, [])

  const loadAppointments = async () => {
    try {
      const data = await getDoctorAppointments()
      setAppointments(data)
    } catch (err: any) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const handleUpdateStatus = async (id: string, status: string) => {
    try {
      await updateAppointmentStatus(id, status)
      await loadAppointments()
    } catch (err: any) {
      alert("Failed to update status: " + err.message)
    }
  }

  const pendingAppointments = appointments.filter(a => a.status === 'pending')
  const upcomingAppointments = appointments.filter(a => ['confirmed', 'completed'].includes(a.status))

  return (
    <div className="space-y-8">
      <div className="max-w-6xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Appointments Dashboard</h1>
          <p className="text-gray-500 mt-1">Manage your consultation requests and upcoming schedule.</p>
        </div>



        {/* Pending Requests */}
        <div>
          <h2 className="text-xl font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <Clock className="w-5 h-5 text-amber-500" />
            Pending Requests ({pendingAppointments.length})
          </h2>
          
          {loading ? (
            <div className="h-32 bg-gray-200 animate-pulse rounded-xl"></div>
          ) : pendingAppointments.length === 0 ? (
            <div className="bg-white p-8 rounded-xl border border-gray-100 text-center text-gray-500">
              No pending appointment requests.
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {pendingAppointments.map(appt => (
                <div 
                  key={appt.id} 
                  className="bg-white rounded-xl border border-amber-100 p-5 shadow-sm relative overflow-hidden cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => router.push(`/doctor/appointments/${appt.id}`)}
                >
                  <div className="absolute top-0 left-0 w-1 h-full bg-amber-400"></div>
                  <div className="flex justify-between items-start mb-3">
                    <h3 className="font-bold text-gray-900">{appt.patients?.name || appt.patients?.full_name || 'Unknown Patient'}</h3>
                    <span className="bg-amber-100 text-amber-800 text-[10px] uppercase font-bold px-2 py-0.5 rounded">Pending</span>
                  </div>
                  
                  <div className="space-y-2 text-sm text-gray-600 mb-4">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-gray-400" />
                      <span>{new Date(appt.scheduled_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</span>
                    </div>
                    {appt.notes && (
                      <div className="flex items-start gap-2 bg-gray-50 p-2 rounded-lg">
                        <FileText className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
                        <span className="text-xs italic">{appt.notes}</span>
                      </div>
                    )}
                    <div className="text-xs text-gray-400 pt-2">
                      Requested by: {appt.sales?.full_name || 'Sales Rep'}
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleUpdateStatus(appt.id, 'confirmed') }}
                      className="flex-1 bg-teal-50 hover:bg-teal-100 text-teal-700 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-1"
                    >
                      <CheckCircle className="w-4 h-4" /> Approve
                    </button>
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleUpdateStatus(appt.id, 'rejected') }}
                      className="flex-1 bg-red-50 hover:bg-red-100 text-red-700 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-1"
                    >
                      <XCircle className="w-4 h-4" /> Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Upcoming Appointments */}
        <div>
          <h2 className="text-xl font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-teal-600" />
            Upcoming Appointments
          </h2>
          
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm">
            <table className="w-full text-sm text-left">
              <thead className="bg-gray-50 text-gray-500 uppercase text-xs font-semibold">
                <tr>
                  <th className="px-6 py-4">Date & Time</th>
                  <th className="px-6 py-4">Patient</th>
                  <th className="px-6 py-4">Contact</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {upcomingAppointments.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                      No upcoming appointments.
                    </td>
                  </tr>
                ) : (
                  upcomingAppointments.map(appt => (
                    <tr 
                      key={appt.id} 
                      className="hover:bg-gray-50 transition-colors cursor-pointer"
                      onClick={() => router.push(`/doctor/appointments/${appt.id}`)}
                    >
                      <td className="px-6 py-4 font-medium text-gray-900">
                        {new Date(appt.scheduled_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-900">
                        {appt.patients?.name || appt.patients?.full_name || 'Unknown Patient'}
                      </td>
                      <td className="px-4 py-3 text-gray-500">
                        {appt.patients?.phone || 'No phone'}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 text-xs font-semibold rounded-full ${appt.status === 'confirmed' ? 'bg-teal-100 text-teal-800' : 'bg-blue-100 text-blue-800'}`}>
                          {appt.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        {appt.status === 'confirmed' && (
                          <button 
                            onClick={(e) => {
                              e.stopPropagation()
                              handleUpdateStatus(appt.id, 'completed')
                            }}
                            className="text-teal-600 hover:text-teal-900 font-medium text-xs"
                          >
                            Mark Completed
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
