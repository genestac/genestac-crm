'use client'

import { useState } from 'react'
import { updateDoctorAvailability } from '@/app/doctor/actions'
import { Check, Clock, Save, Loader2, Calendar } from 'lucide-react'

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

export default function AvailabilityForm({ initialData }: { initialData: any }) {
  const [isActive, setIsActive] = useState(initialData?.is_active ?? false)
  const [startTime, setStartTime] = useState(initialData?.start_time ?? '09:00:00')
  const [endTime, setEndTime] = useState(initialData?.end_time ?? '17:00:00')
  const [availableDays, setAvailableDays] = useState<string[]>(initialData?.available_days ?? DAYS.slice(0, 5))
  
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState('')

  const handleToggleDay = (day: string) => {
    setAvailableDays(prev => 
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    )
  }

  const handleSave = async () => {
    setIsSaving(true)
    setMessage('')
    try {
      await updateDoctorAvailability({
        is_active: isActive,
        start_time: startTime,
        end_time: endTime,
        available_days: availableDays,
      })
      setMessage('Schedule saved successfully!')
      setTimeout(() => setMessage(''), 3000)
    } catch (error) {
      console.error(error)
      setMessage('Failed to save schedule.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="space-y-10">
      {/* Manual Override Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b border-gray-100 pb-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 flex items-center">
              <span className={`w-3 h-3 rounded-full mr-2 ${isActive ? 'bg-emerald-500 animate-pulse' : 'bg-gray-300'}`}></span>
              Manual Override
            </h3>
            <p className="text-sm text-gray-500 mt-1">
              Toggle this on to force yourself as "Available" right now, regardless of your scheduled hours.
            </p>
          </div>
          <button
            onClick={() => setIsActive(!isActive)}
            className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors duration-300 focus:outline-none ${
              isActive ? 'bg-emerald-500' : 'bg-gray-200'
            }`}
          >
            <span
              className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform duration-300 ${
                isActive ? 'translate-x-7 shadow-sm' : 'translate-x-1 shadow-sm'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Scheduled Hours Section */}
      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 flex items-center">
            <Clock className="w-5 h-5 mr-2 text-teal-600" />
            Working Hours
          </h3>
          <p className="text-sm text-gray-500 mt-1">
            The AI will automatically route calls to you during these hours.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Start Time</label>
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none transition-all"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">End Time</label>
            <input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none transition-all"
            />
          </div>
        </div>

        <div className="space-y-3 pt-4">
          <label className="text-sm font-medium text-gray-700 flex items-center">
            <Calendar className="w-4 h-4 mr-2" /> Working Days
          </label>
          <div className="flex flex-wrap gap-2">
            {DAYS.map(day => {
              const isSelected = availableDays.includes(day)
              return (
                <button
                  key={day}
                  onClick={() => handleToggleDay(day)}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 ${
                    isSelected
                      ? 'bg-teal-50 text-teal-700 border border-teal-200 shadow-sm'
                      : 'bg-white text-gray-500 border border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  {day}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      <div className="pt-6 border-t border-gray-100 flex items-center justify-between">
        <p className={`text-sm font-medium transition-opacity ${message ? 'opacity-100' : 'opacity-0'} ${message.includes('Failed') ? 'text-red-500' : 'text-emerald-500'}`}>
          {message}
        </p>
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="flex items-center px-6 py-2.5 bg-gradient-to-r from-teal-500 to-emerald-500 text-white rounded-xl font-medium shadow-md shadow-teal-500/20 hover:shadow-lg hover:shadow-teal-500/30 hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:pointer-events-none"
        >
          {isSaving ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Save className="w-4 h-4 mr-2" />
          )}
          Save Settings
        </button>
      </div>
    </div>
  )
}
