'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { updateLeadDetails, uploadLeadDocument, getLeadDocuments, getUserNotes, addInteractionNote, getDoctors, bookAppointment, getPlans, getSources, generateRazorpayLink, getProformaInvoices, deleteProformaInvoice, getCurrentUserRole, getAICallLogs, triggerAICall } from '@/app/sales/actions'
import { FileUp, FileText, Download, Loader2, CreditCard, ChevronDown, ChevronRight, Check, Calendar, Activity, User, Receipt, CheckCircle2, FileDown, Phone, Mic, Bot } from 'lucide-react'

export function UserManagementSheet({ 
  lead, 
  statusOptions,
  children 
}: { 
  lead: any, 
  statusOptions?: {value: string, label: string}[],
  children: React.ReactNode 
}) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [documents, setDocuments] = useState<any[]>([])
  
  const [plans, setPlans] = useState<any[]>([])
  const [sources, setSources] = useState<any[]>([])
  
  const [sourceId, setSourceId] = useState<string | null>(lead.user_source_id || null)
  const [planId, setPlanId] = useState<string | null>(lead.interested_plan_id || null)
  const [customFields, setCustomFields] = useState<any[]>([])
  
  // Tab state: "overview", "pipeline", "payment", "appointments", "files"
  const [activeTab, setActiveTabRaw] = useState("overview")

  useEffect(() => {
    const saved = sessionStorage.getItem("user-management-tab")
    if (saved) setActiveTabRaw(saved)
  }, [])

  const setActiveTab = (tab: string) => {
    setActiveTabRaw(tab)
    sessionStorage.setItem("user-management-tab", tab)
  }
  const [addressOpen, setAddressOpen] = useState(false)
  
  // Notes state
  const [notes, setNotes] = useState<any[]>([])
  const [newNote, setNewNote] = useState('')
  const [noteDate, setNoteDate] = useState('')
  const [noteFields, setNoteFields] = useState([{ key: 'Height', value: '' }, { key: 'Weight', value: '' }, { key: 'Age', value: '' }, { key: 'Symptoms', value: '' }])
  const [savingNote, setSavingNote] = useState(false)

  // Appointments state
  const [doctors, setDoctors] = useState<any[]>([])
  const [bookingAppt, setBookingAppt] = useState(false)
  const [apptForm, setApptForm] = useState({ doctorId: '', date: '', time: '', notes: '' })
  const [shareNotes, setShareNotes] = useState(false)
  const [shareDocs, setShareDocs] = useState(false)

  // Payment state
  const [discount, setDiscount] = useState(0)
  const [generatingPayment, setGeneratingPayment] = useState(false)
  const [paymentLink, setPaymentLink] = useState('')
  const [proformaData, setProformaData] = useState<any>(null)
  const [invoices, setInvoices] = useState<any[]>([])
  const [currentUserRole, setCurrentUserRole] = useState<string>('USER')
  const [aiCallLogs, setAiCallLogs] = useState<any[]>([])
  const [initiatingCall, setInitiatingCall] = useState(false)

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
    if (open && lead) {
      setSourceId(lead.user_source_id || null)
      setPlanId(lead.interested_plan_id || null)
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
      getProformaInvoices(lead.id).then(setInvoices).catch(console.error)
      getPlans().then(data => setPlans(data || []))
      getSources().then(data => setSources(data || []))
      getCurrentUserRole().then(setCurrentUserRole).catch(console.error)
      getAICallLogs(lead.id).then(setAiCallLogs).catch(console.error)
      
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
      toast.success("Updated successfully!")
      setOpen(false)
    } catch (err: any) {
      toast.error("Error: " + err.message)
    } finally {
      setLoading(false)
    }
  }
  
  async function handleRefreshPayment(invoiceId: string) {
    if (!confirm("Are you sure you want to refresh the payment link for this invoice? The old link will no longer be tracked here.")) return;
    try {
      const res = await generateRazorpayLink(lead.id, "", 0, invoiceId)
      if (res.success) {
        setInvoices(prev => prev.map(inv => inv.id === invoiceId ? { ...inv, razorpay_url: res.payment_url, payment_url: res.payment_url } : inv))
        toast.success("Payment link refreshed successfully!")
      } else {
        toast.error(res.error || "Failed to refresh link")
      }
    } catch (err: any) {
      toast.error("Error: " + err.message)
    }
  }

  const handleTriggerAICall = async () => {
    setInitiatingCall(true)
    try {
      await triggerAICall(lead.id)
      toast.success("AI is now calling the user via Exotel!")
      getAICallLogs(lead.id).then(setAiCallLogs).catch(console.error)
    } catch (err: any) {
      toast.error("Error: " + err.message)
    } finally {
      setInitiatingCall(false)
    }
  }

  const handleNoteFieldChange = (index: number, field: 'key' | 'value', val: string) => {
    const updated = [...noteFields]
    updated[index][field] = val
    setNoteFields(updated)
  }

  const handleAddNote = async () => {
    const validFields = noteFields.filter(f => f.key.trim() && f.value.trim())
    let formattedContent = newNote.trim()
    
    if (validFields.length > 0) {
      const fieldsText = validFields.map(f => `• ${f.key}: ${f.value}`).join('\n')
      formattedContent = `${fieldsText}\n\n${formattedContent}`.trim()
    }
    
    if (!formattedContent) return
    
    setSavingNote(true)
    try {
      const formattedDate = noteDate ? new Date(noteDate).toISOString() : undefined;
      await addInteractionNote(lead.id, formattedContent, formattedDate)
      setNewNote('')
      setNoteDate('')
      setNoteFields([{ key: 'Height', value: '' }, { key: 'Weight', value: '' }, { key: 'Age', value: '' }, { key: 'Symptoms', value: '' }])
      const updatedNotes = await getUserNotes(lead.id)
      setNotes(updatedNotes)
    } catch (err: any) {
      toast.error("Failed to save note: " + err.message)
    } finally {
      setSavingNote(false)
    }
  }

  const handleGeneratePayment = async () => {
    if (!planId) {
      toast.error("Please select an Interested Plan first.")
      return
    }
    
    setGeneratingPayment(true)
    try {
      const res = await generateRazorpayLink(lead.id, planId, discount)
      if (res.success) {
        setPaymentLink(res.payment_url)
        setProformaData(res)
        setInvoices(prev => [res, ...prev])
        toast.success("Payment link generated successfully!")
      } else {
        toast.error(res.error || "Failed to generate link")
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to generate link")
    } finally {
      setGeneratingPayment(false)
    }
  }

  const handleBookAppointment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!apptForm.doctorId || !apptForm.date || !apptForm.time) {
      toast.error("Please select doctor, date and time")
      return
    }
    setBookingAppt(true)
    try {
      let finalNotes = apptForm.notes
      
      if (shareNotes && notes.length > 0) {
        const notesHistory = notes.map(n => {
           const d = new Date(n.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
           return `[${d}]\n${n.content}`
        }).join('\n\n---\n\n')
        finalNotes += `\n\n=== PAST INTERACTION NOTES ===\n\n${notesHistory}`
      }
      
      if (shareDocs && documents.length > 0) {
        const docsList = documents.map(d => `- ${d.file_name}: ${d.storage_path || d.file_url}`).join('\n')
        finalNotes += `\n\n=== ATTACHED DOCUMENTS ===\n\n${docsList}`
      }
      
      const formData = new FormData()
      formData.append('lead_id', lead.id)
      formData.append('doctor_id', apptForm.doctorId)
      formData.append('date', apptForm.date)
      formData.append('time', apptForm.time)
      formData.append('notes', finalNotes)
      
      await bookAppointment(formData)
      toast.success("Appointment requested successfully!")
      setApptForm({ doctorId: '', date: '', time: '', notes: '' })
      setActiveTab('overview')
    } catch (err: any) {
      toast.error("Failed to book appointment: " + err.message)
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
      toast.error("Upload failed: " + err.message)
    } finally {
      setUploading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={children as React.ReactElement} />
      <DialogContent className="sm:max-w-[600px] w-[95vw] bg-card p-0 flex flex-col rounded-2xl shadow-2xl border-border/50 max-h-[90vh] overflow-hidden">
        
        <DialogHeader className="px-8 pt-10 pb-8 bg-card border-b relative overflow-hidden shrink-0">
          <div className="absolute top-[-50%] right-[-10%] w-64 h-64 bg-gradient-to-br from-[var(--color-brand-green)] to-[var(--color-brand-ocean)] rounded-full blur-[80px] opacity-20 pointer-events-none"></div>
          <div className="flex items-center justify-between mb-4 relative z-10">
            <span className="px-3 py-1 text-[11px] font-bold uppercase tracking-widest bg-gradient-to-r from-[var(--color-brand-teal)] to-[var(--color-brand-ocean)] text-white rounded-full shadow-sm">
              {lead.status.replace('_', ' ')}
            </span>
            <span className="text-xs text-gray-400 font-mono">ID: {lead.id.substring(0, 8)}</span>
          </div>
          <DialogTitle className="text-4xl font-extrabold text-foreground tracking-tight relative z-10">{lead.name || 'Unnamed User'}</DialogTitle>
          <div className="flex items-center gap-4 text-sm text-gray-500 mt-2">
            <span>{lead.phone}</span>
            {lead.email && (
              <>
                <span className="w-1 h-1 rounded-full bg-gray-300"></span>
                <span>{lead.email}</span>
              </>
            )}
          </div>
        </DialogHeader>

        <div className="flex border-b px-8 bg-muted/30 pt-2 gap-2">
          {[
            { id: "overview", label: "Overview", icon: User },
            { id: "pipeline", label: "Pipeline", icon: Activity },
            { id: "payment", label: "Payment", icon: CreditCard },
            { id: "appointments", label: "Appointments", icon: Calendar },
            { id: "files", label: "Files & Notes", icon: FileText },
            { id: "call_logs", label: "AI Calls", icon: Phone }
          ].map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-5 py-2.5 text-sm font-semibold rounded-t-xl transition-all duration-300 flex items-center gap-2 ${
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

                {(customFields.length > 0 || Object.keys(metaData || {}).filter(k => !customFields.find(f => f.name === k)).length > 0) && (
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

                      {/* Render unmapped metadata properties pushed from webhook */}
                      {Object.keys(metaData || {})
                        .filter(key => !customFields.find(f => f.name === key))
                        .map((key) => (
                        <div key={key} className="space-y-1.5">
                          <Label className="text-xs text-gray-500 font-medium capitalize">{key.replace(/_/g, ' ')}</Label>
                          <Input 
                            value={String(metaData[key] || '')}
                            readOnly
                            className="bg-gray-100 text-gray-500 border-gray-200 shadow-none"
                          />
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
                        {statusOptions ? statusOptions.map(opt => (
                          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                        )) : (
                          <>
                            <SelectItem value="NEW">New (Raw)</SelectItem>
                            <SelectItem value="UNREAD">Unread</SelectItem>

                            <SelectItem value="CONTACT_ATTEMPTED">Contact Attempted</SelectItem>
                            <SelectItem value="CONTACTED">Contacted</SelectItem>
                            <SelectItem value="QUALIFIED">Qualified</SelectItem>
                            <SelectItem value="CONSULTATION_SCHEDULED">Consultation Scheduled</SelectItem>
                            <SelectItem value="CONSULTATION_COMPLETED">Consultation Completed</SelectItem>
                            <SelectItem value="CONVERTED">Converted</SelectItem>
                            <SelectItem value="ON_HOLD">On Hold</SelectItem>
                            <SelectItem value="LOST">Lost</SelectItem>
                          </>
                        )}
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
                      <Select name="source_id" value={sourceId} onValueChange={(val) => setSourceId(val || null)}>
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
                      <Select name="interested_plan_id" value={planId} onValueChange={(val) => setPlanId(val || null)}>
                        <SelectTrigger className="bg-muted/50 rounded-xl border-border/50 transition-all hover:bg-muted focus:bg-card shadow-inner shadow-none overflow-hidden">
                          <span className="truncate">
                            {(() => {
                              if (!planId) return 'Select Plan'
                              const plan = plans.find(p => p.id === planId)
                              if (plan) return plan.name
                              
                              for (const p of plans) {
                                if (p.plan_variants) {
                                  const variant = p.plan_variants.find((v: any) => `${p.id}|${v.id}` === planId)
                                  if (variant) return `${p.name} - ${variant.duration_label}`
                                }
                              }
                              
                              return lead.plans?.name || 'Unknown Plan'
                            })()}
                          </span>
                        </SelectTrigger>
                        <SelectContent>
                          {planId && !plans.some(p => p.id === planId) && !plans.some(p => p.plan_variants?.some((v: any) => `${p.id}|${v.id}` === planId)) && (
                            <SelectItem value={planId}>
                              {lead.plans?.name || 'Unknown Plan'}
                            </SelectItem>
                          )}
                          {plans.map(p => {
                            if (!p.is_active && p.id !== planId && !p.plan_variants?.some((v: any) => `${p.id}|${v.id}` === planId)) return null;
                            
                            if (p.plan_variants && p.plan_variants.length > 0) {
                              return (
                                <SelectGroup key={p.id}>
                                  <SelectLabel className="font-bold text-primary">{p.name}</SelectLabel>
                                  {p.plan_variants.map((v: any) => (
                                    <SelectItem key={v.id} value={`${p.id}|${v.id}`} className="pl-6">
                                      {v.duration_label} (₹{v.discounted_price || v.base_price})
                                    </SelectItem>
                                  ))}
                                </SelectGroup>
                              )
                            }
                            
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

            {/* PAYMENT & INVOICE TAB */}
            {activeTab === "payment" && (
              <div className="space-y-6">
                <div className="flex flex-col mb-6 pb-6 border-b border-gray-100">
                  <h3 className="text-lg font-bold text-gray-900 mb-1">Generate Proforma Invoice</h3>
                  <p className="text-xs text-gray-500">Create a Razorpay payment link based on the selected plan.</p>
                </div>
                
                <div className="space-y-4 bg-muted/30 p-4 rounded-xl border border-gray-100">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-gray-500 font-medium uppercase tracking-wider">Select Plan for Invoice</Label>
                    {plans.length === 0 ? (
                      <div className="h-9 w-full animate-pulse bg-gray-100 rounded-md"></div>
                    ) : (
                      <Select name="payment_plan_id" value={planId} onValueChange={(val) => setPlanId(val || null)}>
                        <SelectTrigger className="bg-white rounded-xl border-border/50 transition-all shadow-none overflow-hidden">
                          <span className="truncate">
                            {(() => {
                              if (!planId) return 'Select Plan'
                              const plan = plans.find(p => p.id === planId)
                              if (plan) return plan.name
                              
                              for (const p of plans) {
                                if (p.plan_variants) {
                                  const variant = p.plan_variants.find((v: any) => `${p.id}|${v.id}` === planId)
                                  if (variant) return `${p.name} - ${variant.duration_label}`
                                }
                              }
                              
                              return lead.plans?.name || 'Unknown Plan'
                            })()}
                          </span>
                        </SelectTrigger>
                        <SelectContent>
                          {planId && !plans.some(p => p.id === planId) && !plans.some(p => p.plan_variants?.some((v: any) => `${p.id}|${v.id}` === planId)) && (
                            <SelectItem value={planId}>
                              {lead.plans?.name || 'Unknown Plan'}
                            </SelectItem>
                          )}
                          {plans.map(p => {
                            if (!p.is_active && p.id !== planId && !p.plan_variants?.some((v: any) => `${p.id}|${v.id}` === planId)) return null;
                            
                            if (p.plan_variants && p.plan_variants.length > 0) {
                              return (
                                <SelectGroup key={p.id}>
                                  <SelectLabel className="font-bold text-primary">{p.name}</SelectLabel>
                                  {p.plan_variants.map((v: any) => (
                                    <SelectItem key={v.id} value={`${p.id}|${v.id}`} className="pl-6">
                                      {v.duration_label} (₹{v.discounted_price || v.base_price})
                                    </SelectItem>
                                  ))}
                                </SelectGroup>
                              )
                            }
                            
                            return <SelectItem key={p.id} value={p.id}>{p.name} (₹{p.price}) {!p.is_active && '(Inactive)'}</SelectItem>
                          })}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                  
                  {planId && (
                    <>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-gray-500 font-medium uppercase tracking-wider">Discount (%)</Label>
                        <Input 
                          type="number" 
                          min="0" 
                          max="100" 
                          value={discount} 
                          onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)}
                          className="bg-white rounded-xl border-border/50 transition-all shadow-none w-1/3"
                        />
                      </div>
                      
                      {(() => {
                        let basePrice = 0;
                        let gstPercentage = 0;
                        const plan = plans.find(p => p.id === planId);
                        if (plan) {
                          basePrice = plan.price || 0;
                          gstPercentage = plan.gst_percentage || 0;
                        } else {
                          for (const p of plans) {
                            if (p.plan_variants) {
                              const variant = p.plan_variants.find((v: any) => `${p.id}|${v.id}` === planId);
                              if (variant) {
                                basePrice = variant.discounted_price || variant.base_price || 0;
                                gstPercentage = p.gst_percentage || 0;
                                break;
                              }
                            }
                          }
                        }
                        
                        const discountedPrice = basePrice * (1 - discount/100);
                        const gstAmount = discountedPrice * (gstPercentage/100);
                        const finalTotal = discountedPrice + gstAmount;
                        
                        return (
                          <div className="bg-indigo-50/50 p-4 rounded-lg border border-indigo-100/50 mt-4">
                            <div className="flex justify-between items-center text-sm mb-2">
                              <span className="text-gray-600">Base Price:</span>
                              <span className="font-semibold">₹{basePrice.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                            </div>
                            <div className="flex justify-between items-center text-sm mb-2">
                              <span className="text-gray-600">Discount:</span>
                              <span className="font-semibold text-green-600">-{discount}% (₹{(basePrice - discountedPrice).toLocaleString('en-IN', { minimumFractionDigits: 2 })})</span>
                            </div>
                            {gstPercentage > 0 && (
                              <div className="flex justify-between items-center text-sm mb-3">
                                <span className="text-gray-600">Add: GST ({gstPercentage}%):</span>
                                <span className="font-semibold text-gray-800">₹{gstAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                              </div>
                            )}
                            <div className="flex justify-between items-center text-base pt-3 border-t border-indigo-100 font-bold">
                              <span className="text-gray-900">Total Payable:</span>
                              <span className="text-indigo-600">
                                ₹{finalTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                              </span>
                            </div>
                          </div>
                        );
                      })()}
                      
                      <div className="pt-4 flex gap-3">
                        <Button 
                          onClick={handleGeneratePayment}
                          disabled={generatingPayment}
                          className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-none"
                        >
                          {generatingPayment ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Receipt className="w-4 h-4 mr-2" />}
                          Generate Payment Link
                        </Button>
                      </div>
                    </>
                  )}
                </div>
                
                {paymentLink && proformaData && (
                  <div className="mt-6 p-5 bg-green-50 border border-green-200 rounded-xl space-y-4">
                    <div className="flex items-center gap-2 text-green-800 font-bold">
                      <CheckCircle2 className="w-5 h-5" />
                      Proforma Invoice & Link Ready!
                    </div>
                    
                    <div className="space-y-2">
                      <Label className="text-xs text-green-700 uppercase font-bold">Razorpay Link</Label>
                      <div className="flex gap-2">
                        <Input readOnly value={paymentLink} className="bg-white border-green-200 text-sm shadow-none" />
                        <Button 
                          variant="outline" 
                          onClick={() => {
                            navigator.clipboard.writeText(paymentLink)
                            toast.success("Link copied!")
                          }}
                          className="border-green-200 text-green-700 hover:bg-green-100"
                        >
                          Copy
                        </Button>
                      </div>
                    </div>
                    
                    <div className="pt-2">
                      <Button 
                        variant="ghost" 
                        onClick={() => {
                          window.open(`/proforma-invoice/${proformaData.invoice_id}`, '_blank')
                        }}
                        className="text-green-700 hover:bg-green-100 bg-white border border-green-200 w-full"
                      >
                        <FileText className="w-4 h-4 mr-2" />
                        Print / View Proforma PDF
                      </Button>
                    </div>
                  </div>
                )}
                
                {invoices.length > 0 && (
                  <div className="pt-6 border-t border-gray-100">
                    <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">Past Proforma Invoices</h4>
                    <div className="space-y-3">
                      {invoices.map((inv, idx) => (
                        <div key={inv.invoice_id || inv.id || idx} className="p-4 border border-gray-200 rounded-xl bg-white hover:bg-gray-50 transition-colors flex flex-col gap-3">
                          <div className="flex justify-between items-start">
                            <div>
                              <p className="text-sm font-semibold text-gray-900">{inv.plan_name || (inv.plans && inv.plans.name) || 'Plan Subscription'}</p>
                              <p className="text-xs text-gray-500 mt-0.5">Amount: ₹{inv.amount || inv.total_amount}</p>
                              <p className="text-[10px] text-gray-400 mt-1">PI: {inv.invoice_number || 'N/A'}</p>
                            </div>
                            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 bg-green-100 text-green-700 rounded border border-green-200">
                              Ready
                            </span>
                          </div>
                          <div className="flex gap-2 flex-wrap">
                            <Button 
                              variant="outline" 
                              size="sm" 
                              className="text-xs h-8 flex-1"
                              onClick={() => {
                                navigator.clipboard.writeText(inv.payment_url || inv.razorpay_url)
                                toast.success("Link copied!")
                              }}
                            >
                              Copy Link
                            </Button>
                            <Button 
                              variant="outline" 
                              size="sm" 
                              className="text-xs h-8 flex-1 text-amber-700 border-amber-200 bg-amber-50 hover:bg-amber-100"
                              onClick={() => handleRefreshPayment(inv.id || inv.invoice_id)}
                            >
                              Refresh Link
                            </Button>
                            <Button 
                              variant="outline" 
                              size="sm" 
                              className="text-xs h-8 flex-1 text-indigo-700 border-indigo-200 bg-indigo-50 hover:bg-indigo-100"
                              onClick={() => {
                                window.open(`/proforma-invoice/${inv.id || inv.invoice_id}`, '_blank')
                              }}
                            >
                              <FileDown className="w-3.5 h-3.5 mr-1.5" />
                              View PDF
                            </Button>
                            {currentUserRole === 'SUPER_ADMIN' && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-xs h-8 px-2 text-red-700 border-red-200 bg-red-50 hover:bg-red-100"
                                title="Super Admin Only: Delete PI"
                                onClick={async () => {
                                  if (confirm("Are you sure you want to delete this Proforma Invoice? Only Super Admins can perform this action.")) {
                                    try {
                                      await deleteProformaInvoice(inv.id || inv.invoice_id);
                                      setInvoices(invoices.filter(i => (i.id || i.invoice_id) !== (inv.id || inv.invoice_id)));
                                      toast.success("Invoice deleted.");
                                    } catch (err: any) {
                                      toast.error(err.message || "Failed to delete invoice (Only Super Admins are allowed)");
                                    }
                                  }
                                }}
                              >
                                Delete
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
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

                  <div className="flex flex-col gap-2 pt-2 pb-2">
                    <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                      <input type="checkbox" className="rounded border-gray-300 text-primary focus:ring-primary h-4 w-4" checked={shareNotes} onChange={(e) => setShareNotes(e.target.checked)} />
                      Share all previous interaction notes with doctor
                    </label>
                    <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                      <input type="checkbox" className="rounded border-gray-300 text-primary focus:ring-primary h-4 w-4" checked={shareDocs} onChange={(e) => setShareDocs(e.target.checked)} />
                      Share all user documents with doctor
                    </label>
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
                  <div className="space-y-3 bg-muted/30 p-4 rounded-xl border border-gray-100">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-semibold text-gray-700 uppercase">New Interaction Note</Label>
                      <Input 
                        type="datetime-local" 
                        value={noteDate}
                        onChange={(e) => setNoteDate(e.target.value)}
                        className="w-44 h-8 text-xs bg-white rounded-lg border-border/50 transition-all hover:bg-gray-50 focus:bg-white shadow-none"
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">Structured Fields</Label>
                      <div className="grid grid-cols-2 gap-2">
                        {noteFields.map((field, idx) => (
                          <div key={idx} className="flex gap-1.5">
                            <Input 
                              value={field.key} 
                              onChange={(e) => handleNoteFieldChange(idx, 'key', e.target.value)}
                              placeholder="Key"
                              className="h-8 text-xs bg-white border-border/50 shadow-none w-1/3 font-medium"
                            />
                            <Input 
                              value={field.value} 
                              onChange={(e) => handleNoteFieldChange(idx, 'value', e.target.value)}
                              placeholder="Value"
                              className="h-8 text-xs bg-white border-border/50 shadow-none flex-1"
                            />
                          </div>
                        ))}
                      </div>
                      <button type="button" onClick={() => setNoteFields([...noteFields, { key: '', value: '' }])} className="text-xs text-primary font-medium hover:underline mt-1">+ Add Custom Field</button>
                    </div>

                    <div className="space-y-2 pt-2">
                      <Label className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">Detailed Notes</Label>
                      <Textarea 
                        value={newNote}
                        onChange={(e) => setNewNote(e.target.value)}
                        placeholder="Add additional details, observations, or context..." 
                        className="h-24 resize-none bg-white rounded-xl border-border/50 transition-all hover:bg-gray-50 focus:bg-white shadow-none border-gray-200"
                      />
                    </div>
                    <div className="flex justify-end pt-1">
                      <Button 
                        type="button" 
                        size="sm" 
                        onClick={handleAddNote}
                        disabled={savingNote || (!newNote.trim() && !noteFields.some(f => f.key.trim() && f.value.trim()))}
                        className="bg-primary hover:bg-primary/90 text-white shadow-sm rounded-full px-5"
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

            {activeTab === "call_logs" && (
              <div className="space-y-6">
                <div className="flex items-center justify-between pb-4 border-b">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">AI Call Logs</h3>
                    <p className="text-sm text-gray-500">History of automated AI voice interactions with this lead.</p>
                  </div>
                  {['admin', 'superadmin', 'master_admin', 'SUPER_ADMIN'].includes(currentUserRole.toLowerCase()) && (
                    <Button 
                      onClick={handleTriggerAICall} 
                      disabled={initiatingCall}
                      variant="outline"
                      className="border-primary text-primary hover:bg-primary/5"
                    >
                      {initiatingCall ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Bot className="w-4 h-4 mr-2" />}
                      Call via AI Now
                    </Button>
                  )}
                </div>

                <div className="space-y-4">
                  {aiCallLogs.length === 0 ? (
                    <div className="text-center py-10 bg-gray-50 rounded-xl border border-dashed">
                      <Phone className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                      <p className="text-sm text-gray-500">No AI calls have been made to this lead yet.</p>
                    </div>
                  ) : (
                    aiCallLogs.map((log) => (
                      <div key={log.id} className="bg-white border rounded-xl p-5 space-y-4 shadow-sm">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className={`p-1.5 rounded-full ${log.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                              <Phone className="w-4 h-4" />
                            </div>
                            <span className="font-medium text-sm capitalize">{log.status}</span>
                            <span className="text-xs text-gray-500">• {new Date(log.created_at).toLocaleString()}</span>
                          </div>
                          <div className="text-xs font-mono bg-gray-100 px-2 py-1 rounded text-gray-600">
                            {log.duration ? `${Math.floor(log.duration / 60)}m ${log.duration % 60}s` : 'Unknown duration'}
                          </div>
                        </div>

                        {log.recording_url && (
                          <div className="bg-gray-50 p-3 rounded-lg border">
                            <audio controls className="w-full h-8" src={log.recording_url}>
                              Your browser does not support the audio element.
                            </audio>
                          </div>
                        )}

                        {log.summary && (
                          <div className="bg-indigo-50/50 p-4 rounded-lg border border-indigo-100">
                            <h4 className="text-xs font-bold text-indigo-900 uppercase tracking-wider mb-2 flex items-center">
                              <Bot className="w-3.5 h-3.5 mr-1" />
                              AI Summary
                            </h4>
                            <p className="text-sm text-indigo-900 leading-relaxed">{log.summary}</p>
                          </div>
                        )}

                        {log.transcript && (
                          <details className="text-sm border-t pt-3 group">
                            <summary className="cursor-pointer text-gray-600 font-medium hover:text-gray-900 flex items-center">
                              <ChevronRight className="w-4 h-4 mr-1 transition-transform group-open:rotate-90" />
                              View Raw Transcript
                            </summary>
                            <div className="mt-3 p-4 bg-gray-50 rounded-lg text-gray-700 whitespace-pre-wrap max-h-64 overflow-y-auto font-mono text-xs border">
                              {log.transcript}
                            </div>
                          </details>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Action Footer */}
          <div className="px-8 py-5 bg-card border-t border-border/50 flex items-center justify-between mt-auto shrink-0 z-10 relative">
            <button 
              type="button" 
              onClick={() => setActiveTab('payment')}
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
      </DialogContent>
    </Dialog>
  )
}
