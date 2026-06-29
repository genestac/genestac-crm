'use client'

import { useState } from 'react'
import { updateLeadDetails } from '@/app/sales/actions'
import { Button } from '@/components/ui/button'

export function UserStatusUpdater({ leadId, currentStatus }: { leadId: string, currentStatus: string }) {
  const [loading, setLoading] = useState(false)

  const handleUpdate = async (status: string) => {
    setLoading(true)
    const formData = new FormData()
    formData.append('lead_id', leadId)
    formData.append('status', status)
    
    try {
      await updateLeadDetails(formData)
    } catch (err: any) {
      alert("Failed to update: " + err.message)
    } finally {
      setLoading(false)
    }
  }

  // If in early stage, show Contacted button
  if (['NEW', 'UNREAD', 'ASSIGNED', 'CONTACT_ATTEMPTED'].includes(currentStatus)) {
    return (
      <div className="flex gap-2">
        <Button 
          variant="outline" 
          size="sm" 
          onClick={() => handleUpdate('CONTACT_ATTEMPTED')}
          disabled={loading || currentStatus === 'CONTACT_ATTEMPTED'}
        >
          Attempted
        </Button>
        <Button 
          className="bg-indigo-600 hover:bg-indigo-700" 
          size="sm"
          onClick={() => handleUpdate('CONTACTED')}
          disabled={loading}
        >
          Mark Contacted
        </Button>
      </div>
    )
  }

  return null
}
