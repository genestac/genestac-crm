'use client'

import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine } from 'recharts'
import { format } from 'date-fns'

export function WeightChart({ data, targetWeight }: { data: any[], targetWeight?: number }) {
  if (!data || data.length === 0) {
    return <div className="h-64 flex items-center justify-center text-gray-400">No weight data available.</div>
  }

  // Format data for Recharts
  const chartData = data
    .filter(d => d.weight_kg != null)
    .map(d => ({
      date: format(new Date(d.created_at), 'MMM d, yy'),
      timestamp: new Date(d.created_at).getTime(),
      weight: parseFloat(d.weight_kg)
    }))
    .sort((a, b) => a.timestamp - b.timestamp) // Ensure chronological order

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
          <Line type="monotone" dataKey="weight" stroke="#0ea5e9" strokeWidth={3} dot={{ r: 4, fill: '#0ea5e9', strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 6 }} />
          <CartesianGrid stroke="#ccc" strokeDasharray="5 5" vertical={false} />
          <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} dy={10} />
          <YAxis domain={['auto', 'auto']} tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} dx={-10} />
          <Tooltip 
            contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)' }}
            labelStyle={{ fontWeight: 'bold', color: '#334155' }}
          />
          {targetWeight && (
            <ReferenceLine y={targetWeight} label={{ position: 'top', value: 'Target', fill: '#10b981', fontSize: 12, fontWeight: 'bold' }} stroke="#10b981" strokeDasharray="3 3" />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
