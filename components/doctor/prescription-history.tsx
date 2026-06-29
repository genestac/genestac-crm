'use client'

import { useState, useEffect } from 'react'
import { getRecentPrescriptions } from '@/app/doctor/actions'
import { Pill, Calendar, Clock, FileText, Loader2, AlertCircle, Printer } from 'lucide-react'

export function PrescriptionHistory({ patientId }: { patientId: string }) {
  const [prescriptions, setPrescriptions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    loadHistory()
  }, [patientId])

  const loadHistory = async () => {
    setLoading(true)
    setError('')
    try {
      const data = await getRecentPrescriptions(patientId)
      setPrescriptions(data || [])
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="w-8 h-8 text-teal-600 animate-spin" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6 bg-red-50 text-red-700 rounded-xl flex items-start gap-3">
        <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" />
        <div>
          <h4 className="font-bold">Failed to load prescriptions</h4>
          <p className="text-sm mt-1">{error}</p>
        </div>
      </div>
    )
  }

  if (prescriptions.length === 0) {
    return (
      <div className="p-12 text-center border-2 border-dashed rounded-xl bg-gray-50/50">
        <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <h3 className="text-lg font-medium text-gray-900">No Past Prescriptions</h3>
        <p className="text-sm text-gray-500 mt-1">This patient does not have any prescription history on record.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between pb-4 border-b">
        <div>
          <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <FileText className="w-5 h-5 text-teal-600" />
            Prescription History
          </h3>
          <p className="text-sm text-gray-500 mt-1">Review past medications and instructions given to this patient.</p>
        </div>
      </div>
      
      <div className="space-y-6">
        {prescriptions.map((rx: any) => (
          <div key={rx.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
            {/* Header */}
            <div className="bg-gray-50 px-6 py-4 border-b border-gray-200 flex flex-wrap gap-4 items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5 text-sm font-medium text-gray-700">
                  <Calendar className="w-4 h-4 text-gray-400" />
                  {new Date(rx.created_at).toLocaleDateString()}
                </div>
                {rx.valid_until && (
                  <div className="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 px-2.5 py-1 rounded-full font-semibold border border-amber-100">
                    <Clock className="w-3.5 h-3.5" />
                    Valid until: {new Date(rx.valid_until).toLocaleDateString()}
                  </div>
                )}
              </div>
              <div>
                <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md ${rx.status === 'active' ? 'bg-teal-100 text-teal-800' : 'bg-gray-200 text-gray-700'}`}>
                  {rx.status}
                </span>
                <button 
                  onClick={() => window.open(`/print/prescription/${rx.id}`, '_blank')}
                  className="ml-3 text-xs font-semibold text-teal-700 hover:text-teal-900 bg-white hover:bg-teal-50 border border-teal-200 px-3 py-1.5 rounded-md transition-colors"
                >
                  Print
                </button>
              </div>
            </div>

            {/* General Instructions */}
            {rx.general_instructions && (
              <div className="px-6 py-4 bg-blue-50/30 border-b border-blue-50">
                <p className="text-sm text-gray-800"><strong className="text-blue-900 font-semibold text-xs uppercase mr-2">Notes:</strong> {rx.general_instructions}</p>
              </div>
            )}

            {/* Meds */}
            <div className="p-0">
              <table className="w-full text-sm text-left">
                <thead className="bg-white border-b border-gray-100 text-xs uppercase text-gray-400">
                  <tr>
                    <th className="px-6 py-3 font-semibold">Medication</th>
                    <th className="px-6 py-3 font-semibold">Dosage & Frequency</th>
                    <th className="px-6 py-3 font-semibold">Duration / Qty</th>
                    <th className="px-6 py-3 font-semibold">Timing</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {rx.prescription_items?.map((item: any, i: number) => (
                    <tr key={i} className="hover:bg-gray-50/50">
                      <td className="px-6 py-4">
                        <div className="font-semibold text-gray-900 flex items-center gap-2">
                          <Pill className="w-4 h-4 text-teal-500" />
                          {item.inventory?.name || 'Unknown Product'}
                        </div>
                        {item.inventory?.sku && <div className="text-xs text-gray-400 mt-0.5 ml-6">{item.inventory.sku}</div>}
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-gray-900">{item.dosage}</div>
                        <div className="text-gray-500 text-xs mt-0.5">{item.frequency}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-gray-900">{item.duration_days} Days</div>
                        <div className="text-gray-500 text-xs mt-0.5">Total: {item.total_quantity_prescribed}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-1.5">
                          {item.time && <span className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-medium">{item.time}</span>}
                          {item.before_lunch && <span className="text-[10px] bg-amber-50 text-amber-700 px-2 py-0.5 rounded font-medium">Before Lunch</span>}
                          {item.after_lunch && <span className="text-[10px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded font-medium">After Lunch</span>}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {(!rx.prescription_items || rx.prescription_items.length === 0) && (
                    <tr>
                      <td colSpan={4} className="px-6 py-4 text-center text-gray-400 italic">No medications listed</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
