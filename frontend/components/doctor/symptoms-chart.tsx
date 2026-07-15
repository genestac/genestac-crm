'use client'

import { useEffect, useState } from 'react'
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip
} from 'recharts'
import { Activity } from 'lucide-react'

// Mock dynamic data for clinical symptoms frequency
const defaultData = [
  { subject: 'Fatigue', A: 120, fullMark: 150 },
  { subject: 'Insomnia', A: 98, fullMark: 150 },
  { subject: 'Weight Gain', A: 86, fullMark: 150 },
  { subject: 'Anxiety', A: 99, fullMark: 150 },
  { subject: 'Joint Pain', A: 85, fullMark: 150 },
  { subject: 'Headache', A: 65, fullMark: 150 },
];

export function SymptomsChart() {
  const [data, setData] = useState(defaultData)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    
    // Simulate real-time dynamic loading/jitter if you want it to feel "live"
    const interval = setInterval(() => {
      setData(prev => prev.map(item => ({
        ...item,
        A: Math.max(50, Math.min(150, item.A + (Math.random() * 10 - 5)))
      })))
    }, 5000)
    
    return () => clearInterval(interval)
  }, [])

  if (!mounted) return <div className="h-[300px] bg-gray-50 animate-pulse rounded-xl" />

  return (
    <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm flex flex-col h-full">
      <div className="flex items-center gap-2 mb-4">
        <div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg shrink-0">
          <Activity className="w-4 h-4" />
        </div>
        <div>
          <h3 className="font-bold text-gray-900 leading-tight">Symptom Distribution</h3>
          <p className="text-xs text-gray-500">Aggregate frequency of clinical symptoms across your active patients.</p>
        </div>
      </div>
      
      <div className="flex-1 w-full min-h-[250px]">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart cx="50%" cy="50%" outerRadius="70%" data={data}>
            <PolarGrid stroke="#e5e7eb" />
            <PolarAngleAxis dataKey="subject" tick={{ fill: '#6b7280', fontSize: 12 }} />
            <PolarRadiusAxis angle={30} domain={[0, 150]} tick={false} axisLine={false} />
            <Radar
              name="Frequency"
              dataKey="A"
              stroke="#6366f1"
              fill="#818cf8"
              fillOpacity={0.6}
            />
            <Tooltip 
              contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
