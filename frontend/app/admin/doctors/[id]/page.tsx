'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { fetchDoctorDetails, updateDoctorSchedule } from '../actions'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { ArrowLeft, Save, Loader2, AlertCircle } from 'lucide-react'
import Link from 'next/link'

export default function DoctorSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const unwrappedParams = React.use(params)
  const id = unwrappedParams.id
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [doctor, setDoctor] = useState<any>(null)
  
  const [formData, setFormData] = useState({
    is_active: false,
    allow_ai_calls: true,
    allow_scheduling: true,
    start_time: '09:00',
    end_time: '17:00',
    slot_duration_minutes: 10,
    buffer_minutes: 0,
    available_days: [] as string[]
  })

  useEffect(() => {
    async function loadData() {
      const res = await fetchDoctorDetails(id)
      if (res.success && res.data) {
        setDoctor(res.data)
        const sched = res.data.schedule || {}
        setFormData({
          is_active: sched.is_active || false,
          allow_ai_calls: sched.allow_ai_calls !== false,
          allow_scheduling: sched.allow_scheduling !== false,
          start_time: (sched.start_time || '09:00:00').substring(0, 5),
          end_time: (sched.end_time || '17:00:00').substring(0, 5),
          slot_duration_minutes: sched.slot_duration_minutes || 10,
          buffer_minutes: sched.buffer_minutes || 0,
          available_days: sched.available_days || ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
        })
      } else {
        setError(res.error || 'Failed to load doctor details')
      }
      setLoading(false)
    }
    loadData()
  }, [id])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    
    const payload = {
      ...formData,
      start_time: `${formData.start_time}:00`,
      end_time: `${formData.end_time}:00`,
    }

    const res = await updateDoctorSchedule(id, payload)
    setSaving(false)
    
    if (res.success) {
      router.push('/admin/doctors')
    } else {
      setError(res.error || 'Failed to update schedule')
    }
  }

  const toggleDay = (day: string) => {
    setFormData(prev => {
      if (prev.available_days.includes(day)) {
        return { ...prev, available_days: prev.available_days.filter(d => d !== day) }
      } else {
        return { ...prev, available_days: [...prev.available_days, day] }
      }
    })
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  if (error && !doctor) {
    return (
      <div className="p-4 bg-red-50 text-red-600 rounded-md flex items-center gap-2">
        <AlertCircle className="w-5 h-5" />
        {error}
      </div>
    )
  }

  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/admin/doctors">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Doctor Settings</h1>
          <p className="text-muted-foreground">{doctor?.full_name}</p>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 text-red-600 rounded-md flex items-center gap-2 text-sm">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>Schedule & Preferences</CardTitle>
            <CardDescription>Manage availability and system integrations.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            
            <div className="space-y-4 pb-6 border-b">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Active Status</Label>
                  <div className="text-sm text-muted-foreground">Is the doctor currently active and working?</div>
                </div>
                <Switch 
                  checked={formData.is_active} 
                  onCheckedChange={checked => setFormData({...formData, is_active: checked})}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>AI Sales Bot Calls</Label>
                  <div className="text-sm text-muted-foreground">Allow the AI agent to transfer calls to this doctor?</div>
                </div>
                <Switch 
                  checked={formData.allow_ai_calls} 
                  onCheckedChange={checked => setFormData({...formData, allow_ai_calls: checked})}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Consultation Scheduling</Label>
                  <div className="text-sm text-muted-foreground">Allow new appointments to be scheduled?</div>
                </div>
                <Switch 
                  checked={formData.allow_scheduling} 
                  onCheckedChange={checked => setFormData({...formData, allow_scheduling: checked})}
                />
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="font-semibold">Working Hours</h3>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Start Time</Label>
                  <Input 
                    type="time" 
                    value={formData.start_time}
                    onChange={e => setFormData({...formData, start_time: e.target.value})}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>End Time</Label>
                  <Input 
                    type="time" 
                    value={formData.end_time}
                    onChange={e => setFormData({...formData, end_time: e.target.value})}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Slot Duration (minutes)</Label>
                  <Input 
                    type="number" 
                    value={formData.slot_duration_minutes}
                    onChange={e => setFormData({...formData, slot_duration_minutes: parseInt(e.target.value) || 10})}
                    required
                    min={1}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Buffer (minutes)</Label>
                  <Input 
                    type="number" 
                    value={formData.buffer_minutes}
                    onChange={e => setFormData({...formData, buffer_minutes: parseInt(e.target.value) || 0})}
                    min={0}
                  />
                </div>
              </div>

              <div className="space-y-2 pt-2">
                <Label>Available Days</Label>
                <div className="flex flex-wrap gap-2">
                  {days.map(day => (
                    <Badge 
                      key={day}
                      variant={formData.available_days.includes(day) ? 'default' : 'outline'}
                      className="cursor-pointer"
                      onClick={() => toggleDay(day)}
                    >
                      {day}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>

            <div className="pt-4 flex justify-end">
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                <Save className="w-4 h-4 mr-2" />
                Save Changes
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  )
}

function Badge({ children, variant, className, onClick }: any) {
  // Simple inline badge since we don't have the ui/badge export from client
  const baseStyle = "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
  const variantStyles: any = {
    default: "border-transparent bg-primary text-primary-foreground hover:bg-primary/80",
    outline: "text-foreground",
  }
  
  return (
    <div className={`${baseStyle} ${variantStyles[variant]} ${className}`} onClick={onClick}>
      {children}
    </div>
  )
}
