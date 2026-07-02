'use client'

import { formatDistanceToNow } from 'date-fns'
import { Activity, Scale, Target, Calendar } from 'lucide-react'

export function PatientSnapshot({ patient, latestAssessment }: { patient: any, latestAssessment: any }) {
  if (!patient) return null

  // Assuming `patient` has name, weight, target_weight etc.
  // Actually, we fetch latestAssessment which has weight_kg.
  const currentWeight = latestAssessment?.weight_kg || 'N/A'
  const heightCm = latestAssessment?.height_cm
  
  // Calculate BMI if we have both weight and height
  let bmi = 'N/A'
  if (currentWeight !== 'N/A' && heightCm) {
    const heightM = heightCm / 100
    bmi = (currentWeight / (heightM * heightM)).toFixed(1)
  }

  // Extract target weight if available in conditions JSON or patient profile
  const targetWeight = patient.target_weight || 'N/A'

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      <div className="bg-white p-4 rounded-xl border shadow-sm flex flex-col items-start gap-2">
        <div className="text-gray-500 text-xs font-semibold uppercase tracking-wider flex items-center gap-1">
          <Activity className="w-3.5 h-3.5" /> BMI
        </div>
        <div className="text-2xl font-bold text-gray-900">{bmi}</div>
      </div>
      
      <div className="bg-white p-4 rounded-xl border shadow-sm flex flex-col items-start gap-2">
        <div className="text-gray-500 text-xs font-semibold uppercase tracking-wider flex items-center gap-1">
          <Scale className="w-3.5 h-3.5" /> Current Weight
        </div>
        <div className="text-2xl font-bold text-gray-900">{currentWeight} <span className="text-sm font-normal text-gray-500">kg</span></div>
      </div>

      <div className="bg-white p-4 rounded-xl border shadow-sm flex flex-col items-start gap-2">
        <div className="text-gray-500 text-xs font-semibold uppercase tracking-wider flex items-center gap-1">
          <Target className="w-3.5 h-3.5" /> Target Weight
        </div>
        <div className="text-2xl font-bold text-gray-900">{targetWeight} <span className="text-sm font-normal text-gray-500">{targetWeight !== 'N/A' && 'kg'}</span></div>
      </div>

      <div className="bg-white p-4 rounded-xl border shadow-sm flex flex-col items-start gap-2">
        <div className="text-gray-500 text-xs font-semibold uppercase tracking-wider flex items-center gap-1">
          <Calendar className="w-3.5 h-3.5" /> Last Consult
        </div>
        <div className="text-lg font-bold text-gray-900 mt-1">
          {latestAssessment 
            ? formatDistanceToNow(new Date(latestAssessment.created_at), { addSuffix: true }) 
            : 'Never'}
        </div>
      </div>
    </div>
  )
}
