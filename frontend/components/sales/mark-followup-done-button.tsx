'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Check } from 'lucide-react'
import { updateLeadDetails } from '@/app/sales/actions'
import { toast } from 'sonner'

export function MarkFollowupDoneButton({ lead }: { lead: any }) {
  const [loading, setLoading] = useState(false)

  const handleMarkDone = async (e: React.MouseEvent<HTMLButtonElement>) => {
    const row = e.currentTarget.closest('tr')
    setLoading(true)
    try {
      const formData = new FormData()
      formData.append('lead_id', lead.id)
      formData.append('record_type', lead.record_type || 'USER')
      formData.append('next_followup_date', '') // Empty string to clear the date

      await updateLeadDetails(formData)
      toast.success('Follow-up marked as done')
      if (row) {
        row.style.display = 'none'
      }
    } catch (error: any) {
      toast.error('Failed to mark as done: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button 
      variant="outline" 
      size="sm" 
      onClick={handleMarkDone}
      disabled={loading}
      className="text-green-600 border-green-200 hover:bg-green-50 mr-2"
    >
      <Check className="w-4 h-4 mr-2" />
      {loading ? 'Marking...' : 'Mark Done'}
    </Button>
  )
}
