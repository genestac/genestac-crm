'use client'

import { useState, useEffect } from 'react'
import { getDoctorMetrics, getDoctorAppointments } from './actions'
import { getPatientHistory, getRecentPrescriptions } from './actions'
import { PatientSnapshot } from '@/components/doctor/patient-snapshot'
import { WeightChart } from '@/components/doctor/weight-chart'
import { PrescriptionForm } from '@/components/doctor/prescription-form'
import { ProgressForm } from '@/components/doctor/progress-form'
import { Activity, Users, DollarSign, Calendar, Clock, Video, FileText, CheckCircle2 } from 'lucide-react'
import Link from 'next/link'

export default function DoctorDashboard() {
  const [metrics, setMetrics] = useState<any>(null)
  const [appointments, setAppointments] = useState<any[]>([])
  
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null)
  const [selectedPatientInfo, setSelectedPatientInfo] = useState<any>(null)
  
  const [history, setHistory] = useState<any[]>([])
  const [prescriptions, setPrescriptions] = useState<any[]>([])
  
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadDashboard()
  }, [])

  const loadDashboard = async () => {
    try {
      const mets = await getDoctorMetrics()
      setMetrics(mets)
      
      const appts = await getDoctorAppointments()
      console.log('Raw appointments from API:', appts)
      
      // Temporarily show all appointments to debug
      const todaysAppts = appts
      
      console.log('All appointments (no filter):', todaysAppts)
      
      // Sort by time
      todaysAppts.sort((a: any, b: any) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())
      setAppointments(todaysAppts)
      
    } catch (err) {
      console.error('Error loading dashboard:', err)
    } finally {
      setLoading(false)
    }
  }

  const selectPatient = async (patientId: string, patientInfo: any) => {
    setSelectedPatientId(patientId)
    setSelectedPatientInfo(patientInfo)
    
    try {
      const hist = await getPatientHistory(patientId)
      setHistory(hist)
      
      const rxs = await getRecentPrescriptions(patientId)
      setPrescriptions(rxs)
    } catch (err) {
      console.error(err)
    }
  }

  const refreshPatientData = async () => {
    if (selectedPatientId) {
      const hist = await getPatientHistory(selectedPatientId)
      setHistory(hist)
      const rxs = await getRecentPrescriptions(selectedPatientId)
      setPrescriptions(rxs)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header Metrics */}
      <header className="bg-white rounded-xl border shadow-sm px-8 py-6">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Clinical Dashboard</h1>
            <p className="text-sm text-gray-500">Welcome, Doctor.</p>
          </div>
          <Link href="/doctor/appointments" className="bg-teal-50 text-teal-700 px-4 py-2 rounded-lg text-sm font-semibold hover:bg-teal-100 transition-colors">
            Manage All Appointments
          </Link>
        </div>
        
        {metrics && (
          <div className="max-w-7xl mx-auto grid grid-cols-4 gap-6 mt-6">
            <div className="flex items-center gap-4 bg-gray-50 p-4 rounded-xl border border-gray-100">
              <div className="p-3 bg-teal-100 text-teal-600 rounded-lg"><Clock className="w-5 h-5" /></div>
              <div>
                <div className="text-2xl font-bold text-gray-900">{metrics.dailyQueue}</div>
                <div className="text-xs text-gray-500 font-medium">Daily Queue</div>
              </div>
            </div>
            <div className="flex items-center gap-4 bg-gray-50 p-4 rounded-xl border border-gray-100">
              <div className="p-3 bg-blue-100 text-blue-600 rounded-lg"><Users className="w-5 h-5" /></div>
              <div>
                <div className="text-2xl font-bold text-gray-900">{metrics.activePatients}</div>
                <div className="text-xs text-gray-500 font-medium">Active Patients</div>
              </div>
            </div>
            <div className="flex items-center gap-4 bg-gray-50 p-4 rounded-xl border border-gray-100">
              <div className="p-3 bg-emerald-100 text-emerald-600 rounded-lg"><CheckCircle2 className="w-5 h-5" /></div>
              <div>
                <div className="text-2xl font-bold text-gray-900">{metrics.treatmentSuccessRate}%</div>
                <div className="text-xs text-gray-500 font-medium">Success Rate</div>
              </div>
            </div>
            <div className="flex items-center gap-4 bg-gray-50 p-4 rounded-xl border border-gray-100">
              <div className="p-3 bg-indigo-100 text-indigo-600 rounded-lg"><DollarSign className="w-5 h-5" /></div>
              <div>
                <div className="text-2xl font-bold text-gray-900">₹{metrics.monthlyRevenue.toLocaleString()}</div>
                <div className="text-xs text-gray-500 font-medium">Monthly Revenue</div>
              </div>
            </div>
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-8 grid grid-cols-12 gap-8">
        
        {/* Left Column: Work Queue */}
        <div className="col-span-12 lg:col-span-4 space-y-6">
          <div className="bg-white rounded-xl border shadow-sm flex flex-col h-[calc(100vh-16rem)] overflow-hidden">
            <div className="p-4 border-b bg-gray-50/50">
              <h2 className="font-bold text-gray-900 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-teal-600" /> Today's Schedule
              </h2>
            </div>
            
            <div className="flex-1 overflow-y-auto p-2">
              {loading ? (
                <div className="p-4 text-center text-sm text-gray-400 animate-pulse">Loading schedule...</div>
              ) : appointments.length === 0 ? (
                <div className="p-8 text-center text-sm text-gray-400">No appointments scheduled for today.</div>
              ) : (
                <div className="space-y-2">
                  {appointments.map(appt => {
                    const patientInfo = appt.patients || {}
                    const patId = patientInfo.id || appt.patient_id
                    const isSelected = selectedPatientId === patId
                    
                    return (
                      <button 
                        key={appt.id}
                        onClick={() => selectPatient(patId, patientInfo)}
                        className={`w-full text-left p-4 rounded-lg border transition-all ${
                          isSelected ? 'bg-teal-50 border-teal-200 shadow-sm' : 'bg-white hover:bg-gray-50 border-transparent hover:border-gray-200'
                        }`}
                      >
                        <div className="flex justify-between items-start mb-1">
                          <span className={`font-semibold ${isSelected ? 'text-teal-900' : 'text-gray-900'}`}>
                            {patientInfo.name || patientInfo.full_name || 'Unknown Patient'}
                          </span>
                          <span className="text-xs font-mono text-gray-500">
                            {new Date(appt.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <div className="text-xs text-gray-500 flex items-center gap-1">
                          <span className={`w-1.5 h-1.5 rounded-full ${appt.status === 'confirmed' ? 'bg-green-500' : 'bg-amber-500'}`}></span>
                          {appt.status}
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Patient Context */}
        <div className="col-span-12 lg:col-span-8">
          {!selectedPatientId ? (
            <div className="h-full min-h-[400px] flex flex-col items-center justify-center text-gray-400 bg-white rounded-xl border border-dashed">
              <Activity className="w-12 h-12 mb-4 text-gray-300" />
              <p>Select a patient from the queue to view clinical context.</p>
            </div>
          ) : (
            <div className="space-y-6">
              
              {/* Header Actions */}
              <div className="flex items-center justify-between bg-white p-4 rounded-xl border shadow-sm">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">{selectedPatientInfo?.name || selectedPatientInfo?.full_name || 'Patient Context'}</h2>
                  <p className="text-sm text-gray-500">{selectedPatientInfo?.phone || 'No phone'} | {selectedPatientInfo?.email || 'No email'}</p>
                </div>
                <div className="flex gap-2">
                  <button className="flex items-center gap-2 bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-gray-800 transition-colors">
                    <Video className="w-4 h-4" /> Start Consult
                  </button>
                </div>
              </div>

              {/* Vitals Snapshot */}
              <PatientSnapshot patient={selectedPatientInfo} latestAssessment={history[history.length - 1]} />

              <div className="grid grid-cols-12 gap-6">
                {/* Weight Progress Chart */}
                <div className="col-span-12 lg:col-span-8 bg-white p-5 rounded-xl border shadow-sm">
                  <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                    <Activity className="w-4 h-4 text-blue-500" /> Weight Progress
                  </h3>
                  <WeightChart data={history} targetWeight={selectedPatientInfo?.target_weight} />
                </div>

                {/* Quick Actions */}
                <div className="col-span-12 lg:col-span-4 space-y-4">
                  <div className="bg-white p-5 rounded-xl border shadow-sm space-y-3">
                    <h3 className="font-bold text-gray-900 mb-2">Clinical Tools</h3>
                    <PrescriptionForm patientId={selectedPatientId} onPrescriptionAdded={refreshPatientData} />
                    <ProgressForm patientId={selectedPatientId} onProgressAdded={refreshPatientData} />
                  </div>
                </div>
              </div>

              {/* Recent Prescriptions */}
              <div className="bg-white p-5 rounded-xl border shadow-sm">
                <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-indigo-500" /> Recent Prescriptions
                </h3>
                
                {prescriptions.length === 0 ? (
                  <div className="text-center py-6 text-gray-500 text-sm">No prescriptions found.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-gray-50 text-gray-500 uppercase text-[10px] font-bold">
                        <tr>
                          <th className="px-4 py-3">Date</th>
                          <th className="px-4 py-3">Medication</th>
                          <th className="px-4 py-3">Dosage / Freq</th>
                          <th className="px-4 py-3">Duration</th>
                          <th className="px-4 py-3">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {prescriptions.map(rx => (
                          rx.prescription_items?.map((item: any, idx: number) => (
                            <tr key={`${rx.id}-${idx}`} className="hover:bg-gray-50">
                              <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">
                                {new Date(rx.created_at).toLocaleDateString()}
                              </td>
                              <td className="px-4 py-3">
                                {item.inventory?.name || 'Unknown Medication'}
                              </td>
                              <td className="px-4 py-3 text-gray-600">
                                {item.dosage} • {item.frequency}
                              </td>
                              <td className="px-4 py-3 text-gray-600">
                                {item.duration_days} days
                              </td>
                              <td className="px-4 py-3">
                                <span className={`px-2 py-1 text-[10px] font-bold uppercase rounded-full ${
                                  rx.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                                }`}>
                                  {rx.status}
                                </span>
                              </td>
                            </tr>
                          ))
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

            </div>
          )}
        </div>
        
      </main>
    </div>
  )
}
