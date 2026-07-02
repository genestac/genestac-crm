'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { addClinicalAssessment, logAdverseEvent } from '@/app/doctor/actions'
import { Activity, Loader2, AlertTriangle } from 'lucide-react'

export function ProgressForm({ patientId, onProgressAdded }: { patientId: string, onProgressAdded: () => void }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [isAdverse, setIsAdverse] = useState(false)
  
  const [weight, setWeight] = useState('')
  const [notes, setNotes] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      if (isAdverse) {
        await logAdverseEvent(patientId, notes)
      } else {
        await addClinicalAssessment({
          patientId,
          weight,
          notes,
          conditions: {} // Could add specific condition toggles here
        })
      }
      setOpen(false)
      onProgressAdded()
      setWeight('')
      setNotes('')
      setIsAdverse(false)
    } catch (err: any) {
      alert("Error saving progress: " + err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className={buttonVariants({ variant: "outline", className: "w-full justify-start gap-2 shadow-none border border-gray-200" })}>
        <Activity className="w-4 h-4 text-teal-600" /> Add Progress / Event
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isAdverse ? 'Log Adverse Event' : 'Add Clinical Progress'}</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-6 pt-4">
          
          <div className="flex items-center space-x-2 bg-red-50 p-3 rounded-lg border border-red-100">
            <Checkbox 
              id="adverse" 
              checked={isAdverse} 
              onCheckedChange={(checked) => setIsAdverse(checked as boolean)}
            />
            <label htmlFor="adverse" className="text-sm font-semibold text-red-900 cursor-pointer flex items-center gap-1">
              <AlertTriangle className="w-4 h-4 text-red-600" /> Flag as Adverse Event
            </label>
          </div>

          {!isAdverse && (
            <div className="space-y-2">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Current Weight (kg)</label>
              <Input 
                type="number" 
                step="0.1" 
                placeholder="e.g. 75.5" 
                value={weight} 
                onChange={e => setWeight(e.target.value)}
              />
            </div>
          )}
          
          <div className="space-y-2">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              {isAdverse ? 'Event Details' : 'Clinical Notes'}
            </label>
            <Textarea 
              required
              placeholder={isAdverse ? "Describe the adverse reaction..." : "Patient feeling better, no side effects..."}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="resize-none h-32"
            />
          </div>

          <div className="pt-2 flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={loading || (!isAdverse && !weight && !notes)} className={isAdverse ? "bg-red-600 hover:bg-red-700 text-white" : "bg-teal-600 hover:bg-teal-700 text-white"}>
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {isAdverse ? 'Log Event' : 'Save Progress'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
