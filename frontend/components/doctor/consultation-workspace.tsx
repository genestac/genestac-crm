'use client'

import { useState, useEffect } from 'react'
import { 
  X, Calendar, Clock, FileText, User, 
  MapPin, Link as LinkIcon, Download,
  Activity, Tag, CheckCircle, Plus, Receipt, ChevronLeft
} from 'lucide-react'
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
  uploadPatientReport
} from '@/app/doctor/actions'
import { PrescriptionForm } from './prescription-form'
import { PrescriptionHistory } from './prescription-history'
import { useRouter } from 'next/navigation'

export function ConsultationWorkspace({ appointment, onClose, onStatusChange }: any) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState('details')
  const [loading, setLoading] = useState(false)
  const [timeline, setTimeline] = useState<{assessments: any[], communications: any[]}>({ assessments: [], communications: [] })
  
  const [plans, setPlans] = useState<any[]>([])
  const [inventory, setInventory] = useState<any[]>([])
  const [selectedPlan, setSelectedPlan] = useState('')
  const [selectedProduct, setSelectedProduct] = useState('')
  const [discount, setDiscount] = useState(0)

  useEffect(() => {
    if (appointment?.patient_id) {
      fetchPatientTimeline(appointment.patient_id).then(setTimeline)
    }
    getPlans().then(setPlans)
    getInventory().then(setInventory)
  }, [appointment])

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
    description: appointment.notes || ''
  })

  const handleSaveDetails = async () => {
    setLoading(true)
    try {
      const scheduledAt = new Date(`${details.date}T${details.time}:00`).toISOString()
      await updateAppointmentDetails(appointment.id, {
        ...details,
        scheduled_at: scheduledAt
      })
      alert("Details saved")
    } catch (e: any) {
      alert("Error: " + e.message)
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
      
      alert(`Payment link generated: ${res.payment_link}`)
    } catch (e: any) {
      alert("Error: " + e.message)
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
      alert("File uploaded successfully!")
    } catch (err: any) {
      alert("Upload failed: " + err.message)
    } finally {
      setLoading(false)
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
              <div className="bg-white rounded-xl border p-4">
                <h3 className="font-bold text-gray-900 mb-4">Add Timeline Note</h3>
                <div className="flex gap-2">
                  <Input placeholder="Enter a clinical note or condition..." className="flex-1" />
                  <Button variant="outline">Add</Button>
                </div>
              </div>
              
              <div className="relative border-l-2 border-gray-200 ml-4 space-y-6 pb-4">
                {[...timeline.assessments, ...timeline.communications]
                  .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                  .map((item, idx) => (
                    <div key={idx} className="relative pl-6">
                      <div className={`absolute -left-2 top-1.5 w-4 h-4 rounded-full border-2 border-white ${item.type ? 'bg-blue-500' : 'bg-teal-500'}`}></div>
                      <div className="bg-white p-4 rounded-lg border shadow-sm">
                        <div className="flex justify-between items-start mb-2">
                          <span className="font-medium text-gray-900">{item.staffs?.full_name || 'Staff'} <span className="text-gray-400 text-xs">({item.staffs?.roles?.name || 'unknown'})</span></span>
                          <span className="text-xs text-gray-400">{new Date(item.created_at).toLocaleString()}</span>
                        </div>
                        <p className="text-gray-700 text-sm">{item.content || item.doctor_timeline_notes}</p>
                      </div>
                    </div>
                ))}
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
                {/* Dummy previous reports */}
                <div className="bg-white p-4 rounded-lg border flex items-center gap-4">
                  <div className="w-10 h-10 bg-red-100 text-red-600 rounded flex items-center justify-center font-bold">PDF</div>
                  <div>
                    <p className="font-medium text-sm text-gray-900">Blood Test Results.pdf</p>
                    <p className="text-xs text-gray-500">Uploaded 2 days ago</p>
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>
    </div>
  )
}
