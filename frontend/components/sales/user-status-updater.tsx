'use client'

import { useState } from 'react'
import { updateLeadDetails } from '@/app/sales/actions'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

export function UserStatusUpdater({ leadId, currentStatus, recordType, statusOptions }: { leadId: string, currentStatus: string, recordType?: string, statusOptions?: {value: string, label: string}[] }) {
  const [loading, setLoading] = useState(false)
  const [localStatus, setLocalStatus] = useState(currentStatus)

  const handleUpdate = async (status: string) => {
    setLoading(true)
    const formData = new FormData()
    formData.append('lead_id', leadId)
    formData.append('status', status)
    if (recordType) {
      formData.append('record_type', recordType)
    }
    
    try {
      await updateLeadDetails(formData)
      setLocalStatus(status)
      toast.success('Status updated successfully')
    } catch (err: any) {
      toast.error("Failed to update: " + err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative">
      <select 
        value={localStatus}
        onChange={(e) => handleUpdate(e.target.value)}
        disabled={loading}
        className="px-2.5 py-1 pr-7 bg-blue-50 text-blue-700 border border-blue-200 rounded-md text-xs font-semibold tracking-wide appearance-none focus:outline-none focus:ring-2 focus:ring-blue-300 disabled:opacity-50"
      >
        {statusOptions ? statusOptions.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        )) : (
          <option value={localStatus}>{localStatus.replace('_', ' ')}</option>
        )}
      </select>
      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-1.5 text-blue-700">
        <svg className="w-3 h-3 fill-current" viewBox="0 0 20 20">
          <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
        </svg>
      </div>
    </div>
  )
}
