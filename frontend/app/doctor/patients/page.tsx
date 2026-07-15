'use client'

import { useState, useEffect } from 'react'
import { getDoctorAppointments } from '@/app/doctor/actions'
import { Users, Search, Phone, Mail, Calendar, Activity } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

type PatientInfo = {
  id: string
  name: string
  phone: string
  email: string
  lastVisit: string
  totalVisits: number
}

export default function DoctorPatientsPage() {
  const [patients, setPatients] = useState<PatientInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    loadPatients()
  }, [])

  const loadPatients = async () => {
    try {
      const appointments = await getDoctorAppointments()
      
      const patientMap = new Map<string, PatientInfo>()
      
      appointments.forEach((appt: any) => {
        if (!appt.patients) return
        
        const name = appt.patients.name || appt.patients.full_name || 'Unknown Patient'
        const phone = appt.patients.phone || 'No phone'
        const email = appt.patients.email || 'No email'
        const pId = appt.patients.id || name // Fallback to name if ID is missing (AI booked)
        
        if (!patientMap.has(pId)) {
          patientMap.set(pId, {
            id: pId,
            name,
            phone,
            email,
            lastVisit: appt.scheduled_at,
            totalVisits: 1
          })
        } else {
          const existing = patientMap.get(pId)!
          existing.totalVisits += 1
          // Update last visit if this appointment is more recent
          if (new Date(appt.scheduled_at) > new Date(existing.lastVisit)) {
            existing.lastVisit = appt.scheduled_at
          }
        }
      })
      
      setPatients(Array.from(patientMap.values()).sort((a, b) => new Date(b.lastVisit).getTime() - new Date(a.lastVisit).getTime()))
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const filteredPatients = patients.filter(p => 
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    p.phone.includes(searchQuery)
  )

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
          <Users className="w-8 h-8 text-teal-600" />
          Patient Directory
        </h1>
        <p className="text-gray-500 mt-1">View and manage your patient records and consultation history.</p>
      </div>

      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 space-y-6">
        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input 
              placeholder="Search patients by name or phone..." 
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-9 bg-gray-50 border-transparent focus:border-teal-500 focus:bg-white transition-all"
            />
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="h-40 bg-gray-100 animate-pulse rounded-xl"></div>
            ))}
          </div>
        ) : filteredPatients.length === 0 ? (
          <div className="text-center py-16 px-4">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Users className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-1">No patients found</h3>
            <p className="text-gray-500 max-w-sm mx-auto">
              {searchQuery ? "No patients match your search criteria. Try a different term." : "You don't have any patients in your directory yet."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredPatients.map(patient => (
              <div key={patient.id} className="group bg-white border border-gray-100 rounded-xl p-5 hover:shadow-lg hover:border-teal-100 transition-all duration-300 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-teal-400 to-cyan-500 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                
                <div className="flex items-start gap-4 mb-4">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-teal-100 to-cyan-100 flex items-center justify-center shrink-0">
                    <span className="text-teal-700 font-bold text-lg">
                      {patient.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-gray-900 leading-tight">{patient.name}</h3>
                    <p className="text-sm text-gray-500 mt-1 flex items-center gap-1.5">
                      <Phone className="w-3.5 h-3.5" />
                      {patient.phone}
                    </p>
                  </div>
                </div>

                <div className="space-y-2 mb-5">
                  {patient.email !== 'No email' && (
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Mail className="w-4 h-4 text-gray-400" />
                      <span className="truncate">{patient.email}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Calendar className="w-4 h-4 text-gray-400" />
                    <span>Last visit: {new Date(patient.lastVisit).toLocaleDateString()}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Activity className="w-4 h-4 text-gray-400" />
                    <span>Total visits: <span className="font-semibold text-gray-900">{patient.totalVisits}</span></span>
                  </div>
                </div>

              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
