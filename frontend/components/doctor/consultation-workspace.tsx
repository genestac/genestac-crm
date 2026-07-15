'use client'

import { useState, useEffect } from 'react'
import {
  X, Calendar, RefreshCw, Clock, FileText, User, 
  MapPin, Link as LinkIcon, Download,
  Activity, Tag, CheckCircle, Plus, Receipt, ChevronLeft, Phone, Loader2
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { 
  updateAppointmentDetails, 
  generatePaymentLink, 
  fetchPatientTimeline,
  addTimelineEntry,
  getPlans,
  getInventory,
  uploadPatientReport,
  triggerAppointmentCall,
  getAppointmentById,
  retranscribeCall
} from '@/app/doctor/actions'
import { PrescriptionForm } from './prescription-form'
import { PrescriptionHistory } from './prescription-history'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'

export function ConsultationWorkspace({ appointment, onClose, onStatusChange }: any) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const tabQuery = searchParams.get('tab')
  const activeTab = tabQuery || 'details'
  
  const setActiveTab = (tab: string) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('tab', tab)
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }
  const [loading, setLoading] = useState(false)
  const [timeline, setTimeline] = useState<{assessments: any[], communications: any[]}>({ assessments: [], communications: [] })
  
  const [newNote, setNewNote] = useState("")
  const [savingNote, setSavingNote] = useState(false)
  const [onCall, setOnCall] = useState(false)
  
  const [plans, setPlans] = useState<any[]>([])
  const [inventory, setInventory] = useState<any[]>([])
  const [selectedPlan, setSelectedPlan] = useState('')
  const [selectedProduct, setSelectedProduct] = useState('')
  const [discount, setDiscount] = useState(0)

  useEffect(() => {
    if (appointment?.patient_id && appointment.patient_id !== 'null') {
      fetchPatientTimeline(appointment.patient_id).then(setTimeline)
    }
    getPlans().then(setPlans)
    getInventory().then(setInventory)
  }, [appointment])


  const [retranscribing, setRetranscribing] = useState<string | null>(null)

  const handleRetranscribe = async (url: string) => {
    if (!appointment?.id) return;
    setRetranscribing(url);
    try {
      await retranscribeCall(appointment.id, url);
      toast.success("Re-transcription started in the background. It will automatically appear when finished.");
      // We can rely on the same polling mechanism if we turn on onCall, or just wait manually.
      // We'll set onCall to true so the polling picks it up!
      setOnCall(true);
    } catch (err: any) {
      toast.error(err.message || "Failed to start re-transcription");
      setRetranscribing(null);
    }
  }

  // Poll for AI summary when on a call

  useEffect(() => {
    if (!onCall || !appointment?.id) return;
    
    const interval = setInterval(async () => {
      try {
        if (appointment?.patient_id && appointment.patient_id !== 'null') {
          const freshTimeline = await fetchPatientTimeline(appointment.patient_id);
          setTimeline(prev => {
            // If the server has more communications, a new AI summary arrived!
            if (freshTimeline.communications.length > prev.communications.length) {
              setOnCall(false);
              toast.success("Call ended. AI Call Summary generated and added to timeline!");
              router.refresh();
              return freshTimeline;
            }
            return prev;
          });
        } else {
          // Fallback for unlinked appointments (AI Voice Booking)
          const freshAppt = await getAppointmentById(appointment.id);
          const currentLength = (appointment.notes || '').length;
          const freshLength = (freshAppt.notes || '').length;
          
          if (freshAppt.notes !== appointment.notes) {
            setOnCall(false);
            toast.success("Call ended. AI Call Summary generated and added to timeline!");
            router.refresh();
          }
        }
      } catch (err) {}
    }, 5000);
    
    return () => clearInterval(interval);
  }, [onCall, appointment?.patient_id, appointment?.id, appointment?.notes, router]);

  // Form states for details
  const [details, setDetails] = useState({
    title: appointment.title || '',
    type: appointment.type || 'Meeting',
    duration: appointment.duration_minutes || 30,
    date: appointment.scheduled_at ? new Date(appointment.scheduled_at).toISOString().split('T')[0] : '',
    time: appointment.scheduled_at ? new Date(appointment.scheduled_at).toTimeString().substring(0,5) : '',
    related_to: appointment.related_to || 'none',
    location: appointment.location || '',
    link: appointment.meeting_link || '',
    description: (appointment.notes || '').split(/\n\n\[/)[0].replace(/\\n/g, '\n')
  })

  const handleSaveDetails = async () => {
    setLoading(true)
    try {
      const scheduledAt = new Date(`${details.date}T${details.time}:00`).toISOString()
      await updateAppointmentDetails(appointment.id, {
        ...details,
        scheduled_at: scheduledAt
      })
      toast.success("Details saved successfully")
    } catch (e: any) {
      let msg = e.message
      try { const parsed = JSON.parse(msg); if (parsed.detail) msg = parsed.detail } catch {}
      toast.error("Error: " + msg)
    } finally {
      setLoading(false)
    }
  }

  const handleGeneratePaymentLink = async () => {
    setLoading(true)
    try {
      const plan = plans.find(p => p.id === selectedPlan)
      const product = inventory.find(p => p.id === selectedProduct)
      
      const total = (plan?.price || 0) + (product?.price || 0)
      const discounted = total - (total * (discount / 100))
      
      const res = await generatePaymentLink(appointment.id, {
        plan_id: selectedPlan,
        products: product ? [product] : [],
        discount,
        total: discounted
      })
      
      toast.success(`Payment link generated: ${res.payment_link}`)
    } catch (e: any) {
      let msg = e.message
      try { const parsed = JSON.parse(msg); if (parsed.detail) msg = parsed.detail } catch {}
      toast.error("Error: " + msg)
    } finally {
      setLoading(false)
    }
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    
    setLoading(true)
    try {
      // In a real app, you would upload the file to Supabase Storage here and get a public URL.
      // For this mockup, we generate a dummy URL.
      const dummyUrl = `https://storage.genestac.com/reports/${file.name.replace(/\s+/g, '_')}`
      
      await uploadPatientReport(appointment.patient_id, appointment.id, {
        title: file.name,
        type: file.type || 'document',
        url: dummyUrl
      })
      toast.success("File uploaded successfully!")
    } catch (err: any) {
      let msg = err.message
      try { const parsed = JSON.parse(msg); if (parsed.detail) msg = parsed.detail } catch {}
      toast.error("Upload failed: " + msg)
    } finally {
      setLoading(false)
    }
  }

  const handleAddNote = async () => {
    if (!newNote.trim()) return
    setSavingNote(true)
    
    // In sales CRM it handles fields too, here we just do basic text for now
    let finalContent = newNote.trim()

    try {
      await addTimelineEntry(appointment.patient_id, 'clinical', finalContent, appointment.id)
      toast.success("Note added successfully")
      setNewNote("")
      if (appointment.patient_id && appointment.patient_id !== 'null') {
        const freshTimeline = await fetchPatientTimeline(appointment.patient_id)
        setTimeline(freshTimeline)
      } else {
        // Optimistically update the UI by pushing a synthetic assessment
        setTimeline(prev => ({
          ...prev,
          assessments: [{
            created_at: new Date().toISOString(),
            doctor_timeline_notes: finalContent,
            staffs: { full_name: 'You', roles: { name: 'Doctor' } }
          }, ...prev.assessments]
        }))
      }
    } catch (err: any) {
      let msg = err.message
      try { const parsed = JSON.parse(msg); if (parsed.detail) msg = parsed.detail } catch {}
      toast.error("Failed to add note: " + msg)
    } finally {
      setSavingNote(false)
    }
  }

  const handleCallPatient = async () => {
    if (onCall) {
      setOnCall(false)
      return
    }
    
    setOnCall(true)

    try {
      await triggerAppointmentCall(appointment.id)
      toast.success("Call initiated successfully! Your phone will ring shortly.")
      // The On Call badge will stay active until the AI call summary arrives.
    } catch (err: any) {
      setTimeout(() => setOnCall(false), 3000)
      let msg = err.message
      try {
        const parsed = JSON.parse(msg)
        if (parsed.detail) msg = parsed.detail
      } catch(e) {}
      toast.error("Exotel: " + msg)
    }
  }

  return (
    <div className="w-full bg-gray-50 h-full flex flex-col">
      
      {/* Header */}
      <div className="bg-white px-6 py-4 border-b flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.push('/doctor/appointments')} className="text-gray-500 hover:text-gray-900">
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <div>
            <h2 className="text-xl font-bold text-gray-900">
              {appointment.patients?.name || appointment.patients?.full_name || 'Consultation Workspace'}
            </h2>
            <p className="text-sm text-gray-500 flex items-center gap-2">
              <Calendar className="w-4 h-4" /> 
              {new Date(appointment.scheduled_at).toLocaleString()}
              <span className={`ml-2 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                appointment.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
              }`}>
                {appointment.status}
              </span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
            {onCall && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-red-50 text-red-600 rounded-full border border-red-100 animate-pulse">
                <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                <span className="text-xs font-bold uppercase tracking-wide">On Call</span>
              </div>
            )}
            <Button 
              onClick={handleCallPatient} 
              className={onCall ? "bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 shadow-sm" : "bg-teal-600 hover:bg-teal-700 text-white"}
            >
              <Phone className="w-4 h-4 mr-2" /> {onCall ? "Dismiss Call State" : "Call Patient"}
            </Button>
            {appointment.status !== 'completed' && (
              <Button onClick={() => onStatusChange(appointment.id, 'completed')} variant="outline" className="border-teal-600 text-teal-600 hover:bg-teal-50">
                <CheckCircle className="w-4 h-4 mr-2" /> Mark Completed
              </Button>
            )}
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="bg-white px-6 border-b flex items-center gap-6 shrink-0 overflow-x-auto whitespace-nowrap scrollbar-hide">
          {[
            { id: 'details', label: 'Details' },
            { id: 'timeline', label: 'Timeline' },
            { id: 'treatment', label: 'Treatment' },
            { id: 'prescription', label: 'Write Prescription' },
            { id: 'history', label: 'Rx History' },
            { id: 'reports', label: 'Reports' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id ? 'border-teal-600 text-teal-700' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6">
          
          {/* DETAILS TAB */}
          {activeTab === 'details' && (
            <div className="bg-white rounded-xl border p-6 space-y-6">
              <h3 className="text-lg font-bold text-gray-900 mb-4">Appointment Details</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Appointment Title *</Label>
                  <Input value={details.title} onChange={e => setDetails({...details, title: e.target.value})} placeholder="e.g., Client Meeting, Product Demo" />
                </div>
                <div className="space-y-2">
                  <Label>Type *</Label>
                  <Select value={details.type} onValueChange={v => setDetails({...details, type: v})}>
                    <SelectTrigger><SelectValue placeholder="Type" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Meeting">Meeting</SelectItem>
                      <SelectItem value="Consultation">Consultation</SelectItem>
                      <SelectItem value="Follow-up">Follow-up</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Date *</Label>
                  <Input type="date" value={details.date} onChange={e => setDetails({...details, date: e.target.value})} />
                </div>
                <div className="space-y-2">
                  <Label>Time * & Duration</Label>
                  <div className="flex gap-2">
                    <Input type="time" value={details.time} onChange={e => setDetails({...details, time: e.target.value})} className="flex-1" />
                    <Input type="number" value={details.duration} onChange={e => setDetails({...details, duration: parseInt(e.target.value)})} placeholder="Mins" className="w-24" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Related To (Optional)</Label>
                  <Select value={details.related_to} onValueChange={v => setDetails({...details, related_to: v})}>
                    <SelectTrigger><SelectValue placeholder="Related To" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      <SelectItem value="lead">Lead</SelectItem>
                      <SelectItem value="client">Client</SelectItem>
                      <SelectItem value="external">External</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Location</Label>
                  <Input value={details.location} onChange={e => setDetails({...details, location: e.target.value})} placeholder="Office, Virtual, etc." />
                </div>
                <div className="space-y-2 col-span-2">
                  <Label>Link</Label>
                  <Input value={details.link} onChange={e => setDetails({...details, link: e.target.value})} placeholder="Zoom, GMeet, etc." />
                </div>
                <div className="space-y-2 col-span-2">
                  <Label>Description</Label>
                  <Textarea value={details.description} onChange={e => setDetails({...details, description: e.target.value})} rows={3} />
                </div>
              </div>
              <div className="flex justify-end pt-4 border-t">
                <Button onClick={handleSaveDetails} disabled={loading} className="bg-teal-600 hover:bg-teal-700">
                  {loading ? 'Saving...' : 'Save Details'}
                </Button>
              </div>
            </div>
          )}

          {/* TIMELINE TAB */}
          {activeTab === 'timeline' && (
            <div className="space-y-6">
              <div className="space-y-3 bg-gray-50/50 p-4 rounded-xl border border-gray-100">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold text-gray-700 uppercase">New Clinical Note</Label>
                </div>
                <Textarea 
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder="Add a clinical note, observation, or assessment... (e.g. Patient showed improvement in energy levels)" 
                  className="min-h-[100px] resize-none bg-white rounded-xl border-gray-200 transition-all hover:bg-gray-50 focus:bg-white shadow-none"
                />
                
                <div className="flex justify-end items-center pt-2 border-t border-gray-100 mt-2">
                  <Button 
                    type="button" 
                    size="sm" 
                    onClick={handleAddNote}
                    disabled={savingNote || !newNote.trim()}
                    className="bg-teal-600 hover:bg-teal-700 text-white shadow-sm rounded-full px-5"
                  >
                    {savingNote ? <Loader2 className="w-3 h-3 animate-spin mr-2" /> : null}
                    Post Note
                  </Button>
                </div>
              </div>
              
              <div className="relative border-l-2 border-teal-500/20 ml-3 space-y-8 pb-8 mt-4">
                {timeline.assessments.length === 0 && timeline.communications.length === 0 && !appointment.notes ? (
                  <div className="text-center py-6 text-sm text-gray-400 italic">No notes recorded yet.</div>
                ) : (
                  [
                    ...(appointment.notes ? (() => {
                      const normalizedNotes = appointment.notes.replace(/\\n/g, '\n');
                      const segments = normalizedNotes.split(/\n\n(?=\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}\] Note added:\n)/).filter((s: string) => s.trim() !== '▶️ Listen to Recording');
                      const parsed: any[] = [];
                      if (segments[0].trim()) {
                        parsed.push({
                          created_at: appointment.scheduled_at || new Date().toISOString(),
                          doctor_timeline_notes: segments[0].trim(),
                          staffs: { full_name: 'System / Appointment Notes', roles: { name: 'System' } }
                        });
                      }
                      for (let i = 1; i < segments.length; i++) {
                        const match = segments[i].match(/^\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2})\] Note added:\n([\s\S]*)/);
                        if (match) {
                          parsed.push({
                            created_at: new Date(match[1]).toISOString(),
                            doctor_timeline_notes: match[2].trim(),
                            staffs: { full_name: 'You', roles: { name: 'Doctor' } }
                          });
                        } else {
                          parsed.push({
                            created_at: appointment.scheduled_at || new Date().toISOString(),
                            doctor_timeline_notes: "[" + segments[i].trim(),
                            staffs: { full_name: 'System / Appointment Notes', roles: { name: 'System' } }
                          });
                        }
                      }
                      return parsed;
                    })() : []),
                    ...timeline.assessments, 
                    ...timeline.communications
                  ]
                    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                    .map((item, idx) => (
                      <div key={idx} className="relative pl-6">
                        <div className="absolute -left-[9px] top-1.5 w-4 h-4 bg-gradient-to-r from-teal-400 to-cyan-500 rounded-full border-4 border-white shadow-sm"></div>
                        <div className="bg-gray-50/50 rounded-xl transition-all hover:bg-gray-50 shadow-sm border border-gray-100 p-4">
                          <div className="flex justify-between items-start mb-2">
                            <span className="text-xs font-semibold text-gray-900 uppercase tracking-wide">
                              {item.staffs?.full_name || 'Staff'} <span className="text-gray-400 font-normal lowercase tracking-normal">({item.staffs?.roles?.name || 'unknown'})</span>
                            </span>
                            <span className="text-[10px] font-medium text-gray-400 whitespace-nowrap bg-white px-2 py-1 rounded-full border border-gray-100 shadow-sm">
                              {new Date(item.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          <div className="text-gray-700 text-sm whitespace-pre-wrap leading-relaxed mt-3">
                            {(() => {
                              const rawText = item.content || item.doctor_timeline_notes || ""
                              const [mainText, transcriptText] = rawText.split("||TRANSCRIPT||")
                              
                              const renderText = (text: string) => {
                                const parts = text.split(/(\[.*?\]\(.*?\))/g)
                                return parts.map((part, i) => {
                                  const match = part.match(/\[(.*?)\]\((.*?)\)/)
                                  if (match) {
                                    const isRecording = match[1].includes('Listen to Recording') && match[2].includes('http');
                                    return (
                                      <span key={`link-${i}`} className="inline-flex items-center gap-2">
                                        <a href={match[2]} target="_blank" rel="noreferrer" className="text-teal-600 hover:text-teal-700 hover:underline font-semibold transition-colors bg-teal-50 px-1 rounded">{match[1]}</a>
                                        {isRecording && (
                                          <Button 
                                            variant="outline" 
                                            size="sm" 
                                            className="h-6 text-xs bg-white"
                                            onClick={(e) => {
                                              e.preventDefault();
                                              handleRetranscribe(match[2]);
                                            }}
                                            disabled={retranscribing === match[2]}
                                          >
                                            {retranscribing === match[2] ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <RefreshCw className="w-3 h-3 mr-1" />}
                                            Re-Summarize
                                          </Button>
                                        )}
                                      </span>
                                    )
                                  }
                                  return <span key={`text-${i}`}>{part}</span>
                                })
                              }

                              return (
                                <>
                                  {renderText(mainText)}
                                  {transcriptText && (
                                    <details className="mt-4 border rounded-md p-3 bg-gray-50/50">
                                      <summary className="font-semibold text-teal-700 cursor-pointer hover:text-teal-800 transition-colors">
                                        View Full Transcript
                                      </summary>
                                      <div className="mt-3 text-sm text-gray-600 border-t pt-2 whitespace-pre-wrap italic">
                                        {renderText(transcriptText.trim())}
                                      </div>
                                    </details>
                                  )}
                                </>
                              )
                            })()}
                          </div>
                        </div>
                      </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* TREATMENT PLAN TAB */}
          {activeTab === 'treatment' && (
            <div className="bg-white rounded-xl border p-6 space-y-6">
              <h3 className="text-lg font-bold text-gray-900">Generate Treatment & Payment Plan</h3>
              
              <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Select Patient Plan Type</Label>
                  <Select value={selectedPlan} onValueChange={(val) => setSelectedPlan(val || "")}>
                    <SelectTrigger><SelectValue placeholder="Select a plan" /></SelectTrigger>
                    <SelectContent>
                      {plans.map(p => (
                        <SelectItem key={p.id} value={p.id}>{p.name} - ₹{p.price}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label>Add Product / Medication</Label>
                  <Select value={selectedProduct} onValueChange={(val) => setSelectedProduct(val || "")}>
                    <SelectTrigger><SelectValue placeholder="Select a product" /></SelectTrigger>
                    <SelectContent>
                      {inventory.map(p => (
                        <SelectItem key={p.id} value={p.id}>{p.name} - ₹{p.price}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label>Discount (%)</Label>
                  <Input type="number" min="0" max="100" value={discount} onChange={e => setDiscount(parseFloat(e.target.value) || 0)} />
                </div>
              </div>

              <div className="bg-gray-50 p-4 rounded-lg border mt-6">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-gray-600">Subtotal</span>
                  <span className="font-medium">
                    ₹{((plans.find(p=>p.id===selectedPlan)?.price||0) + (inventory.find(p=>p.id===selectedProduct)?.price||0)).toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between items-center mb-4 text-green-600">
                  <span>Discount</span>
                  <span>-{discount}%</span>
                </div>
                <div className="flex justify-between items-center pt-4 border-t border-gray-200">
                  <span className="font-bold text-lg text-gray-900">Total</span>
                  <span className="font-bold text-lg text-teal-600">
                    ₹{((plans.find(p=>p.id===selectedPlan)?.price||0) + (inventory.find(p=>p.id===selectedProduct)?.price||0)) * (1 - discount/100)}
                  </span>
                </div>
              </div>

              <div className="flex justify-end pt-4 border-t">
                <Button onClick={handleGeneratePaymentLink} disabled={loading} className="bg-teal-600 hover:bg-teal-700">
                  <Receipt className="w-4 h-4 mr-2" />
                  {loading ? 'Generating...' : 'Generate Razorpay Link'}
                </Button>
              </div>
              
              {appointment.plan_details?.payment_link && (
                <div className="mt-4 p-4 bg-teal-50 border border-teal-200 rounded-lg flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-teal-900">Payment Link Active</p>
                    <a href={appointment.plan_details.payment_link} target="_blank" className="text-xs text-teal-600 hover:underline">{appointment.plan_details.payment_link}</a>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => navigator.clipboard.writeText(appointment.plan_details.payment_link)}>Copy</Button>
                </div>
              )}
            </div>
          )}

          {/* PRESCRIPTION TAB */}
          {activeTab === 'prescription' && (
            <div className="h-full -m-6">
              <PrescriptionForm patientId={appointment.patient_id} onPrescriptionAdded={() => {
                alert("Prescription has been generated!")
              }} />
            </div>
          )}

          {/* HISTORY TAB */}
          {activeTab === 'history' && (
            <div className="p-2">
              <PrescriptionHistory patientId={appointment.patient_id} />
            </div>
          )}

          {/* REPORTS TAB */}
          {activeTab === 'reports' && (
            <div className="space-y-6">
              <label className="bg-white rounded-xl border p-8 border-dashed flex flex-col items-center justify-center text-center hover:bg-gray-50 transition-colors cursor-pointer block">
                <Download className="w-10 h-10 text-gray-400 mb-4" />
                <h3 className="font-semibold text-gray-900">Click or drag files to upload</h3>
                <p className="text-sm text-gray-500 mt-1">Upload images, PDFs, or extra reports</p>
                <input type="file" className="hidden" onChange={handleFileUpload} disabled={loading} />
              </label>
              
              <div className="grid gap-4 md:grid-cols-2">
                {/* Reports will be loaded here */}
              </div>
            </div>
          )}

        </div>
    </div>
  )
}
