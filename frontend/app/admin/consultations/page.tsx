'use client'

import React, { useState, useEffect, useCallback } from 'react'
import {
  fetchAdminConsultations,
  fetchActiveDoctors,
  reassignConsultation,
  fetchPendingDoctorAppointments,
  fetchAvailableSlots,
  bookPendingAppointment,
} from './actions'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Loader2, Plus, Calendar, Clock, User, AlertCircle, RefreshCw, MessageCircle, Stethoscope, CheckCircle2 } from 'lucide-react'
import Link from 'next/link'

type Tab = 'all' | 'upcoming' | 'historical' | 'pending_doctor'

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  confirmed: 'bg-blue-100 text-blue-800 border-blue-200',
  completed: 'bg-green-100 text-green-800 border-green-200',
  cancelled: 'bg-red-100 text-red-800 border-red-200',
  rejected: 'bg-red-100 text-red-800 border-red-200',
  waiting_for_doctor: 'bg-orange-100 text-orange-800 border-orange-200',
}

export default function ConsultationsPage() {
  const [consultations, setConsultations] = useState<any[]>([])
  const [pendingAppointments, setPendingAppointments] = useState<any[]>([])
  const [filteredConsultations, setFilteredConsultations] = useState<any[]>([])
  const [tab, setTab] = useState<Tab>('all')
  
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  
  const [doctors, setDoctors] = useState<any[]>([])
  
  // Reassign modal
  const [reassignModalOpen, setReassignModalOpen] = useState(false)
  const [selectedAppointment, setSelectedAppointment] = useState<any>(null)
  const [newDoctorId, setNewDoctorId] = useState('')
  const [reassigning, setReassigning] = useState(false)

  // Book Pending modal (for waiting_for_doctor)
  const [bookModalOpen, setBookModalOpen] = useState(false)
  const [bookingAppt, setBookingAppt] = useState<any>(null)
  const [bookDoctorId, setBookDoctorId] = useState('')
  const [bookDate, setBookDate] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    return d.toISOString().split('T')[0]
  })
  const [availableSlots, setAvailableSlots] = useState<any[]>([])
  const [selectedSlot, setSelectedSlot] = useState('')
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [booking, setBooking] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [consRes, docRes, pendingRes] = await Promise.all([
        fetchAdminConsultations(),
        fetchActiveDoctors(),
        fetchPendingDoctorAppointments(),
      ])
      
      if (consRes.success) setConsultations(consRes.data || [])
      else setError(consRes.error || 'Failed to fetch consultations')
      
      if (docRes.success) setDoctors(docRes.data || [])
      if (pendingRes.success) setPendingAppointments(pendingRes.data || [])
    } catch (e: any) {
      setError(e.message || 'An error occurred')
    }
    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])
  
  useEffect(() => {
    const now = new Date()
    const filtered = consultations.filter(c => {
      if (tab === 'pending_doctor') return false
      if (tab === 'all') return true
      const apptDate = new Date(c.scheduled_at)
      if (tab === 'upcoming') return apptDate >= now
      if (tab === 'historical') return apptDate < now
      return true
    })
    setFilteredConsultations(filtered)
  }, [consultations, tab])

  // Load slots whenever doctor or date changes in book modal
  useEffect(() => {
    if (!bookModalOpen || !bookDoctorId || !bookDate) return
    const load = async () => {
      setLoadingSlots(true)
      setSelectedSlot('')
      const res = await fetchAvailableSlots(bookDoctorId, bookDate)
      if (res.success) {
        setAvailableSlots((res.data || []).filter((s: any) => s.available))
      }
      setLoadingSlots(false)
    }
    load()
  }, [bookDoctorId, bookDate, bookModalOpen])

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
    if (res.success) { setReassignModalOpen(false); loadData() }
    else alert(res.error || 'Failed to reassign')
  }

  const openBookModal = (appt: any) => {
    setBookingAppt(appt)
    setBookDoctorId('')
    setSelectedSlot('')
    setAvailableSlots([])
    setBookModalOpen(true)
  }

  const handleBookPending = async () => {
    if (!bookingAppt || !bookDoctorId || !selectedSlot) return
    setBooking(true)
    const res = await bookPendingAppointment(bookingAppt.id, bookDoctorId, selectedSlot)
    setBooking(false)
    if (res.success) {
      setBookModalOpen(false)
      loadData()
    } else {
      alert(res.error || 'Failed to book appointment')
    }
  }

  const formatDt = (iso: string) => {
    try {
      const d = new Date(iso)
      return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    } catch { return iso }
  }

  const TABS: { key: Tab; label: string; count?: number }[] = [
    { key: 'all', label: 'All' },
    { key: 'upcoming', label: 'Upcoming' },
    { key: 'historical', label: 'Historical' },
    { key: 'pending_doctor', label: 'Pending — No Doctor', count: pendingAppointments.length },
  ]

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

      {/* Tabs */}
      <div className="flex gap-2 flex-wrap">
        {TABS.map(t => (
          <Button
            key={t.key}
            variant={tab === t.key ? 'default' : 'outline'}
            onClick={() => setTab(t.key)}
            size="sm"
            className="relative"
          >
            {t.key === 'pending_doctor' && <MessageCircle className="w-3.5 h-3.5 mr-1.5" />}
            {t.label}
            {t.count !== undefined && t.count > 0 && (
              <span className="ml-2 inline-flex items-center justify-center w-5 h-5 rounded-full bg-orange-500 text-white text-[10px] font-bold">
                {t.count}
              </span>
            )}
          </Button>
        ))}
      </div>

      {error && (
        <div className="p-4 bg-red-50 text-red-600 rounded-md flex items-center gap-2">
          <AlertCircle className="w-5 h-5" />
          {error}
        </div>
      )}

      {/* ── Pending Doctor Tab ── */}
      {tab === 'pending_doctor' ? (
        <div className="space-y-4">
          <div className="flex items-center gap-2 p-3 bg-orange-50 border border-orange-200 rounded-lg text-sm text-orange-800">
            <AlertCircle className="w-4 h-4 shrink-0" />
            These patients messaged via WhatsApp to book an appointment, but no doctor was available at that time. Assign a doctor and slot to confirm their booking.
          </div>

          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : pendingAppointments.length === 0 ? (
            <Card className="p-10 text-center text-muted-foreground">
              <CheckCircle2 className="w-10 h-10 mx-auto mb-3 text-green-400" />
              All WhatsApp booking requests have been handled!
            </Card>
          ) : (
            <Card>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-b">
                    <tr>
                      <th className="px-4 py-3 font-medium">Patient</th>
                      <th className="px-4 py-3 font-medium">Contact</th>
                      <th className="px-4 py-3 font-medium">Notes / Request</th>
                      <th className="px-4 py-3 font-medium">Requested On</th>
                      <th className="px-4 py-3 font-medium text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {pendingAppointments.map(appt => (
                      <tr key={appt.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3">
                          <div className="font-medium flex items-center gap-1.5">
                            <MessageCircle className="w-3.5 h-3.5 text-green-600" />
                            {appt.users?.name || 'Unknown'}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">
                          <div>{appt.users?.phone || '—'}</div>
                          <div>{appt.users?.email || ''}</div>
                          {appt.users?.metadata?.city && (
                            <div className="text-xs text-blue-600">{appt.users.metadata.city}</div>
                          )}
                        </td>
                        <td className="px-4 py-3 max-w-[240px]">
                          <p className="text-xs text-muted-foreground line-clamp-2">{appt.notes || '—'}</p>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {formatDt(appt.created_at)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button size="sm" onClick={() => openBookModal(appt)}>
                            <Stethoscope className="w-3.5 h-3.5 mr-1.5" />
                            Book Appointment
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      ) : (
        /* ── Regular Consultations Table ── */
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-b">
                <tr>
                  <th className="px-4 py-3 font-medium">Patient</th>
                  <th className="px-4 py-3 font-medium">Doctor</th>
                  <th className="px-4 py-3 font-medium">Date &amp; Time</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Notes / Reason</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {loading && consultations.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                      <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                      Loading consultations...
                    </td>
                  </tr>
                ) : filteredConsultations.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
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
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border capitalize ${STATUS_COLORS[appt.status] || 'bg-secondary text-secondary-foreground'}`}>
                          {appt.status?.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3 max-w-[200px]">
                        <p className="text-xs text-muted-foreground line-clamp-2">{appt.notes || '—'}</p>
                        {/* Show cancellation reason prominently */}
                        {appt.status === 'cancelled' && appt.notes?.includes('Reason:') && (
                          <p className="text-xs text-red-600 mt-1 font-medium">
                            {appt.notes.split('Reason:')[1]?.trim()}
                          </p>
                        )}
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
      )}

      {/* ── Reassign Dialog ── */}
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

      {/* ── Book Pending Appointment Dialog ── */}
      <Dialog open={bookModalOpen} onOpenChange={setBookModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageCircle className="w-5 h-5 text-green-600" />
              Book Appointment — WhatsApp Request
            </DialogTitle>
            <DialogDescription>
              {bookingAppt?.users?.name || 'This patient'} requested an appointment via WhatsApp but no doctor was available. Select a doctor and available slot to confirm.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Patient Info */}
            {bookingAppt?.users && (
              <div className="p-3 bg-muted/50 rounded-lg text-sm space-y-1">
                <div className="font-medium">{bookingAppt.users.name || 'Unknown'}</div>
                <div className="text-muted-foreground">{bookingAppt.users.phone}</div>
                {bookingAppt.users.metadata?.city && (
                  <div className="text-muted-foreground">{bookingAppt.users.metadata.city}</div>
                )}
                {bookingAppt.users.metadata?.goals && (
                  <div className="text-xs text-blue-600">Goal: {bookingAppt.users.metadata.goals}</div>
                )}
                {bookingAppt.users.metadata?.medical_condition && (
                  <div className="text-xs text-orange-600">Condition: {bookingAppt.users.metadata.medical_condition}</div>
                )}
              </div>
            )}

            {/* Doctor Selection */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Select Doctor</label>
              <Select value={bookDoctorId} onValueChange={v => { setBookDoctorId(v || ''); setSelectedSlot('') }}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a doctor..." />
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

            {/* Date Selection */}
            {bookDoctorId && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Select Date</label>
                <input
                  type="date"
                  value={bookDate}
                  min={new Date().toISOString().split('T')[0]}
                  onChange={e => { setBookDate(e.target.value); setSelectedSlot('') }}
                  className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            )}

            {/* Slot Selection */}
            {bookDoctorId && bookDate && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Available Slots</label>
                {loadingSlots ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                    <Loader2 className="w-4 h-4 animate-spin" /> Loading slots...
                  </div>
                ) : availableSlots.length === 0 ? (
                  <div className="text-sm text-orange-600 py-2 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" />
                    No available slots on this date. Try another day.
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-2 max-h-48 overflow-y-auto pr-1">
                    {availableSlots.map((slot: any) => (
                      <button
                        key={slot.start}
                        onClick={() => setSelectedSlot(slot.start)}
                        className={`text-xs px-2 py-2 rounded-md border transition font-medium ${
                          selectedSlot === slot.start
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-white hover:bg-muted border-border'
                        }`}
                      >
                        {slot.start_display}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setBookModalOpen(false)}>Cancel</Button>
            <Button
              onClick={handleBookPending}
              disabled={booking || !bookDoctorId || !selectedSlot}
            >
              {booking ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
              Confirm Appointment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
