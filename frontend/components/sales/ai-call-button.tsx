'use client'

import { useState } from 'react'
import { PhoneCall, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { triggerAICall } from '@/app/sales/actions'

export function AICallButton({ leadId, compact = false }: { leadId: string, compact?: boolean }) {
  const [isCalling, setIsCalling] = useState(false)

  const handleCallAI = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    
    setIsCalling(true)
    try {
      await triggerAICall(leadId)
      toast.success("AI is now calling the user via Exotel!")
    } catch (err: any) {
      toast.error("Error: " + err.message)
    } finally {
      setIsCalling(false)
    }
  }

  if (compact) {
    return (
      <button 
        onClick={handleCallAI}
        disabled={isCalling}
        className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center hover:bg-blue-200 transition-colors shadow-sm disabled:opacity-50"
        title="Call via AI Now"
      >
        {isCalling ? <Loader2 className="w-4 h-4 animate-spin" /> : <PhoneCall className="w-4 h-4" />}
      </button>
    )
  }

  return (
    <Button 
      variant="outline" 
      size="sm" 
      onClick={handleCallAI}
      disabled={isCalling}
      className="bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-200"
    >
      {isCalling ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <PhoneCall className="w-4 h-4 mr-2" />}
      AI Call
    </Button>
  )
}
