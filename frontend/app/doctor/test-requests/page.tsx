'use client'

import { useState, useEffect } from 'react'
import { 
  FlaskConical, 
  Search, 
  Plus, 
  CheckCircle2, 
  Clock, 
  XCircle, 
  FileText, 
  User, 
  Phone,
  Mail,
  Trash2, 
  Edit3, 
  X, 
  Sparkles,
  ChevronRight,
  Filter,
  Check,
  AlertCircle
} from 'lucide-react'
import { getTestRequests, updateTestRequest, getTestTypes, createTestType } from '@/app/doctor/actions'

interface TestType {
  id?: string
  name: string
  category?: string
  description?: string
}

interface TestRequest {
  id: string
  user_id: string
  condition_text: string
  status: 'pending' | 'reviewed' | 'dismissed'
  doctor_notes?: string | null
  suggested_tests?: TestType[] | null
  created_at: string
  updated_at: string
  user?: {
    id: string
    name?: string
    email?: string
    phone?: string
    gender?: string
    age?: number
  } | null
}

export default function TestRequestsPage() {
  const [requests, setRequests] = useState<TestRequest[]>([])
  const [testTypes, setTestTypes] = useState<TestType[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'all' | 'pending' | 'reviewed' | 'dismissed'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  
  // Active editing modal state
  const [selectedRequest, setSelectedRequest] = useState<TestRequest | null>(null)
  const [selectedTests, setSelectedTests] = useState<TestType[]>([])
  const [doctorNotes, setDoctorNotes] = useState('')
  const [editStatus, setEditStatus] = useState<'pending' | 'reviewed' | 'dismissed'>('reviewed')
  const [isSaving, setIsSaving] = useState(false)
  
  // Custom test type creation modal inside edit modal
  const [showAddTypeModal, setShowAddTypeModal] = useState(false)
  const [newTypeName, setNewTypeName] = useState('')
  const [newTypeCategory, setNewTypeCategory] = useState('General')
  const [newTypeDesc, setNewTypeDesc] = useState('')
  const [isAddingType, setIsAddingType] = useState(false)

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)
    try {
      const [reqData, typesData] = await Promise.all([
        getTestRequests(),
        getTestTypes()
      ])
      setRequests(reqData || [])
      setTestTypes(typesData || [])
    } catch (err) {
      console.error('Failed to load test requests:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleOpenReviewModal = (req: TestRequest) => {
    setSelectedRequest(req)
    setSelectedTests(req.suggested_tests || [])
    setDoctorNotes(req.doctor_notes || '')
    setEditStatus(req.status === 'pending' ? 'reviewed' : req.status)
  }

  const handleToggleTest = (test: TestType) => {
    const exists = selectedTests.some(t => t.name.toLowerCase() === test.name.toLowerCase())
    if (exists) {
      setSelectedTests(selectedTests.filter(t => t.name.toLowerCase() !== test.name.toLowerCase()))
    } else {
      setSelectedTests([...selectedTests, test])
    }
  }

  const handleSaveReview = async () => {
    if (!selectedRequest) return
    setIsSaving(true)
    try {
      await updateTestRequest(selectedRequest.id, {
        status: editStatus,
        doctor_notes: doctorNotes,
        suggested_tests: selectedTests
      })
      setSelectedRequest(null)
      await fetchData()
    } catch (err) {
      console.error('Failed to save test request:', err)
      alert('Failed to update test request. Please try again.')
    } finally {
      setIsSaving(false)
    }
  }

  const handleCreateNewType = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTypeName.trim()) return
    setIsAddingType(true)
    try {
      const created = await createTestType({
        name: newTypeName.trim(),
        category: newTypeCategory,
        description: newTypeDesc
      })
      if (created) {
        setTestTypes([...testTypes, created])
        handleToggleTest(created)
      }
      setNewTypeName('')
      setNewTypeCategory('General')
      setNewTypeDesc('')
      setShowAddTypeModal(false)
    } catch (err) {
      console.error('Failed to add test type:', err)
      alert('Failed to create test type')
    } finally {
      setIsAddingType(false)
    }
  }

  // Filtered requests
  const filteredRequests = requests.filter(req => {
    const matchesTab = activeTab === 'all' || req.status === activeTab
    const userName = req.user?.name || 'Unnamed Patient'
    const userPhone = req.user?.phone || ''
    const userEmail = req.user?.email || ''
    const searchLower = searchQuery.toLowerCase()
    const matchesSearch = 
      userName.toLowerCase().includes(searchLower) ||
      userPhone.toLowerCase().includes(searchLower) ||
      userEmail.toLowerCase().includes(searchLower) ||
      req.condition_text.toLowerCase().includes(searchLower) ||
      (req.doctor_notes && req.doctor_notes.toLowerCase().includes(searchLower))
    return matchesTab && matchesSearch
  })

  // Summary counts
  const pendingCount = requests.filter(r => r.status === 'pending').length
  const reviewedCount = requests.filter(r => r.status === 'reviewed').length
  const dismissedCount = requests.filter(r => r.status === 'dismissed').length

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-teal-600 via-emerald-600 to-cyan-700 p-6 md:p-8 text-white shadow-xl">
        <div className="absolute right-0 top-0 -mr-16 -mt-16 w-64 h-64 rounded-full bg-white/10 blur-2xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-teal-100 text-sm font-semibold tracking-wide uppercase mb-1">
              <FlaskConical className="w-4 h-4" />
              <span>Laboratory & Diagnostic Management</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
              Test Requests
            </h1>
            <p className="text-teal-100/90 text-sm mt-1 max-w-xl">
              Review patient test requests, evaluate symptoms, and suggest required diagnostic panels from standard test types.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button 
              onClick={() => setShowAddTypeModal(true)}
              className="flex items-center gap-2 bg-white/20 hover:bg-white/30 backdrop-blur-md border border-white/30 text-white px-4 py-2.5 rounded-xl font-medium text-sm transition-all duration-200 shadow-md hover:scale-[1.02]"
            >
              <Plus className="w-4 h-4" />
              <span>Add Custom Test Type</span>
            </button>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 pt-6 border-t border-white/20">
          <div className="bg-white/10 backdrop-blur-md rounded-xl p-3.5 border border-white/10">
            <span className="text-xs text-teal-100 block font-medium">Total Requests</span>
            <span className="text-2xl font-bold">{requests.length}</span>
          </div>
          <div className="bg-amber-500/20 backdrop-blur-md rounded-xl p-3.5 border border-amber-300/30">
            <span className="text-xs text-amber-100 block font-medium">Pending Review</span>
            <span className="text-2xl font-bold text-amber-200">{pendingCount}</span>
          </div>
          <div className="bg-emerald-500/20 backdrop-blur-md rounded-xl p-3.5 border border-emerald-300/30">
            <span className="text-xs text-emerald-100 block font-medium">Reviewed & Suggested</span>
            <span className="text-2xl font-bold text-emerald-200">{reviewedCount}</span>
          </div>
          <div className="bg-slate-500/20 backdrop-blur-md rounded-xl p-3.5 border border-slate-300/30">
            <span className="text-xs text-slate-200 block font-medium">Dismissed</span>
            <span className="text-2xl font-bold text-slate-200">{dismissedCount}</span>
          </div>
        </div>
      </div>

      {/* Control Bar: Search & Tabs */}
      <div className="flex flex-col sm:flex-row gap-4 items-stretch sm:items-center justify-between bg-card border border-border/60 rounded-xl p-4 shadow-sm">
        {/* Filter Tabs */}
        <div className="flex items-center bg-muted/60 p-1 rounded-lg">
          {(['all', 'pending', 'reviewed', 'dismissed'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3.5 py-1.5 rounded-md text-xs font-semibold capitalize transition-all duration-200 ${
                activeTab === tab 
                  ? 'bg-background text-foreground shadow-xs' 
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab} {tab === 'pending' && pendingCount > 0 && (
                <span className="ml-1 bg-amber-500 text-white rounded-full px-1.5 py-0.2 text-[10px]">
                  {pendingCount}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Search Box */}
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search patient or condition..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-xs rounded-lg bg-background border border-input focus:outline-none focus:ring-2 focus:ring-teal-500/40"
          />
          {searchQuery && (
            <button 
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 bg-card border border-border/60 rounded-xl shadow-xs">
          <div className="w-10 h-10 border-4 border-teal-500 border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-sm text-muted-foreground font-medium">Loading test requests...</p>
        </div>
      ) : filteredRequests.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 bg-card border border-border/60 rounded-xl shadow-xs text-center px-4">
          <div className="w-14 h-14 bg-teal-50 text-teal-600 dark:bg-teal-950/50 dark:text-teal-400 rounded-full flex items-center justify-center mb-4">
            <FlaskConical className="w-7 h-7" />
          </div>
          <h3 className="text-base font-semibold text-foreground">No test requests found</h3>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm">
            {searchQuery 
              ? 'No requests match your current search criteria.' 
              : activeTab !== 'all' 
                ? `There are currently no requests with "${activeTab}" status.`
                : 'Patient test requests will appear here when submitted.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredRequests.map(req => {
            const patientName = req.user?.name || 'Unnamed Patient'
            const patientPhone = req.user?.phone
            const suggestedCount = req.suggested_tests?.length || 0

            return (
              <div 
                key={req.id}
                className="group bg-card border border-border/70 hover:border-teal-500/50 rounded-xl p-5 shadow-xs hover:shadow-md transition-all duration-300 flex flex-col justify-between relative overflow-hidden"
              >
                {/* Status Indicator Stripe */}
                <div className={`absolute top-0 left-0 right-0 h-1 ${
                  req.status === 'pending' ? 'bg-amber-500' :
                  req.status === 'reviewed' ? 'bg-emerald-500' : 'bg-slate-400'
                }`} />

                <div>
                  {/* Card Header: Patient Info & Status Badge */}
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-full bg-teal-100 text-teal-700 dark:bg-teal-900/60 dark:text-teal-300 flex items-center justify-center font-bold text-xs shrink-0">
                        <User className="w-4.5 h-4.5" />
                      </div>
                      <div>
                        <h4 className="font-semibold text-sm text-foreground group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors">
                          {patientName}
                        </h4>
                        {patientPhone && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                            <Phone className="w-3 h-3 text-teal-600 dark:text-teal-400" />
                            <span>{patientPhone}</span>
                          </div>
                        )}
                        <span className="text-[11px] text-muted-foreground/80 block mt-0.5">
                          Requested: {new Date(req.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                      </div>
                    </div>

                    {/* Status Badge */}
                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium capitalize shrink-0 ${
                      req.status === 'pending' ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300' :
                      req.status === 'reviewed' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300' :
                      'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                    }`}>
                      {req.status === 'pending' && <Clock className="w-3 h-3" />}
                      {req.status === 'reviewed' && <CheckCircle2 className="w-3 h-3" />}
                      {req.status === 'dismissed' && <XCircle className="w-3 h-3" />}
                      {req.status}
                    </span>
                  </div>

                  {/* Condition / Symptoms Box */}
                  <div className="bg-muted/50 rounded-lg p-3 my-3 border border-border/40">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">
                      Patient Condition / Notes
                    </span>
                    <p className="text-xs text-foreground/90 line-clamp-3 leading-relaxed">
                      "{req.condition_text}"
                    </p>
                  </div>

                  {/* Suggested Tests List */}
                  <div className="mb-4">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1.5">
                      Suggested Diagnostic Tests ({suggestedCount})
                    </span>
                    {suggestedCount > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {req.suggested_tests?.map((t, idx) => (
                          <span 
                            key={idx}
                            className="bg-teal-50 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300 border border-teal-200 dark:border-teal-800 text-[11px] px-2 py-0.5 rounded-md font-medium"
                          >
                            {t.name}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground italic">No tests suggested yet.</p>
                    )}
                  </div>

                  {/* Doctor Notes preview */}
                  {req.doctor_notes && (
                    <div className="text-xs text-muted-foreground bg-teal-500/5 border-l-2 border-teal-500 pl-2 py-1 my-2">
                      <span className="font-semibold text-foreground">Doctor Note:</span> {req.doctor_notes}
                    </div>
                  )}
                </div>

                {/* Card Action Button */}
                <button
                  onClick={() => handleOpenReviewModal(req)}
                  className="w-full mt-4 flex items-center justify-center gap-2 bg-teal-600 hover:bg-teal-700 text-white py-2 px-3 rounded-lg text-xs font-semibold transition-all duration-200 shadow-xs hover:shadow-sm"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>{req.status === 'pending' ? 'Review & Suggest Tests' : 'Edit Suggested Tests'}</span>
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal: Edit / Review Test Request */}
      {selectedRequest && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
          <div className="bg-card border border-border rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl my-8">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 bg-gradient-to-r from-teal-600 to-emerald-600 text-white">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                  <FlaskConical className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base">Review Test Request</h3>
                  <div className="flex items-center gap-3 text-xs text-teal-100 mt-0.5">
                    <span className="font-semibold">{selectedRequest.user?.name || 'Unnamed Patient'}</span>
                    {selectedRequest.user?.phone && (
                      <span className="flex items-center gap-1 bg-white/10 px-2 py-0.5 rounded-md">
                        <Phone className="w-3 h-3" />
                        {selectedRequest.user.phone}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <button 
                onClick={() => setSelectedRequest(null)}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
              {/* Patient Condition Details */}
              <div className="bg-muted/60 p-4 rounded-xl border border-border/50">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">
                  Reported Symptoms / Condition
                </span>
                <p className="text-sm text-foreground leading-relaxed font-medium">
                  {selectedRequest.condition_text}
                </p>
              </div>

              {/* Select Suggested Tests */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold text-foreground uppercase tracking-wider">
                    Select Suggested Tests ({selectedTests.length})
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowAddTypeModal(true)}
                    className="text-xs text-teal-600 dark:text-teal-400 font-semibold hover:underline flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Create Custom Test</span>
                  </button>
                </div>

                {/* Selected Tests Pills */}
                {selectedTests.length > 0 && (
                  <div className="flex flex-wrap gap-2 p-3 bg-teal-500/10 border border-teal-500/20 rounded-xl mb-3">
                    {selectedTests.map((t, idx) => (
                      <span 
                        key={idx}
                        className="inline-flex items-center gap-1.5 bg-teal-600 text-white text-xs px-3 py-1 rounded-full font-medium shadow-xs"
                      >
                        {t.name}
                        <button 
                          type="button" 
                          onClick={() => handleToggleTest(t)}
                          className="hover:bg-teal-700 rounded-full p-0.5"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                {/* Available Test Types Selector Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto p-1 border border-border rounded-xl">
                  {testTypes.map((type, idx) => {
                    const isSelected = selectedTests.some(st => st.name.toLowerCase() === type.name.toLowerCase())
                    return (
                      <button
                        key={type.id || idx}
                        type="button"
                        onClick={() => handleToggleTest(type)}
                        className={`flex items-start justify-between p-2.5 rounded-lg border text-left transition-all ${
                          isSelected 
                            ? 'bg-teal-50 border-teal-500 text-teal-900 dark:bg-teal-950/80 dark:border-teal-500 dark:text-teal-200' 
                            : 'bg-background border-border/70 hover:border-teal-500/40 text-foreground'
                        }`}
                      >
                        <div>
                          <span className="text-xs font-semibold block">{type.name}</span>
                          {type.category && (
                            <span className="text-[10px] text-muted-foreground block">{type.category}</span>
                          )}
                        </div>
                        <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 mt-0.5 ${
                          isSelected ? 'bg-teal-600 border-teal-600 text-white' : 'border-muted-foreground/40'
                        }`}>
                          {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Doctor Notes */}
              <div>
                <label className="text-xs font-bold text-foreground uppercase tracking-wider block mb-2">
                  Doctor Clinical Notes / Instructions
                </label>
                <textarea
                  rows={3}
                  value={doctorNotes}
                  onChange={(e) => setDoctorNotes(e.target.value)}
                  placeholder="Add guidance or notes for patient regarding these tests..."
                  className="w-full p-3 text-xs rounded-xl bg-background border border-input focus:outline-none focus:ring-2 focus:ring-teal-500/40"
                />
              </div>

              {/* Status Selector */}
              <div>
                <label className="text-xs font-bold text-foreground uppercase tracking-wider block mb-2">
                  Update Request Status
                </label>
                <div className="grid grid-cols-3 gap-3">
                  {(['pending', 'reviewed', 'dismissed'] as const).map(st => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setEditStatus(st)}
                      className={`py-2 px-3 rounded-xl border text-xs font-semibold capitalize flex items-center justify-center gap-1.5 transition-all ${
                        editStatus === st
                          ? st === 'pending' ? 'bg-amber-500 text-white border-amber-500' :
                            st === 'reviewed' ? 'bg-emerald-600 text-white border-emerald-600' :
                            'bg-slate-600 text-white border-slate-600'
                          : 'bg-background border-border text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {st === 'pending' && <Clock className="w-3.5 h-3.5" />}
                      {st === 'reviewed' && <CheckCircle2 className="w-3.5 h-3.5" />}
                      {st === 'dismissed' && <XCircle className="w-3.5 h-3.5" />}
                      {st}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end gap-3 p-4 bg-muted/40 border-t border-border">
              <button
                type="button"
                onClick={() => setSelectedRequest(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-muted-foreground hover:text-foreground border border-border"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveReview}
                disabled={isSaving}
                className="flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-semibold bg-teal-600 hover:bg-teal-700 text-white shadow-md transition-all disabled:opacity-50"
              >
                {isSaving ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Save & Update Request</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Secondary Modal: Add Custom Test Type */}
      {showAddTypeModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl w-full max-w-md p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-base text-foreground flex items-center gap-2">
                <Plus className="w-4 h-4 text-teal-600" />
                Add Custom Test Type
              </h3>
              <button 
                onClick={() => setShowAddTypeModal(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateNewType} className="space-y-4">
              <div>
                <label className="text-xs font-medium text-foreground block mb-1">
                  Test Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Ferritin Level, Vitamin D"
                  value={newTypeName}
                  onChange={(e) => setNewTypeName(e.target.value)}
                  className="w-full p-2.5 text-xs rounded-lg bg-background border border-input focus:outline-none focus:ring-2 focus:ring-teal-500/40"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-foreground block mb-1">
                  Category
                </label>
                <input
                  type="text"
                  placeholder="e.g. Hematology, Biochemistry, Endocrinology"
                  value={newTypeCategory}
                  onChange={(e) => setNewTypeCategory(e.target.value)}
                  className="w-full p-2.5 text-xs rounded-lg bg-background border border-input focus:outline-none focus:ring-2 focus:ring-teal-500/40"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-foreground block mb-1">
                  Description
                </label>
                <textarea
                  rows={2}
                  placeholder="Brief description of what this test measures..."
                  value={newTypeDesc}
                  onChange={(e) => setNewTypeDesc(e.target.value)}
                  className="w-full p-2.5 text-xs rounded-lg bg-background border border-input focus:outline-none focus:ring-2 focus:ring-teal-500/40"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddTypeModal(false)}
                  className="px-3.5 py-1.5 rounded-lg text-xs font-medium border border-border"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isAddingType}
                  className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-teal-600 text-white hover:bg-teal-700 transition-all"
                >
                  {isAddingType ? 'Creating...' : 'Create & Select'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
