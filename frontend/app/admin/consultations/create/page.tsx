'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { fetchActiveDoctors, fetchPatients, createConsultation } from '../actions'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { ArrowLeft, Save, Loader2, AlertCircle, Search } from 'lucide-react'
import Link from 'next/link'

export default function CreateConsultationPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  
  const [doctors, setDoctors] = useState<any[]>([])
  const [patients, setPatients] = useState<any[]>([])
  const [searchPatient, setSearchPatient] = useState('')

  const [formData, setFormData] = useState({
    patient_id: '',
    doctor_id: '',
    date: '',
    time: '',
    duration_minutes: 10,
    notes: ''
  })

  useEffect(() => {
    async function loadData() {
      try {
        const [docRes, patRes] = await Promise.all([
          fetchActiveDoctors(),
          fetchPatients()
        ])
        
        if (docRes.success) setDoctors(docRes.data || [])
        if (patRes.success) setPatients(patRes.data || [])
        else setError(patRes.error || 'Failed to fetch patients')
      } catch (err: any) {
        setError(err.message || 'Error loading data')
      }
      setLoading(false)
    }
    loadData()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.patient_id || !formData.doctor_id || !formData.date || !formData.time) {
      setError('Please fill in all required fields.')
      return
    }

    setSaving(true)
    setError('')
    
    // Combine date and time into ISO string
    // Convert local time to UTC for the database
    const dt = new Date(`${formData.date}T${formData.time}`)
    
    const payload = {
      patient_id: formData.patient_id,
      doctor_id: formData.doctor_id,
      scheduled_at: dt.toISOString(),
      duration_minutes: formData.duration_minutes,
      notes: formData.notes
    }

    const res = await createConsultation(payload)
    setSaving(false)
    
    if (res.success) {
      router.push('/admin/consultations')
    } else {
      setError(res.error || 'Failed to create consultation')
    }
  }

  const filteredPatients = patients.filter(p => {
    const search = searchPatient.toLowerCase()
    return (p.name || '').toLowerCase().includes(search) || (p.phone || '').includes(search)
  }).slice(0, 50) // limit results for dropdown performance

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/admin/consultations">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">New Consultation</h1>
          <p className="text-muted-foreground">Force-schedule a consultation without constraints.</p>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 text-red-600 rounded-md flex items-center gap-2 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>Appointment Details</CardTitle>
            <CardDescription>Select a user and doctor to manually create an appointment.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            
            <div className="space-y-2">
              <Label>Patient (User or Lead)</Label>
              <div className="relative mb-2">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input 
                  placeholder="Search by name or phone..." 
                  className="pl-9"
                  value={searchPatient}
                  onChange={e => setSearchPatient(e.target.value)}
                />
              </div>
              <Select value={formData.patient_id} onValueChange={v => setFormData({...formData, patient_id: v || ''})}>
                <SelectTrigger>
                  <SelectValue placeholder="Select patient..." />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {filteredPatients.map(p => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} {p.phone ? `(${p.phone})` : ''} - {p.type}
                    </SelectItem>
                  ))}
                  {filteredPatients.length === 0 && (
                    <div className="p-2 text-sm text-muted-foreground">No patients found.</div>
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Doctor</Label>
              <Select value={formData.doctor_id} onValueChange={v => setFormData({...formData, doctor_id: v || ''})}>
                <SelectTrigger>
                  <SelectValue placeholder="Select doctor..." />
                </SelectTrigger>
                <SelectContent>
                  {doctors.map(d => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.full_name || d.name || 'Unnamed Doctor'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Date</Label>
                <Input 
                  type="date" 
                  value={formData.date}
                  onChange={e => setFormData({...formData, date: e.target.value})}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Time (Local Time)</Label>
                <Input 
                  type="time" 
                  value={formData.time}
                  onChange={e => setFormData({...formData, time: e.target.value})}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Duration (minutes)</Label>
              <Input 
                type="number" 
                min={1}
                value={formData.duration_minutes}
                onChange={e => setFormData({...formData, duration_minutes: parseInt(e.target.value) || 10})}
                required
              />
            </div>

            <div className="space-y-2">
              <Label>Notes (Optional)</Label>
              <Textarea 
                placeholder="Reason for consultation, special instructions..."
                value={formData.notes}
                onChange={e => setFormData({...formData, notes: e.target.value})}
                rows={3}
              />
            </div>

            <div className="pt-4 flex justify-end">
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                <Save className="w-4 h-4 mr-2" />
                Create Consultation
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  )
}
