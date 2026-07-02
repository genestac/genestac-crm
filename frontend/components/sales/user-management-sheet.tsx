'use client'

import { useState, useEffect } from 'react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { updateLeadDetails, uploadLeadDocument, getLeadDocuments, getUserNotes, addInteractionNote, getDoctors, bookAppointment, getPlans, getSources } from '@/app/sales/actions'
import { FileUp, FileText, Download, Loader2, CreditCard, ChevronDown, ChevronRight, Check } from 'lucide-react'

export function UserManagementSheet({ 
  lead, 
  children 
}: { 
  lead: any, 
  children: React.ReactNode 
}) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [documents, setDocuments] = useState<any[]>([])
  
  const [plans, setPlans] = useState<any[]>([])
  const [sources, setSources] = useState<any[]>([])
  
  const [sourceId, setSourceId] = useState<string | undefined>(undefined)
  const [planId, setPlanId] = useState<string | undefined>(undefined)
  const [customFields, setCustomFields] = useState<any[]>([])
  
  // Tab state: "overview", "pipeline", "files"
  const [activeTab, setActiveTab] = useState("overview")
  const [addressOpen, setAddressOpen] = useState(false)
  
  // Notes state
  const [notes, setNotes] = useState<any[]>([])
  const [newNote, setNewNote] = useState('')
  const [noteDate, setNoteDate] = useState('')
  const [savingNote, setSavingNote] = useState(false)

  // Appointments state
  const [doctors, setDoctors] = useState<any[]>([])
  const [bookingAppt, setBookingAppt] = useState(false)
  const [apptForm, setApptForm] = useState({ doctorId: '', date: '', time: '', notes: '' })

  // Form state to make inputs controlled
  const [formData, setFormData] = useState({
    name: lead.name || '',
    phone: lead.phone || '',
    email: lead.email || '',
    street_address: lead.street_address || '',
    city: lead.city || '',
    state: lead.state || '',
    postal_code: lead.postal_code || '',
    country: lead.country || 'India',
    next_followup_date: lead.next_followup_date ? new Date(lead.next_followup_date).toISOString().slice(0, 16) : ''
  })
  
  const [metaData, setMetaData] = useState<Record<string, any>>(lead.metadata || {})

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }
  
  const handleMetaChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    const key = name.replace('meta_', '')
    setMetaData(prev => ({ ...prev, [key]: value }))
  }

  useEffect(() => {
    if (open) {
      setSourceId(lead.source_id || undefined)
      setPlanId(lead.interested_plan_id || undefined)
      setFormData({
        name: lead.name || '',
        phone: lead.phone || '',
        email: lead.email || '',
        street_address: lead.street_address || '',
        city: lead.city || '',
        state: lead.state || '',
        postal_code: lead.postal_code || '',
        country: lead.country || 'India',
        next_followup_date: lead.next_followup_date ? new Date(lead.next_followup_date).toISOString().slice(0, 16) : ''
      })
      setMetaData(lead.metadata || {})
      getLeadDocuments(lead.id).then(setDocuments).catch(console.error)
      getUserNotes(lead.id).then(setNotes).catch(console.error)
      getDoctors().then(setDoctors).catch(console.error)
      // Fetch all sources and plans to resolve IDs correctly (even inactive ones)
      getPlans().then(data => setPlans(data || []))
      getSources().then(data => setSources(data || []))
      
      // Fetch custom fields
      import('@/app/sales/actions').then(m => m.getCustomFields()).then(fields => {
        const entity = (lead.record_type || 'USER').toLowerCase()
        setCustomFields(fields.filter((f: any) => f.entity_type === entity))
      }).catch(console.error)
    }
  }, [open, lead])

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)
    
    const submitData = new FormData(e.currentTarget)
    submitData.append('lead_id', lead.id)
    if (lead.record_type) submitData.append('record_type', lead.record_type)
    
    submitData.append('metadata_json', JSON.stringify(metaData))
    
    try {
      await updateLeadDetails(submitData)
      alert("Updated successfully!")
      setOpen(false)
    } catch (err: any) {
      alert(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleAddNote = async () => {
    if (!newNote.trim()) return
    setSavingNote(true)
    try {
      const formattedDate = noteDate ? new Date(noteDate).toISOString() : undefined;
      await addInteractionNote(lead.id, newNote, formattedDate)
      setNewNote('')
      setNoteDate('')
      const updatedNotes = await getUserNotes(lead.id)
      setNotes(updatedNotes)
    } catch (err: any) {
      alert("Failed to save note: " + err.message)
    } finally {
      setSavingNote(false)
    }
  }

  const handleBookAppointment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!apptForm.doctorId || !apptForm.date || !apptForm.time) {
      alert("Please select doctor, date and time")
      return
    }
    setBookingAppt(true)
    try {
      const formData = new FormData()
      formData.append('lead_id', lead.id)
      formData.append('doctor_id', apptForm.doctorId)
      formData.append('date', apptForm.date)
      formData.append('time', apptForm.time)
      formData.append('notes', apptForm.notes)
      
      await bookAppointment(formData)
      alert("Appointment requested successfully!")
      setApptForm({ doctorId: '', date: '', time: '', notes: '' })
      setActiveTab('overview')
    } catch (err: any) {
      alert("Failed to book appointment: " + err.message)
    } finally {
      setBookingAppt(false)
    }
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    
    setUploading(true)
    const formData = new FormData()
    formData.append('lead_id', lead.id)
    formData.append('file', file)

    try {
      const res = await uploadLeadDocument(formData)
      if (res.success) {
        const docs = await getLeadDocuments(lead.id)
        setDocuments(docs)
      }
    } catch (err: any) {
      alert("Upload failed: " + err.message)
    } finally {
      setUploading(false)
    }
  }

  const generatePaymentLink = () => {
    if (!lead.interested_plan_id) {
      alert("Please select and save an Interested Plan first before generating a payment link.")
      return
    }
    const selectedPlan = plans.find(p => p.id === lead.interested_plan_id)
    if (!selectedPlan) return
    
    const link = `https://checkout.genestac.com/pay/${selectedPlan.id}?uid=${lead.id}`
    navigator.clipboard.writeText(link)
    alert(`Payment link for ₹${selectedPlan.price} copied to clipboard!\n\nLink: ${link}`)
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={children as React.ReactElement} />
      <SheetContent className="sm:max-w-[500px] w-full bg-card p-0 flex flex-col border-l border-border/50 shadow-2xl">
        
        {/* Minimal Header */}
        <SheetHeader className="px-8 pt-10 pb-8 bg-card border-b relative overflow-hidden">
          <div className="absolute top-[-50%] right-[-10%] w-64 h-64 bg-gradient-to-br from-[var(--color-brand-green)] to-[var(--color-brand-ocean)] rounded-full blur-[80px] opacity-20 pointer-events-none"></div>
          <div className="flex items-center justify-between mb-4 relative z-10">
            <span className="px-3 py-1 text-[11px] font-bold uppercase tracking-widest bg-gradient-to-r from-[var(--color-brand-teal)] to-[var(--color-brand-ocean)] text-white rounded-full shadow-sm">
              {lead.status.replace('_', ' ')}
            </span>
            <span className="text-xs text-gray-400 font-mono">ID: {lead.id.substring(0, 8)}</span>
          </div>
          <SheetTitle className="text-4xl font-extrabold text-foreground tracking-tight relative z-10">{lead.name || 'Unnamed User'}</SheetTitle>
          <div className="flex items-center gap-4 text-sm text-gray-500 mt-2">
            <span>{lead.phone}</span>
            {lead.email && (
              <>
                <span className="w-1 h-1 rounded-full bg-gray-300"></span>
                <span>{lead.email}</span>
              </>
            )}
          </div>
        </SheetHeader>

        {/* Custom Minimal Tabs */}
        <div className="flex border-b px-8 bg-muted/30 pt-2 gap-2">
          {[
            { id: "overview", label: "Overview" },
            { id: "pipeline", label: "Pipeline" },
            { id: "appointments", label: "Appointments" },
            { id: "files", label: "Files & Notes" }
          ].map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-5 py-2.5 text-sm font-semibold rounded-t-xl transition-all duration-300 ${
                activeTab === tab.id 
                  ? 'border-primary text-primary' 
                  : 'border-transparent text-gray-500 hover:text-gray-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Scrollable Content */}
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto px-8 py-6">
            
            {/* OVERVIEW TAB */}
            {activeTab === "overview" && (
              <div className="space-y-6">
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-gray-500 font-medium uppercase tracking-wider">Full Name</Label>
                    <Input name="name" value={formData.name} onChange={handleInputChange} className="bg-muted/50 rounded-xl border-border/50 transition-all hover:bg-muted focus:bg-card shadow-inner border-gray-200 shadow-none focus-visible:ring-primary" />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs text-gray-500 font-medium uppercase tracking-wider">Phone</Label>
                      <Input name="phone" value={formData.phone} onChange={handleInputChange} readOnly className="bg-gray-100 text-gray-500 border-gray-200 shadow-none" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-gray-500 font-medium uppercase tracking-wider">Email</Label>
                      <Input name="email" type="email" value={formData.email} onChange={handleInputChange} className="bg-muted/50 rounded-xl border-border/50 transition-all hover:bg-muted focus:bg-card shadow-inner border-gray-200 shadow-none focus-visible:ring-primary" />
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-gray-100">
                  <button 
                    type="button" 
                    onClick={() => setAddressOpen(!addressOpen)}
                    className="flex items-center text-sm font-medium text-gray-900 hover:text-primary transition-colors"
                  >
                    {addressOpen ? <ChevronDown className="w-4 h-4 mr-1" /> : <ChevronRight className="w-4 h-4 mr-1" />}
                    Address Details
                  </button>
                  
                  {addressOpen && (
                    <div className="mt-4 grid grid-cols-2 gap-4">
                      <div className="col-span-2 space-y-1.5">
                        <Input name="street_address" value={formData.street_address} onChange={handleInputChange} placeholder="Street Address" className="bg-muted/50 rounded-xl border-border/50 transition-all hover:bg-muted focus:bg-card shadow-inner shadow-none" />
                      </div>
                      <div className="space-y-1.5">
                        <Input name="city" value={formData.city} onChange={handleInputChange} placeholder="City" className="bg-muted/50 rounded-xl border-border/50 transition-all hover:bg-muted focus:bg-card shadow-inner shadow-none" />
                      </div>
                      <div className="space-y-1.5">
                        <Input name="state" value={formData.state} onChange={handleInputChange} placeholder="State" className="bg-muted/50 rounded-xl border-border/50 transition-all hover:bg-muted focus:bg-card shadow-inner shadow-none" />
                      </div>
                      <div className="space-y-1.5">
                        <Input name="postal_code" value={formData.postal_code} onChange={handleInputChange} placeholder="Postal Code" className="bg-muted/50 rounded-xl border-border/50 transition-all hover:bg-muted focus:bg-card shadow-inner shadow-none" />
                      </div>
                      <div className="space-y-1.5">
                        <Input name="country" value={formData.country} onChange={handleInputChange} placeholder="Country" className="bg-muted/50 rounded-xl border-border/50 transition-all hover:bg-muted focus:bg-card shadow-inner shadow-none" />
                      </div>
                    </div>
                  )}
                </div>

                {customFields.length > 0 && (
                  <div className="pt-4 border-t border-gray-100">
                    <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">Additional Details</h4>
                    <div className="grid grid-cols-2 gap-4">
                      {customFields.map((field) => (
                        <div key={field.id} className="space-y-1.5">
                          <Label className="text-xs text-gray-500 font-medium">{field.label}</Label>
                          {field.type === 'boolean' ? (
                            <Select 
                              name={`meta_${field.name}`} 
                              value={metaData[field.name] || 'false'} 
                              onValueChange={(val) => handleMetaChange({ target: { name: `meta_${field.name}`, value: val } } as any)}
                            >
                              <SelectTrigger className="bg-muted/50 rounded-xl border-border/50 shadow-none">
                                <SelectValue placeholder="Select" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="true">Yes</SelectItem>
                                <SelectItem value="false">No</SelectItem>
                              </SelectContent>
                            </Select>
                          ) : (
                            <Input 
                              type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
                              name={`meta_${field.name}`}
                              value={metaData[field.name] || ''}
                              onChange={handleMetaChange}
                              className="bg-muted/50 rounded-xl border-border/50 shadow-none"
                              required={field.is_required}
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* PIPELINE TAB */}
            {activeTab === "pipeline" && (
              <div className="space-y-8">
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-gray-500 font-medium uppercase tracking-wider">User Stage</Label>
                    <Select name="status" defaultValue={lead.status}>
                      <SelectTrigger className="bg-muted/50 rounded-xl border-border/50 transition-all hover:bg-muted focus:bg-card shadow-inner shadow-none">
                        <SelectValue placeholder="Status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="NEW">New (Raw)</SelectItem>
                        <SelectItem value="UNREAD">Unread</SelectItem>
                        <SelectItem value="ASSIGNED">Assigned</SelectItem>
                        <SelectItem value="CONTACT_ATTEMPTED">Contact Attempted</SelectItem>
                        <SelectItem value="CONTACTED">Contacted</SelectItem>
                        <SelectItem value="QUALIFIED">Qualified</SelectItem>
                        <SelectItem value="CONSULTATION_SCHEDULED">Consultation Scheduled</SelectItem>
                        <SelectItem value="CONSULTATION_COMPLETED">Consultation Completed</SelectItem>
                        <SelectItem value="CONVERTED">Converted</SelectItem>
                        <SelectItem value="ON_HOLD">On Hold</SelectItem>
                        <SelectItem value="LOST">Lost</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-gray-500 font-medium uppercase tracking-wider">Priority</Label>
                    <Select name="priority" defaultValue={lead.priority || 'MEDIUM'}>
                      <SelectTrigger className="bg-muted/50 rounded-xl border-border/50 transition-all hover:bg-muted focus:bg-card shadow-inner shadow-none">
                        <SelectValue placeholder="Priority" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="HIGH">High</SelectItem>
                        <SelectItem value="MEDIUM">Medium</SelectItem>
                        <SelectItem value="LOW">Low</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-gray-500 font-medium uppercase tracking-wider">User Source</Label>
                    {sources.length === 0 ? (
                      <div className="h-9 w-full animate-pulse bg-gray-100 rounded-md"></div>
                    ) : (
                      <Select name="source_id" value={sourceId} onValueChange={(val) => setSourceId(val || undefined)}>
                        <SelectTrigger className="bg-muted/50 rounded-xl border-border/50 transition-all hover:bg-muted focus:bg-card shadow-inner shadow-none overflow-hidden">
                          <span className="truncate">
                            {sourceId 
                              ? (sources.find(s => s.id === sourceId)?.name || lead.user_sources?.name || 'Unknown Source')
                              : 'Select Source'
                            }
                          </span>
                        </SelectTrigger>
                        <SelectContent>
                          {sourceId && !sources.some(s => s.id === sourceId) && (
                            <SelectItem value={sourceId}>
                              {lead.user_sources?.name || 'Unknown Source'}
                            </SelectItem>
                          )}
                          {sources.map(s => {
                            if (!s.is_active && s.id !== sourceId) return null;
                            return <SelectItem key={s.id} value={s.id}>{s.name} {!s.is_active && '(Inactive)'}</SelectItem>
                          })}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-gray-500 font-medium uppercase tracking-wider">Interested Plan</Label>
                    {plans.length === 0 ? (
                      <div className="h-9 w-full animate-pulse bg-gray-100 rounded-md"></div>
                    ) : (
                      <Select name="interested_plan_id" value={planId} onValueChange={(val) => setPlanId(val || undefined)}>
                        <SelectTrigger className="bg-muted/50 rounded-xl border-border/50 transition-all hover:bg-muted focus:bg-card shadow-inner shadow-none overflow-hidden">
                          <span className="truncate">
                            {planId 
                              ? (plans.find(p => p.id === planId)?.name || lead.plans?.name || 'Unknown Plan')
                              : 'Select Plan'
                            }
                          </span>
                        </SelectTrigger>
                        <SelectContent>
                          {planId && !plans.some(p => p.id === planId) && (
                            <SelectItem value={planId}>
                              {lead.plans?.name || 'Unknown Plan'}
                            </SelectItem>
                          )}
                          {plans.map(p => {
                            if (!p.is_active && p.id !== planId) return null;
                            return <SelectItem key={p.id} value={p.id}>{p.name} (₹{p.price}) {!p.is_active && '(Inactive)'}</SelectItem>
                          })}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-500 font-medium uppercase tracking-wider">Next Follow-up</Label>
                  <Input 
                    name="next_followup_date" 
                    type="datetime-local" 
                    value={formData.next_followup_date}
                    onChange={handleInputChange}
                    className="bg-muted/50 rounded-xl border-border/50 transition-all hover:bg-muted focus:bg-card shadow-inner shadow-none"
                  />
                </div>
              </div>
            )}

            {/* APPOINTMENTS TAB */}
            {activeTab === "appointments" && (
              <div className="space-y-6">
                <div className="space-y-4">
                  <div className="flex flex-col mb-6 pb-6 border-b border-gray-100">
                    <h3 className="text-lg font-bold text-gray-900 mb-1">Book Consultation</h3>
                    <p className="text-xs text-gray-500">Request a time slot with a doctor. The doctor will need to approve this request.</p>
                  </div>
                  
                  <div className="space-y-1.5">
                    <Label className="text-xs text-gray-500 font-medium uppercase tracking-wider">Select Doctor</Label>
                    <Select value={apptForm.doctorId} onValueChange={(v) => setApptForm({...apptForm, doctorId: v || ""})}>
                      <SelectTrigger className="bg-muted/50 rounded-xl border-border/50 transition-all hover:bg-muted focus:bg-card shadow-inner shadow-none">
                        <SelectValue placeholder="Choose a doctor" />
                      </SelectTrigger>
                      <SelectContent>
                        {doctors.map(d => (
                          <SelectItem key={d.id} value={d.id}>{d.full_name || 'Unnamed Doctor'}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs text-gray-500 font-medium uppercase tracking-wider">Date</Label>
                      <Input 
                        type="date" 
                        value={apptForm.date} 
                        onChange={e => setApptForm({...apptForm, date: e.target.value})}
                        className="bg-muted/50 rounded-xl border-border/50 transition-all hover:bg-muted focus:bg-card shadow-inner shadow-none" 
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-gray-500 font-medium uppercase tracking-wider">Time</Label>
                      <Select value={apptForm.time} onValueChange={(v) => setApptForm({...apptForm, time: v || ""})}>
                        <SelectTrigger className="bg-muted/50 rounded-xl border-border/50 transition-all hover:bg-muted focus:bg-card shadow-inner shadow-none">
                          <SelectValue placeholder="Select Slot" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="09:00">09:00 AM</SelectItem>
                          <SelectItem value="09:30">09:30 AM</SelectItem>
                          <SelectItem value="10:00">10:00 AM</SelectItem>
                          <SelectItem value="10:30">10:30 AM</SelectItem>
                          <SelectItem value="11:00">11:00 AM</SelectItem>
                          <SelectItem value="11:30">11:30 AM</SelectItem>
                          <SelectItem value="12:00">12:00 PM</SelectItem>
                          <SelectItem value="13:00">01:00 PM</SelectItem>
                          <SelectItem value="13:30">01:30 PM</SelectItem>
                          <SelectItem value="14:00">02:00 PM</SelectItem>
                          <SelectItem value="14:30">02:30 PM</SelectItem>
                          <SelectItem value="15:00">03:00 PM</SelectItem>
                          <SelectItem value="15:30">03:30 PM</SelectItem>
                          <SelectItem value="16:00">04:00 PM</SelectItem>
                          <SelectItem value="16:30">04:30 PM</SelectItem>
                          <SelectItem value="17:00">05:00 PM</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs text-gray-500 font-medium uppercase tracking-wider">Notes for Doctor</Label>
                    <Textarea 
                      value={apptForm.notes} 
                      onChange={e => setApptForm({...apptForm, notes: e.target.value})}
                      placeholder="Symptoms, previous consultations, etc."
                      className="bg-muted/50 rounded-xl border-border/50 transition-all hover:bg-muted focus:bg-card shadow-inner shadow-none resize-none h-24" 
                    />
                  </div>

                  <div className="pt-4">
                    <Button 
                      type="button" 
                      onClick={handleBookAppointment}
                      disabled={bookingAppt || !apptForm.doctorId || !apptForm.date || !apptForm.time}
                      className="w-full bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-none"
                    >
                      {bookingAppt ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                      Request Appointment
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* FILES & NOTES TAB */}
            {activeTab === "files" && (
              <div className="space-y-8">
                <div className="space-y-4">
                  <Label className="text-xs text-gray-500 font-medium uppercase tracking-wider">Interaction Timeline</Label>
                  
                  {/* Add Note */}
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <Input 
                        type="datetime-local" 
                        value={noteDate}
                        onChange={(e) => setNoteDate(e.target.value)}
                        className="w-48 bg-muted/50 rounded-xl border-border/50 transition-all hover:bg-muted focus:bg-card shadow-inner shadow-none"
                      />
                    </div>
                    <Textarea 
                      value={newNote}
                      onChange={(e) => setNewNote(e.target.value)}
                      placeholder="Add a new interaction note..." 
                      className="h-20 resize-none bg-muted/50 rounded-xl border-border/50 transition-all hover:bg-muted focus:bg-card shadow-inner shadow-none border-gray-200"
                    />
                    <div className="flex justify-end">
                      <Button 
                        type="button" 
                        size="sm" 
                        onClick={handleAddNote}
                        disabled={savingNote || !newNote.trim()}
                        className="bg-primary hover:bg-primary text-white shadow-none"
                      >
                        {savingNote ? <Loader2 className="w-3 h-3 animate-spin mr-2" /> : null}
                        Post Note
                      </Button>
                    </div>
                  </div>

                  {/* Timeline */}
                  <div className="space-y-4 pt-2">
                    {notes.length === 0 ? (
                      <div className="text-center py-6 text-sm text-gray-400 italic">No notes recorded yet.</div>
                    ) : (
                      <div className="relative border-l-2 border-primary/20 ml-3 space-y-8">
                        {notes.map((note, idx) => (
                          <div key={note.id} className="relative pl-6">
                            <div className="absolute -left-[9px] top-1.5 w-4 h-4 bg-gradient-to-r from-[var(--color-brand-green)] to-[var(--color-brand-teal)] rounded-full border-4 border-card shadow-sm"></div>
                            <div className="bg-muted/50 rounded-xl border-border/50 transition-all hover:bg-muted focus:bg-card shadow-inner border border-gray-100 rounded-lg p-4">
                              <div className="flex justify-between items-start mb-2">
                                <span className="text-xs font-semibold text-gray-900">Sales Rep</span>
                                <span className="text-[10px] text-gray-400 whitespace-nowrap">
                                  {new Date(note.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                </span>
                              </div>
                              <p className="text-sm text-gray-700 whitespace-pre-wrap">{note.content}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-3">
                  <Label className="text-xs text-gray-500 font-medium uppercase tracking-wider">Documents</Label>
                  <div className="border border-dashed border-gray-300 rounded-lg p-6 text-center bg-gray-50 hover:bg-gray-100 transition-colors cursor-pointer relative">
                    <input 
                      type="file" 
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed" 
                      onChange={handleFileUpload}
                      disabled={uploading}
                    />
                    {uploading ? (
                      <Loader2 className="w-6 h-6 text-primary mx-auto mb-2 animate-spin" />
                    ) : (
                      <FileUp className="w-6 h-6 text-gray-400 mx-auto mb-2" />
                    )}
                    <p className="text-sm font-medium text-gray-700">
                      {uploading ? "Uploading..." : "Upload files"}
                    </p>
                  </div>

                  {documents.length > 0 && (
                    <div className="space-y-2 mt-4">
                      {documents.map(doc => (
                        <div key={doc.id} className="flex items-center justify-between p-3 border border-gray-100 rounded-lg hover:bg-gray-50">
                          <div className="flex items-center gap-3 overflow-hidden">
                            <FileText className="w-4 h-4 text-primary shrink-0" />
                            <p className="text-sm text-gray-700 truncate">{doc.file_name}</p>
                          </div>
                          <a href={doc.file_url} target="_blank" rel="noopener noreferrer" className="p-1.5 text-gray-400 hover:text-primary hover:bg-indigo-50 rounded-md transition-colors">
                            <Download className="w-4 h-4" />
                          </a>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Action Footer */}
          <div className="px-8 py-5 bg-card border-t border-border/50 flex items-center justify-between mt-auto shrink-0 z-10 relative">
            <button 
              type="button" 
              onClick={generatePaymentLink}
              className="text-sm font-medium text-primary hover:text-primary/90 flex items-center"
            >
              <CreditCard className="w-4 h-4 mr-1.5" />
              Payment Link
            </button>
            <Button type="submit" className="bg-gradient-to-r from-[var(--color-brand-teal)] to-[var(--color-brand-ocean)] hover:opacity-90 transition-opacity text-white shadow-lg shadow-primary/25 px-8 rounded-full font-bold tracking-wide transform hover:scale-105 duration-300" disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Check className="w-4 h-4 mr-2" />}
              {loading ? "Saving" : "Save Changes"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}
