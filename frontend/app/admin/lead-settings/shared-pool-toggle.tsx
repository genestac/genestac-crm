'use client'

import { useState } from 'react'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { updateGlobalSettings } from './actions'

export function SharedPoolToggle({ initialValue }: { initialValue: boolean }) {
  const [enabled, setEnabled] = useState(initialValue)
  const [loading, setLoading] = useState(false)

  const handleToggle = async (checked: boolean) => {
    setEnabled(checked)
    setLoading(true)
    try {
      await updateGlobalSettings({ shared_lead_pool: checked })
    } catch (err: any) {
      alert("Failed to update setting: " + err.message)
      setEnabled(!checked)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center space-x-2">
      <Switch 
        id="shared-pool" 
        checked={enabled} 
        onCheckedChange={handleToggle} 
        disabled={loading}
      />
      <Label htmlFor="shared-pool" className="font-medium cursor-pointer">
        Enable Shared Lead Pool
      </Label>
    </div>
  )
}
