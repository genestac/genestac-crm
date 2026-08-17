'use client'

import { useState, useTransition } from 'react'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { updateOrderSettings } from './actions'
import { toast } from 'react-hot-toast'
import { Loader2 } from 'lucide-react'

export function NotificationToggle({ initialEnabled }: { initialEnabled: boolean }) {
  const [enabled, setEnabled] = useState(initialEnabled)
  const [isPending, startTransition] = useTransition()

  const handleToggle = (checked: boolean) => {
    setEnabled(checked)
    startTransition(async () => {
      try {
        await updateOrderSettings(checked)
        toast.success(`Review notifications ${checked ? 'enabled' : 'disabled'}`)
      } catch (error) {
        setEnabled(!checked) // revert
        toast.error('Failed to update settings')
      }
    })
  }

  return (
    <div className="flex items-center space-x-2 bg-white px-4 py-2 rounded-lg border shadow-sm">
      <Switch
        id="review-notifications"
        checked={enabled}
        onCheckedChange={handleToggle}
        disabled={isPending}
      />
      <Label htmlFor="review-notifications" className="text-sm font-medium text-gray-700 cursor-pointer">
        WhatsApp Review Notifications
      </Label>
      {isPending && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
    </div>
  )
}
