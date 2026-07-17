'use client'

import React, { useState, useEffect } from 'react'
import { fetchAdminConsultations, fetchActiveDoctors, reassignConsultation } from './actions'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Loader2, Plus, Calendar, Clock, User, AlertCircle, RefreshCw } from 'lucide-react'
import Link from 'next/link'

export default function ConsultationsPage() {
  const [consultations, setConsultations] = useState<any[]>([])
  const [filteredConsultations, setFilteredConsultations] = useState<any[]>([])
  const [filter, setFilter] = useState('all') // 'all', 'upcoming', 'historical'
  
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  
  const [doctors, setDoctors] = useState<any[]>([])
  const [reassignModalOpen, setReassignModalOpen] = useState(false)
  const [selectedAppointment, setSelectedAppointment] = useState<any>(null)
  const [newDoctorId, setNewDoctorId] = useState('')
  const [reassigning, setReassigning] = useState(false)

  const loadData = async () => {
    setLoading(true)
    setError('')
    try {
      const [consRes, docRes] = await Promise.all([
        fetchAdminConsultations(),
        fetchActiveDoctors()
      ])
      
      if (consRes.success) {
        setConsultations(consRes.data || [])
      } else {
        setError(consRes.error || 'Failed to fetch consultations')
      }
      
      if (docRes.success) {
        setDoctors(docRes.data || [])
      }
    } catch (e: any) {
      setError(e.message || 'An error occurred')
    }
    setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [])
  
  useEffect(() => {
    const now = new Date()
    const filtered = consultations.filter(c => {
      if (filter === 'all') return true
      
      const apptDate = new Date(c.scheduled_at)
      if (filter === 'upcoming') {
        return apptDate >= now
      } else if (filter === 'historical') {
        return apptDate < now
      }
      return true
    })
    setFilteredConsultations(filtered)
  }, [consultations, filter])

  const openReassign = (appt: any) => {
    setSelectedAppointment(appt)
    setNewDoctorId(appt.doctor_id || '')
    setReassignModalOpen(true)
  }

  const handleReassign = async () => {
    if (!selectedAppointment || !newDoctorId) return
    setReassigning(true)
    const res = await reassignConsultation(selectedAppointment.id, newDoctorId)
    setReassigning(false)
    if (res.success) {
      setReassignModalOpen(false)
      loadData()
    } else {
      alert(res.error || 'Failed to reassign')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Consultations</h1>
          <p className="text-muted-foreground">Manage and assign all doctor consultations.</p>
        </div>
        
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={loadData} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Link href="/admin/consultations/create">
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              New Consultation
            </Button>
          </Link>
        </div>
      </div>

      <div className="flex gap-2">
        <Button 
          variant={filter === 'all' ? 'default' : 'outline'} 
          onClick={() => setFilter('all')}
          size="sm"
        >
          All
        </Button>
        <Button 
          variant={filter === 'upcoming' ? 'default' : 'outline'} 
          onClick={() => setFilter('upcoming')}
          size="sm"
        >
          Upcoming
        </Button>
        <Button 
          variant={filter === 'historical' ? 'default' : 'outline'} 
          onClick={() => setFilter('historical')}
          size="sm"
        >
          Historical
        </Button>
      </div>

      {error && (
        <div className="p-4 bg-red-50 text-red-600 rounded-md flex items-center gap-2">
          <AlertCircle className="w-5 h-5" />
          {error}
        </div>
      )}

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-b">
              <tr>
                <th className="px-4 py-3 font-medium">Patient</th>
                <th className="px-4 py-3 font-medium">Doctor</th>
                <th className="px-4 py-3 font-medium">Date & Time</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {loading && consultations.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                    Loading consultations...
                  </td>
                </tr>
              ) : filteredConsultations.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                    No consultations found.
                  </td>
                </tr>
              ) : (
                filteredConsultations.map((appt) => (
                  <tr key={appt.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-medium">{appt.users?.name || appt.users?.full_name || appt.users?.phone || 'Unknown Patient'}</div>
                      <div className="text-xs text-muted-foreground">{(appt.users?.name || appt.users?.full_name) ? (appt.users?.phone || appt.users?.email || '-') : (appt.users?.email || '-')}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5 text-muted-foreground" />
                        <span>{appt.staffs?.full_name || 'Unassigned'}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                        <span>{new Date(appt.scheduled_at).toLocaleDateString()}</span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5 text-muted-foreground">
                        <Clock className="w-3.5 h-3.5" />
                        <span>{new Date(appt.scheduled_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border capitalize bg-secondary text-secondary-foreground">
                        {appt.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button variant="outline" size="sm" onClick={() => openReassign(appt)}>
                        Reassign
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={reassignModalOpen} onOpenChange={setReassignModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reassign Consultation</DialogTitle>
            <DialogDescription>
              Assign this consultation to a different doctor. This will bypass regular scheduling checks.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Select Doctor</label>
              <Select value={newDoctorId} onValueChange={v => setNewDoctorId(v || '')}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a doctor" />
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
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setReassignModalOpen(false)}>Cancel</Button>
            <Button onClick={handleReassign} disabled={reassigning || !newDoctorId || newDoctorId === selectedAppointment?.doctor_id}>
              {reassigning ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Confirm Reassignment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
