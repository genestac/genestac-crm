'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Trash2 } from 'lucide-react'
import { updateGlobalSettings } from './actions'

type LeadStatus = {
  value: string
  label: string
}

export function LeadStatusManager({ initialStatuses }: { initialStatuses: LeadStatus[] }) {
  const [statuses, setStatuses] = useState<LeadStatus[]>(initialStatuses || [])
  const [newLabel, setNewLabel] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  const handleAdd = () => {
    if (!newLabel.trim()) return
    const newValue = newLabel.trim().toUpperCase().replace(/\s+/g, '_')
    
    // Check for duplicates
    if (statuses.some(s => s.value === newValue)) {
      alert('A status with a similar name already exists.')
      return
    }

    const newStatuses = [...statuses, { value: newValue, label: newLabel.trim() }]
    setStatuses(newStatuses)
    setNewLabel('')
  }

  const handleRemove = (value: string) => {
    setStatuses(statuses.filter(s => s.value !== value))
  }

  const handleSave = async () => {
    setIsSaving(true)
    try {
      await updateGlobalSettings({ lead_statuses: statuses })
      alert('Lead statuses saved successfully.')
    } catch (error: any) {
      alert('Failed to save lead statuses: ' + error.message)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Lead Statuses</CardTitle>
        <Button onClick={handleSave} disabled={isSaving} size="sm">
          {isSaving ? 'Saving...' : 'Save Changes'}
        </Button>
      </CardHeader>
      <CardContent>
        <div className="flex gap-2 mb-6">
          <Input 
            placeholder="New Status Label (e.g. In Progress)" 
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          />
          <Button onClick={handleAdd} variant="secondary">Add</Button>
        </div>

        <div className="space-y-3">
          {statuses.map((status) => (
            <div key={status.value} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border">
              <div>
                <p className="font-medium">{status.label}</p>
                <p className="text-xs text-gray-500 font-mono">{status.value}</p>
              </div>
              <Button 
                variant="ghost" 
                size="sm" 
                className="text-red-500 hover:text-red-700 hover:bg-red-50"
                onClick={() => handleRemove(status.value)}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          ))}
          {statuses.length === 0 && (
            <p className="text-sm text-gray-500 text-center py-4">No lead statuses defined.</p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
