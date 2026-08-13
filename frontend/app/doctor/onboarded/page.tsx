'use client'

import { useState, useEffect } from 'react'
import { getOnboardedPatients, generatePatientPlans, updatePatientUserPlans } from '@/app/doctor/actions'
import { 
  UserCheck, 
  Search, 
  Phone, 
  Mail, 
  Calendar, 
  ShieldCheck, 
  HeartPulse, 
  Utensils, 
  Dumbbell, 
  X, 
  Sparkles, 
  Loader2, 
  Clock, 
  Flame, 
  ChevronRight,
  RefreshCw,
  Info,
  CheckCircle2,
  Stethoscope
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

type OnboardedUser = {
  id: string
  name?: string
  full_name?: string
  phone?: string
  email?: string
  status?: string
  created_at?: string
  health_goals?: string
  plans?: {
    name?: string
    price?: number
  }
  user_plans?: {
    diet_plan?: any
    exercise_plan?: any
    doctor_review?: boolean
  }
}

const DAYS = [
  { key: 'monday', label: 'Monday', short: 'Mon' },
  { key: 'tuesday', label: 'Tuesday', short: 'Tue' },
  { key: 'wednesday', label: 'Wednesday', short: 'Wed' },
  { key: 'thursday', label: 'Thursday', short: 'Thu' },
  { key: 'friday', label: 'Friday', short: 'Fri' },
  { key: 'saturday', label: 'Saturday', short: 'Sat' },
  { key: 'sunday', label: 'Sunday', short: 'Sun' },
]

const parsePlanJson = (planData: any): any => {
  if (!planData) return {}
  if (typeof planData === 'string') {
    try {
      return JSON.parse(planData)
    } catch {
      return {}
    }
  }
  return planData
}

const hasData = (val: any): boolean => {
  const parsed = parsePlanJson(val)
  if (!parsed) return false
  if (Array.isArray(parsed)) return parsed.length > 0
  if (typeof parsed === 'object') return Object.keys(parsed).length > 0
  return Boolean(parsed)
}

export default function DoctorOnboardedPatientsPage() {
  const [users, setUsers] = useState<OnboardedUser[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')

  // Modal State
  const [selectedUser, setSelectedUser] = useState<OnboardedUser | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<'diet' | 'exercise'>('diet')
  const [selectedDay, setSelectedDay] = useState<string>('monday')

  // AI Generation State
  const [isGenerating, setIsGenerating] = useState(false)
  const [generatingTarget, setGeneratingTarget] = useState<'diet' | 'exercise' | 'both' | null>(null)

  // Doctor Review Toggle Loading State
  const [togglingUserIds, setTogglingUserIds] = useState<Record<string, boolean>>({})

  useEffect(() => {
    loadOnboardedUsers()
  }, [])

  const handleToggleDoctorReview = async (user: OnboardedUser, e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    const currentStatus = Boolean(user.user_plans?.doctor_review)
    const newStatus = !currentStatus
    const userId = user.id

    setTogglingUserIds((prev) => ({ ...prev, [userId]: true }))

    // Optimistic update locally
    setUsers((prevUsers) =>
      prevUsers.map((u) =>
        u.id === userId
          ? { ...u, user_plans: { ...u.user_plans, doctor_review: newStatus } }
          : u
      )
    )
    setSelectedUser((prev) =>
      prev && prev.id === userId
        ? { ...prev, user_plans: { ...prev.user_plans, doctor_review: newStatus } }
        : prev
    )

    try {
      await updatePatientUserPlans(userId, { doctor_review: newStatus })
    } catch (err) {
      console.error("Failed to update doctor review status:", err)
      // Revert optimistic update on failure
      setUsers((prevUsers) =>
        prevUsers.map((u) =>
          u.id === userId
            ? { ...u, user_plans: { ...u.user_plans, doctor_review: currentStatus } }
            : u
        )
      )
      setSelectedUser((prev) =>
        prev && prev.id === userId
          ? { ...prev, user_plans: { ...prev.user_plans, doctor_review: currentStatus } }
          : prev
      )
    } finally {
      setTogglingUserIds((prev) => ({ ...prev, [userId]: false }))
    }
  }

  const loadOnboardedUsers = async () => {
    try {
      const data = await getOnboardedPatients()
      setUsers(Array.isArray(data) ? data : [])
    } catch (err) {
      console.error("Failed to load onboarded patients:", err)
    } finally {
      setLoading(false)
    }
  }

  const handleCardClick = (user: OnboardedUser) => {
    setSelectedUser(user)
    setIsModalOpen(true)
    setSelectedDay('monday')
    
    // Auto switch to available plan tab if one is present
    const dietPresent = hasData(user.user_plans?.diet_plan)
    const exercisePresent = hasData(user.user_plans?.exercise_plan)
    if (!dietPresent && exercisePresent) {
      setActiveTab('exercise')
    } else {
      setActiveTab('diet')
    }
  }

  const handleGeneratePlan = async (target: 'diet' | 'exercise' | 'both') => {
    if (!selectedUser) return
    setIsGenerating(true)
    setGeneratingTarget(target)

    try {
      const displayName = selectedUser.name || selectedUser.full_name || 'Patient'
      const goals = selectedUser.health_goals || ''
      const res = await generatePatientPlans(selectedUser.id, target, goals, displayName)

      if (res && res.data) {
        const updatedUserPlans = {
          diet_plan: res.data.diet_plan,
          exercise_plan: res.data.exercise_plan,
        }

        // Update modal state
        setSelectedUser((prev) => prev ? { ...prev, user_plans: updatedUserPlans } : null)

        // Update list state
        setUsers((prevUsers) =>
          prevUsers.map((u) =>
            u.id === selectedUser.id ? { ...u, user_plans: updatedUserPlans } : u
          )
        )
      }
    } catch (err) {
      console.error("Failed to generate AI plan:", err)
      alert("Failed to generate plan using AI. Please check OpenAI API key configuration.")
    } finally {
      setIsGenerating(false)
      setGeneratingTarget(null)
    }
  }

  const filteredUsers = users.filter((u) => {
    const name = u.name || u.full_name || ''
    const phone = u.phone || ''
    const email = u.email || ''
    const query = searchQuery.toLowerCase()
    return (
      name.toLowerCase().includes(query) ||
      phone.includes(query) ||
      email.toLowerCase().includes(query)
    )
  })

  // Selected User Plan Data
  const dietPlanData = parsePlanJson(selectedUser?.user_plans?.diet_plan)
  const exercisePlanData = parsePlanJson(selectedUser?.user_plans?.exercise_plan)

  const dietPlanPresent = hasData(dietPlanData)
  const exercisePlanPresent = hasData(exercisePlanData)

  const dayDiet = dietPlanData[selectedDay] || dietPlanData[selectedDay.toLowerCase()] || {}
  const dayExercise = exercisePlanData[selectedDay] || exercisePlanData[selectedDay.toLowerCase()] || {}

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
          <UserCheck className="w-8 h-8 text-teal-600" />
          Onboarded Patients
        </h1>
        <p className="text-gray-500 mt-1">
          View registered patients, manage weekly Diet & Exercise plans, or generate personalized plans with OpenAI.
        </p>
      </div>

      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 space-y-6">
        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Search by name, phone, or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 bg-gray-50 border-transparent focus:border-teal-500 focus:bg-white transition-all"
            />
          </div>
          <div className="text-sm text-gray-500 font-medium ml-auto">
            Total Onboarded: <span className="font-bold text-teal-600">{users.length}</span>
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-44 bg-gray-100 animate-pulse rounded-xl"></div>
            ))}
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="text-center py-16 px-4">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <UserCheck className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-1">No onboarded patients found</h3>
            <p className="text-gray-500 max-w-sm mx-auto">
              {searchQuery
                ? "No onboarded patients match your search criteria."
                : "There are currently no users in the users table."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredUsers.map((u) => {
              const displayName = u.name || u.full_name || 'Unnamed User'
              const phone = u.phone || 'No phone'
              const email = u.email || 'No email'
              const createdDate = u.created_at
                ? new Date(u.created_at).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })
                : 'N/A'

              const hasDiet = hasData(u.user_plans?.diet_plan)
              const hasExercise = hasData(u.user_plans?.exercise_plan)

              return (
                <div
                  key={u.id}
                  onClick={() => handleCardClick(u)}
                  className="group bg-white border border-gray-100 rounded-xl p-5 hover:shadow-lg hover:border-teal-200 transition-all duration-300 relative overflow-hidden flex flex-col justify-between cursor-pointer"
                >
                  <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-teal-400 to-emerald-500 opacity-0 group-hover:opacity-100 transition-opacity"></div>

                  <div>
                    {/* Header Row with Name & Plan Pills */}
                    <div className="flex items-start justify-between gap-3 mb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-teal-100 to-emerald-100 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                          <span className="text-teal-700 font-bold text-lg">
                            {displayName.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <h3 className="text-lg font-bold text-gray-900 leading-tight group-hover:text-teal-700 transition-colors">
                            {displayName}
                          </h3>
                          <p className="text-xs text-teal-600 font-medium flex items-center gap-1 mt-0.5">
                            <ShieldCheck className="w-3.5 h-3.5 text-teal-500" />
                            Onboarded User
                          </p>
                        </div>
                      </div>

                      {/* Small Plan Pills on the right side */}
                      <div className="flex flex-col items-end gap-1.5 shrink-0">
                        {hasDiet && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/60 shadow-2xs">
                            <Utensils className="w-3 h-3 text-emerald-600" />
                            Diet
                          </span>
                        )}
                        {hasExercise && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200/60 shadow-2xs">
                            <Dumbbell className="w-3 h-3 text-blue-600" />
                            Exercise
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="space-y-2 mb-4">
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <Phone className="w-4 h-4 text-gray-400 shrink-0" />
                        <span>{phone}</span>
                      </div>

                      {email !== 'No email' && (
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <Mail className="w-4 h-4 text-gray-400 shrink-0" />
                          <span className="truncate">{email}</span>
                        </div>
                      )}

                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <Calendar className="w-4 h-4 text-gray-400 shrink-0" />
                        <span>Joined: {createdDate}</span>
                      </div>

                      {u.plans?.name && (
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <HeartPulse className="w-4 h-4 text-teal-500 shrink-0" />
                          <span>
                            Plan: <span className="font-semibold text-gray-900">{u.plans.name}</span>
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Doctor Review Toggle Button */}
                    <div 
                      className="flex items-center justify-between pt-2.5 pb-1 border-t border-gray-100 mb-3"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <span className="text-xs font-semibold text-gray-500 flex items-center gap-1">
                        <Stethoscope className="w-3.5 h-3.5 text-teal-600" />
                        Doctor Review:
                      </span>
                      <button
                        type="button"
                        onClick={(e) => handleToggleDoctorReview(u, e)}
                        disabled={togglingUserIds[u.id]}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold transition-all shadow-2xs border ${
                          u.user_plans?.doctor_review
                            ? 'bg-emerald-500 text-white border-emerald-600 hover:bg-emerald-600'
                            : 'bg-amber-50 text-amber-800 border-amber-300/80 hover:bg-amber-100'
                        }`}
                      >
                        {togglingUserIds[u.id] ? (
                          <Loader2 className="w-3 h-3 animate-spin text-current" />
                        ) : u.user_plans?.doctor_review ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                        ) : (
                          <Clock className="w-3.5 h-3.5 text-amber-600" />
                        )}
                        {u.user_plans?.doctor_review ? 'Reviewed' : 'Pending'}
                      </button>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-teal-600 font-semibold group-hover:text-teal-700">
                    <span>View & Manage Plans</span>
                    <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* PATIENT PLANS MODAL */}
      {/* ========================================================================= */}
      {isModalOpen && selectedUser && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-teal-700 via-teal-600 to-emerald-600 px-6 py-5 text-white flex items-center justify-between shrink-0 shadow-md">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center text-white font-bold text-xl border border-white/30">
                  {(selectedUser.name || selectedUser.full_name || 'U').charAt(0).toUpperCase()}
                </div>
                <div>
                  <h2 className="text-xl font-bold leading-tight">
                    {selectedUser.name || selectedUser.full_name || 'Patient'}
                  </h2>
                  <p className="text-xs text-teal-100 flex items-center gap-3 mt-0.5">
                    <span>Phone: {selectedUser.phone || 'N/A'}</span>
                    <span>•</span>
                    <span>Email: {selectedUser.email || 'N/A'}</span>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={(e) => handleToggleDoctorReview(selectedUser, e)}
                  disabled={togglingUserIds[selectedUser.id]}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold transition-all shadow-sm border ${
                    selectedUser.user_plans?.doctor_review
                      ? 'bg-emerald-400 text-emerald-950 border-emerald-300 hover:bg-emerald-300'
                      : 'bg-white/20 text-white border-white/40 hover:bg-white/30 backdrop-blur-md'
                  }`}
                >
                  {togglingUserIds[selectedUser.id] ? (
                    <Loader2 className="w-4 h-4 animate-spin text-current" />
                  ) : selectedUser.user_plans?.doctor_review ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-950" />
                  ) : (
                    <Stethoscope className="w-4 h-4 text-white" />
                  )}
                  {selectedUser.user_plans?.doctor_review ? 'Doctor Reviewed' : 'Mark as Reviewed'}
                </button>

                <Button
                  onClick={() => handleGeneratePlan('both')}
                  disabled={isGenerating}
                  size="sm"
                  className="bg-amber-400 hover:bg-amber-500 text-gray-950 font-bold text-xs shadow-md border-0 gap-1.5 transition-all"
                >
                  {isGenerating && generatingTarget === 'both' ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4 text-gray-950 fill-amber-300" />
                  )}
                  {isGenerating && generatingTarget === 'both' ? 'Generating Both...' : 'Generate Both with AI'}
                </Button>

                <button
                  onClick={() => setIsModalOpen(false)}
                  className="text-white/80 hover:text-white hover:bg-white/10 p-2 rounded-full transition"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>

            {/* Modal Content Scrollable Area */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50/50">
              
              {/* Navigation Tabs: Diet vs Exercise */}
              <div className="flex items-center justify-between bg-white p-1.5 rounded-2xl border border-gray-200 shadow-2xs">
                <div className="flex gap-2 flex-1">
                  <button
                    onClick={() => setActiveTab('diet')}
                    className={`flex-1 py-3 px-4 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 ${
                      activeTab === 'diet'
                        ? 'bg-emerald-600 text-white shadow-md'
                        : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                    }`}
                  >
                    <Utensils className="w-4 h-4" />
                    Diet Plan
                    {dietPlanPresent && (
                      <span className="w-2 h-2 rounded-full bg-emerald-300 animate-pulse"></span>
                    )}
                  </button>

                  <button
                    onClick={() => setActiveTab('exercise')}
                    className={`flex-1 py-3 px-4 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 ${
                      activeTab === 'exercise'
                        ? 'bg-blue-600 text-white shadow-md'
                        : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                    }`}
                  >
                    <Dumbbell className="w-4 h-4" />
                    Exercise Plan
                    {exercisePlanPresent && (
                      <span className="w-2 h-2 rounded-full bg-blue-300 animate-pulse"></span>
                    )}
                  </button>
                </div>
              </div>

              {/* Day Selector Pills */}
              <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
                {DAYS.map((day) => {
                  const isSelected = selectedDay === day.key
                  return (
                    <button
                      key={day.key}
                      onClick={() => setSelectedDay(day.key)}
                      className={`py-2 px-4 rounded-xl font-bold text-xs transition-all whitespace-nowrap border shrink-0 ${
                        isSelected
                          ? activeTab === 'diet'
                            ? 'bg-emerald-100 border-emerald-300 text-emerald-900 shadow-2xs'
                            : 'bg-blue-100 border-blue-300 text-blue-900 shadow-2xs'
                          : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {day.label}
                    </button>
                  )
                })}
              </div>

              {/* ===================================================================== */}
              {/* TAB 1: DIET PLAN */}
              {/* ===================================================================== */}
              {activeTab === 'diet' && (
                <div className="space-y-4">
                  {!dietPlanPresent ? (
                    <div className="bg-white rounded-3xl border border-gray-200 p-10 text-center space-y-4 shadow-sm">
                      <div className="w-16 h-16 bg-emerald-50 rounded-2xl flex items-center justify-center mx-auto text-emerald-600">
                        <Utensils className="w-8 h-8" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold text-gray-900">No Diet Plan Assigned</h3>
                        <p className="text-sm text-gray-500 max-w-md mx-auto mt-1">
                          This patient currently has no active diet plan stored in the system. You can generate a 7-day personalized diet plan with OpenAI.
                        </p>
                      </div>
                      <Button
                        onClick={() => handleGeneratePlan('diet')}
                        disabled={isGenerating}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-6 py-6 rounded-2xl shadow-lg gap-2 text-sm"
                      >
                        {isGenerating && generatingTarget === 'diet' ? (
                          <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                          <Sparkles className="w-5 h-5" />
                        )}
                        {isGenerating && generatingTarget === 'diet'
                          ? 'Generating 7-Day Diet Plan...'
                          : 'Generate 7-Day Diet Plan with AI'}
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between bg-emerald-50 border border-emerald-100 p-4 rounded-2xl">
                        <div className="flex items-center gap-2 text-emerald-900 text-sm font-semibold">
                          <Utensils className="w-4 h-4 text-emerald-600" />
                          <span>Showing Diet Schedule for <strong className="capitalize">{selectedDay}</strong></span>
                        </div>
                        <Button
                          onClick={() => handleGeneratePlan('diet')}
                          disabled={isGenerating}
                          variant="outline"
                          size="sm"
                          className="bg-white hover:bg-emerald-100 text-emerald-700 border-emerald-200 font-bold text-xs gap-1.5"
                        >
                          {isGenerating && generatingTarget === 'diet' ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <RefreshCw className="w-3.5 h-3.5" />
                          )}
                          Re-generate Diet
                        </Button>
                      </div>

                      {/* Meals Grid for selected day */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {['breakfast', 'lunch', 'snacks', 'dinner'].map((mealKey) => {
                          const mealObj = dayDiet[mealKey] || {}
                          const mealDesc = typeof mealObj === 'string' ? mealObj : (mealObj.meal || 'No meal specified')
                          const mealImage = typeof mealObj === 'object' ? mealObj.image : null

                          const mealTitles: Record<string, { title: string; color: string; badge: string }> = {
                            breakfast: { title: 'Breakfast', color: 'text-amber-600', badge: 'bg-amber-50 text-amber-700 border-amber-200' },
                            lunch: { title: 'Lunch', color: 'text-emerald-600', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
                            snacks: { title: 'Snacks', color: 'text-orange-600', badge: 'bg-orange-50 text-orange-700 border-orange-200' },
                            dinner: { title: 'Dinner', color: 'text-indigo-600', badge: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
                          }

                          const meta = mealTitles[mealKey] || { title: mealKey, color: 'text-gray-700', badge: 'bg-gray-50 text-gray-700 border-gray-200' }

                          return (
                            <div
                              key={mealKey}
                              className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm space-y-3 flex flex-col justify-between overflow-hidden"
                            >
                              <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                  <span className={`text-xs font-bold px-3 py-1 rounded-full border ${meta.badge} uppercase tracking-wider`}>
                                    {meta.title}
                                  </span>
                                </div>

                                <p className="text-sm font-semibold text-gray-800 leading-relaxed pt-1">
                                  {mealDesc}
                                </p>
                              </div>

                              {mealImage && (
                                <div className="w-full h-36 rounded-xl overflow-hidden bg-gray-100 relative mt-2 border border-gray-100">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={mealImage}
                                    alt={meta.title}
                                    className="w-full h-full object-cover transition-transform duration-300 hover:scale-105"
                                    onError={(e) => {
                                      // Fallback on error
                                      ;(e.target as HTMLElement).style.display = 'none'
                                    }}
                                  />
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ===================================================================== */}
              {/* TAB 2: EXERCISE PLAN */}
              {/* ===================================================================== */}
              {activeTab === 'exercise' && (
                <div className="space-y-4">
                  {!exercisePlanPresent ? (
                    <div className="bg-white rounded-3xl border border-gray-200 p-10 text-center space-y-4 shadow-sm">
                      <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto text-blue-600">
                        <Dumbbell className="w-8 h-8" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold text-gray-900">No Exercise Plan Assigned</h3>
                        <p className="text-sm text-gray-500 max-w-md mx-auto mt-1">
                          This patient currently has no active workout plan stored in the system. You can generate a 7-day workout plan with OpenAI.
                        </p>
                      </div>
                      <Button
                        onClick={() => handleGeneratePlan('exercise')}
                        disabled={isGenerating}
                        className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-6 py-6 rounded-2xl shadow-lg gap-2 text-sm"
                      >
                        {isGenerating && generatingTarget === 'exercise' ? (
                          <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                          <Sparkles className="w-5 h-5" />
                        )}
                        {isGenerating && generatingTarget === 'exercise'
                          ? 'Generating 7-Day Exercise Plan...'
                          : 'Generate 7-Day Exercise Plan with AI'}
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between bg-blue-50 border border-blue-100 p-4 rounded-2xl">
                        <div className="flex items-center gap-2 text-blue-900 text-sm font-semibold">
                          <Dumbbell className="w-4 h-4 text-blue-600" />
                          <span>Showing Workout Schedule for <strong className="capitalize">{selectedDay}</strong></span>
                        </div>
                        <Button
                          onClick={() => handleGeneratePlan('exercise')}
                          disabled={isGenerating}
                          variant="outline"
                          size="sm"
                          className="bg-white hover:bg-blue-100 text-blue-700 border-blue-200 font-bold text-xs gap-1.5"
                        >
                          {isGenerating && generatingTarget === 'exercise' ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <RefreshCw className="w-3.5 h-3.5" />
                          )}
                          Re-generate Exercise
                        </Button>
                      </div>

                      {/* Workout Summary Banner */}
                      <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm flex items-center justify-between">
                        <div>
                          <span className="text-xs font-semibold text-blue-600 uppercase tracking-wider">Workout Focus</span>
                          <h4 className="text-lg font-bold text-gray-900 mt-0.5">
                            {dayExercise.type || 'General Fitness'}
                          </h4>
                        </div>
                        <div className="flex items-center gap-2 bg-blue-50 text-blue-800 px-3.5 py-1.5 rounded-full text-xs font-bold border border-blue-100">
                          <Clock className="w-4 h-4 text-blue-600" />
                          <span>{dayExercise.duration_minutes ?? 30} mins</span>
                        </div>
                      </div>

                      {/* Exercises List */}
                      <div className="space-y-3">
                        {Array.isArray(dayExercise.exercises) && dayExercise.exercises.length > 0 ? (
                          dayExercise.exercises.map((ex: any, idx: number) => (
                            <div
                              key={idx}
                              className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm flex items-start justify-between gap-4 hover:border-blue-200 transition-colors"
                            >
                              <div className="space-y-1.5 flex-1">
                                <h5 className="font-bold text-gray-900 text-base flex items-center gap-2">
                                  <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 font-extrabold text-xs flex items-center justify-center shrink-0">
                                    {idx + 1}
                                  </span>
                                  {ex.name}
                                </h5>

                                {ex.notes && (
                                  <p className="text-xs text-gray-500 italic pl-8">
                                    Note: {ex.notes}
                                  </p>
                                )}
                              </div>

                              <div className="flex items-center gap-2 shrink-0">
                                {ex.sets && (
                                  <span className="bg-gray-100 text-gray-800 text-xs font-bold px-3 py-1 rounded-full border border-gray-200">
                                    {ex.sets} Sets
                                  </span>
                                )}
                                {ex.reps && (
                                  <span className="bg-blue-50 text-blue-700 text-xs font-bold px-3 py-1 rounded-full border border-blue-200">
                                    {ex.reps} {typeof ex.reps === 'number' ? 'Reps' : ''}
                                  </span>
                                )}
                                {ex.duration && (
                                  <span className="bg-emerald-50 text-emerald-700 text-xs font-bold px-3 py-1 rounded-full border border-emerald-200">
                                    {ex.duration}
                                  </span>
                                )}
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="bg-white border border-gray-200 rounded-2xl p-6 text-center text-gray-500 text-sm">
                            No specific exercises listed for {selectedDay}.
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
