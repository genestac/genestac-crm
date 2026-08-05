'use client'

import { useState, useEffect, useCallback } from 'react'
import { updateAISettings, addKnowledgeBaseItem, deleteKnowledgeBaseItem, getCallLogs, getCallQueue, updateCallQueue, processNextCall, getCallStats, getEligibleLeadsPreview } from '../actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { toast } from 'sonner'
import { Loader2, Plus, Trash2, Bot, Database, Clock, PhoneCall, ChevronDown, ChevronUp, RefreshCw, CheckCircle2, XCircle, PhoneOff, PhoneMissed, ListOrdered, GripVertical, Play } from 'lucide-react'

// ─── Lead Score Badge ────────────────────────────────────────────────────────
function LeadScoreBadge({ score, label }: { score?: number | null; label?: string | null }) {
  if (score == null) return null
  const config =
    label === 'Hot'  ? { emoji: '🔥', className: 'bg-red-50 text-red-700 border-red-200' }
    : label === 'Warm' ? { emoji: '🌡️', className: 'bg-amber-50 text-amber-700 border-amber-200' }
    :                    { emoji: '❄️', className: 'bg-blue-50 text-blue-700 border-blue-200' }
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${config.className}`}>
      {config.emoji} {score}/100
    </span>
  )
}

// ─── Status badge helpers ────────────────────────────────────────────────────
function CallStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
    completed:          { label: 'Completed',   className: 'bg-green-50 text-green-700 border-green-200',    icon: <CheckCircle2 className="w-3 h-3" /> },
    ringing:            { label: 'Ringing',     className: 'bg-blue-50 text-blue-700 border-blue-200',      icon: <PhoneCall className="w-3 h-3 animate-pulse" /> },
    failed_to_initiate: { label: 'Failed',      className: 'bg-red-50 text-red-700 border-red-200',         icon: <XCircle className="w-3 h-3" /> },
    no_answer:          { label: 'No Answer',   className: 'bg-yellow-50 text-yellow-700 border-yellow-200', icon: <PhoneMissed className="w-3 h-3" /> },
    busy:               { label: 'Busy',        className: 'bg-orange-50 text-orange-700 border-orange-200', icon: <PhoneOff className="w-3 h-3" /> },
    pending:            { label: 'Pending',     className: 'bg-gray-50 text-gray-600 border-gray-200',      icon: <Clock className="w-3 h-3" /> },
    bot_called:         { label: 'Bot Called',  className: 'bg-indigo-50 text-indigo-700 border-indigo-200', icon: <PhoneCall className="w-3 h-3 animate-pulse" /> },
    in_call:            { label: 'In Call ✅',  className: 'bg-green-50 text-green-700 border-green-200',   icon: <CheckCircle2 className="w-3 h-3" /> },
    not_picked:         { label: 'Not Picked',  className: 'bg-red-50 text-red-600 border-red-200',         icon: <PhoneMissed className="w-3 h-3" /> },
    processing:         { label: 'Processing',  className: 'bg-purple-50 text-purple-700 border-purple-200', icon: <Loader2 className="w-3 h-3 animate-spin" /> },
    failed:             { label: 'Failed',      className: 'bg-red-50 text-red-700 border-red-200',         icon: <XCircle className="w-3 h-3" /> },
  }
  const s = map[status] ?? { label: status, className: 'bg-gray-50 text-gray-600 border-gray-200', icon: null }
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border ${s.className}`}>
      {s.icon}{s.label}
    </span>
  )
}

function CrmStatusBadge({ status }: { status: string | undefined | null }) {
  if (!status) return null
  const formatted = status.replace(/_/g, ' ')
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded border bg-purple-50 text-purple-700 border-purple-200 text-[10px] font-bold uppercase tracking-wider">
      {formatted}
    </span>
  )
}

// ─── Single call log row ─────────────────────────────────────────────────────
function CallLogRow({ log }: { log: any }) {
  const [open, setOpen] = useState(false)
  const [audioError, setAudioError] = useState(false)
  const date = new Date(log.created_at).toLocaleString('en-IN', {
    dateStyle: 'medium', timeStyle: 'short'
  })
  const leadName = log.leads?.name ?? 'Unknown'
  const leadPhone = log.leads?.phone ?? ''
  const statusBefore = log.status_before
  const statusAfter = log.status_after

  return (
    <div className="border rounded-xl overflow-hidden bg-white shadow-sm">
      {/* Header row */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-gray-50 transition-colors"
      >
        <div className="flex-shrink-0 w-9 h-9 rounded-full bg-indigo-50 flex items-center justify-center">
          <PhoneCall className="w-4 h-4 text-indigo-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-gray-900">{leadName}</span>
            {leadPhone && <span className="text-xs text-gray-400">{leadPhone}</span>}
            <CallStatusBadge status={log.status} />
            <LeadScoreBadge score={log.lead_score} label={log.score_label} />
          </div>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <p className="text-xs text-gray-400">{date}</p>
            {statusBefore && statusAfter && (
              <span className="inline-flex items-center gap-1 text-[10px] font-medium">
                <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 uppercase tracking-wider">{statusBefore.replace(/_/g, ' ')}</span>
                <span className="text-gray-400">→</span>
                <span className="px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 uppercase tracking-wider font-bold">{statusAfter.replace(/_/g, ' ')}</span>
              </span>
            )}
          </div>
        </div>
        {log.summary && (
          <p className="hidden md:block text-xs text-gray-500 max-w-xs truncate flex-shrink-0">
            {log.summary}
          </p>
        )}
        <div className="flex-shrink-0 text-gray-400">
          {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>

      {/* Expanded details */}
      {open && (
        <div className="border-t px-5 py-4 space-y-4 bg-gray-50">
          {log.summary && (
            <div>
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Summary</h4>
              <p className="text-sm text-gray-700 whitespace-pre-line">{log.summary}</p>
            </div>
          )}
          {/* Lead Score Section */}
          {log.lead_score != null && (
            <div className="flex items-start gap-3 p-3 rounded-lg bg-white border">
              <LeadScoreBadge score={log.lead_score} label={log.score_label} />
              <div className="flex-1">
                <p className="text-xs font-semibold text-gray-700">{log.score_label} Lead</p>
                {log.score_reason && (
                  <p className="text-xs text-gray-500 mt-0.5">{log.score_reason}</p>
                )}
              </div>
            </div>
          )}

          {/* Recording */}
          {log.recording_url && (
            <div>
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Voice Recording</h4>
              <div className="bg-white p-3 rounded-lg border">
                {!audioError ? (
                  <audio
                    controls
                    className="w-full h-10"
                    src={log.recording_url}
                    onError={() => setAudioError(true)}
                  >
                    Your browser does not support the audio element.
                  </audio>
                ) : (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-gray-500">Audio requires authentication.</span>
                    <a
                      href={log.recording_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-xs font-medium transition-colors"
                    >
                      <Play className="w-3.5 h-3.5" /> Open Recording
                    </a>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Transcript */}
          {log.transcript ? (
            <div>
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Transcript</h4>
              <div className="rounded-lg bg-white border p-4 max-h-80 overflow-y-auto space-y-2 font-mono text-xs text-gray-700">
                {log.transcript.split('\n').filter(Boolean).map((line: string, i: number) => {
                  const lower = line.toLowerCase()
                  // User/patient side: right-aligned indigo bubbles
                  const isUser = lower.startsWith('user:') || lower.startsWith('patient:') || lower.startsWith('customer:')
                  // Bot/doctor side: left-aligned gray bubbles  
                  const isBot = lower.startsWith('assistant:') || lower.startsWith('bot:') || lower.startsWith('doctor:') || lower.startsWith('agent:')
                  return (
                    <div key={i} className={`flex gap-2 ${isUser ? 'justify-end' : 'justify-start'}`}>
                      <span className={`px-3 py-1.5 rounded-xl max-w-[85%] break-words leading-relaxed ${
                        isUser ? 'bg-indigo-100 text-indigo-800' : 
                        isBot ? 'bg-gray-100 text-gray-800' :
                        'bg-white border text-gray-600 italic'
                      }`}>
                        {line}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            <p className="text-xs text-gray-400 italic flex items-center gap-1.5">
              {log.status === 'completed' ? '⏳ Transcript is being processed...' : 'No transcript recorded for this call.'}
            </p>
          )}
          {log.call_sid && (
            <p className="text-xs text-gray-400">Call SID: <code className="font-mono">{log.call_sid}</code></p>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
export function AdminAICallingClient({ initialSettings, initialKnowledgeBase, initialLeadStatuses = [] }: { initialSettings: any, initialKnowledgeBase: any[], initialLeadStatuses?: any[] }) {
  const [activeTab, setActiveTab] = useState<'settings' | 'logs' | 'queue'>('settings')

  const [settings, setSettings] = useState(initialSettings || {
    enabled_statuses: [],
    base_prompt: "You are a helpful AI assistant for Genestac CRM. Be concise and polite.",
    allowed_time_windows: [{ start: "09:00", end: "18:00", days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"] }],
    exotel_number: "",
    exotel_api_key: "",
    exotel_api_token: "",
    exotel_sid: "",
    exotel_subdomain: ""
  })
  const [kb, setKb] = useState(initialKnowledgeBase || [])
  const [saving, setSaving] = useState(false)
  const [newKbTitle, setNewKbTitle] = useState('')
  const [newKbContent, setNewKbContent] = useState('')
  const [addingKb, setAddingKb] = useState(false)

  // Call log filters
  const [logFilters, setLogFilters] = useState<Record<string, string>>({ status_filter: '', crm_status: '', date_from: '', date_to: '', score_label: '' })

  // Eligible leads preview
  const [preview, setPreview] = useState<any>(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  const fetchPreview = async () => {
    setPreviewLoading(true)
    try {
      const data = await getEligibleLeadsPreview()
      setPreview(data)
    } catch {
      toast.error('Failed to load preview')
    } finally {
      setPreviewLoading(false)
    }
  }

  // Call logs state
  const [callLogs, setCallLogs] = useState<any[]>([])
  const [logsLoading, setLogsLoading] = useState(false)
  const [logsPage, setLogsPage] = useState(1)
  const [logsTotal, setLogsTotal] = useState(0)
  const limit = 50

  // Call stats state
  const [callStats, setCallStats] = useState({
    total_calls: 0,
    monthly_calls: 0,
    todays_calls: 0,
    todays_picked_up: 0
  })

  // Call Queue state
  const [callQueue, setCallQueue] = useState<any[]>([])
  const [queueLoading, setQueueLoading] = useState(false)
  const [draggedItemIndex, setDraggedItemIndex] = useState<number | null>(null)
  const [processingQueue, setProcessingQueue] = useState(false)

  const leadStatuses = initialLeadStatuses && initialLeadStatuses.length > 0 
    ? initialLeadStatuses 
    : [
        { value: "NEW", label: "New" },
        { value: "UNREAD", label: "Unread" },
        { value: "CONTACT_ATTEMPTED", label: "Contact Attempted" },
        { value: "CONTACTED", label: "Contacted" },
        { value: "QUALIFIED", label: "Qualified" },
      ]

  const fetchCallLogs = useCallback(async (page: number = logsPage, silent = false, filters?: Record<string, string>) => {
    if (!silent) setLogsLoading(true)
    try {
      const res = await getCallLogs(page, limit, filters ?? logFilters)
      setCallLogs(res.data || [])
      setLogsTotal(res.total || 0)
    } catch {
      if (!silent) toast.error('Failed to load call logs')
    } finally {
      if (!silent) setLogsLoading(false)
    }
  }, [logsPage, limit, logFilters])

  const fetchCallStats = useCallback(async () => {
    try {
      const stats = await getCallStats()
      setCallStats(stats)
    } catch {
      console.error('Failed to fetch call stats')
    }
  }, [])

  const fetchCallQueue = useCallback(async (silent = false) => {
    if (!silent) setQueueLoading(true)
    try {
      const queue = await getCallQueue()
      setCallQueue(queue)
    } catch {
      if (!silent) toast.error('Failed to load call queue')
    } finally {
      if (!silent) setQueueLoading(false)
    }
  }, [])

  useEffect(() => {
    let interval: NodeJS.Timeout
    
    if (activeTab === 'logs') {
      fetchCallLogs(logsPage)
      fetchCallStats()
      interval = setInterval(() => {
        if (document.visibilityState === 'visible') {
          fetchCallLogs(logsPage, true)
          fetchCallStats()
        }
      }, 10000)
    } else if (activeTab === 'queue') {
      fetchCallQueue()
      interval = setInterval(() => {
        if (document.visibilityState === 'visible') {
          fetchCallQueue(true)
        }
      }, 10000)
    }
    
    return () => {
      if (interval) clearInterval(interval)
    }
  }, [activeTab, logsPage, fetchCallLogs, fetchCallQueue, fetchCallStats])

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedItemIndex(index)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragEnter = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    if (draggedItemIndex === null || draggedItemIndex === index) return
    const newQueue = [...callQueue]
    const draggedItem = newQueue[draggedItemIndex]
    newQueue.splice(draggedItemIndex, 1)
    newQueue.splice(index, 0, draggedItem)
    setDraggedItemIndex(index)
    setCallQueue(newQueue)
  }

  const handleDragEnd = async () => {
    setDraggedItemIndex(null)
    setQueueLoading(true)
    try {
      await updateCallQueue(callQueue)
      toast.success('Queue order saved')
    } catch {
      toast.error('Failed to save queue order')
      fetchCallQueue()
    } finally {
      setQueueLoading(false)
    }
  }

  const handleProcessNext = async () => {
    setProcessingQueue(true)
    try {
      const res = await processNextCall()
      if (res.success) {
        toast.success(res.message || 'Processing next call...')
        fetchCallQueue()
      } else {
        toast.error(res.message || 'Failed to process next call')
      }
    } catch {
      toast.error('Error processing next call')
    } finally {
      setProcessingQueue(false)
    }
  }

  const handleSaveSettings = async () => {
    setSaving(true)
    try {
      await updateAISettings(settings)
      toast.success('AI Call settings updated successfully')
    } catch {
      toast.error('Failed to update settings')
    } finally {
      setSaving(false)
    }
  }

  const handleAddKb = async () => {
    if (!newKbTitle || !newKbContent) return
    setAddingKb(true)
    try {
      const res = await addKnowledgeBaseItem({ title: newKbTitle, content: newKbContent, category: 'FAQ' })
      if (res.success) {
        setKb([...kb, res.data[0]])
        setNewKbTitle('')
        setNewKbContent('')
        toast.success('Knowledge base item added')
      }
    } catch {
      toast.error('Failed to add knowledge base item')
    } finally {
      setAddingKb(false)
    }
  }

  const handleDeleteKb = async (id: string) => {
    try {
      await deleteKnowledgeBaseItem(id)
      setKb(kb.filter((item: any) => item.id !== id))
      toast.success('Knowledge base item deleted')
    } catch {
      toast.error('Failed to delete item')
    }
  }

  const toggleStatus = (statusValue: string) => {
    setSettings((prev: any) => {
      const statuses = prev.enabled_statuses || []
      const enabled = statuses.includes(statusValue)
      return {
        ...prev,
        enabled_statuses: enabled
          ? statuses.filter((s: string) => s !== statusValue)
          : [...statuses, statusValue]
      }
    })
  }

  // Stats from logs
  const completedCount = callLogs.filter(l => l.status === 'completed').length
  const failedCount = callLogs.filter(l => l.status === 'failed_to_initiate').length
  const hotCount = callLogs.filter(l => l.score_label === 'Hot').length
  const totalCount = callLogs.length

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="relative isolate overflow-hidden bg-gradient-to-br from-indigo-900 via-indigo-800 to-purple-900 rounded-3xl p-8 mb-8 shadow-2xl">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-500/20 via-transparent to-transparent"></div>
        <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-white/10 backdrop-blur-md rounded-2xl border border-white/20">
              <Bot className="w-8 h-8 text-indigo-100" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-white">AI Voice Calling</h1>
              <p className="text-indigo-200 mt-1">Configure automated calls, intelligent routing, and RAG knowledge base.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 bg-white/50 backdrop-blur-xl rounded-2xl p-1.5 w-fit border border-gray-100 shadow-sm">
        {[
          { id: 'settings', label: 'Settings & Knowledge Base', icon: <Bot className="w-4 h-4" /> },
          { id: 'logs', label: 'Call Logs', icon: <PhoneCall className="w-4 h-4" /> },
          { id: 'queue', label: 'Call Queue', icon: <ListOrdered className="w-4 h-4" /> },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300 ${
              activeTab === tab.id
                ? 'bg-white text-indigo-700 shadow-md border-gray-100 scale-100'
                : 'text-gray-500 hover:text-gray-900 hover:bg-white/40 scale-95 hover:scale-100'
            }`}
          >
            {tab.icon}{tab.label}
          </button>
        ))}
      </div>

      {/* ── Settings Tab ── */}
      {activeTab === 'settings' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

          {/* ── Disabled Alert Banner ── */}
          {settings.ai_calling_disabled && (
            <div className="lg:col-span-2 flex items-start gap-4 bg-red-50 border border-red-200 rounded-2xl p-5 shadow-sm">
              <div className="p-2 bg-red-100 rounded-xl shrink-0">
                <PhoneOff className="w-5 h-5 text-red-600" />
              </div>
              <div className="flex-1">
                <p className="font-bold text-red-800 text-base">⚠️ AI Calling is Disabled</p>
                <p className="text-sm text-red-600 mt-1">
                  Both <strong>Sarvam</strong> and <strong>OpenAI/Pipecat</strong> providers failed consecutively.
                  The calling service has been automatically suspended to prevent further failures.
                  Current provider: <code className="bg-red-100 px-1 rounded">{settings.ai_provider || 'sarvam'}</code>
                </p>
                <p className="text-xs text-red-500 mt-1">
                  Check your API credits / credentials, then click Re-enable to resume calling.
                </p>
              </div>
              <Button
                onClick={async () => {
                  setSaving(true)
                  try {
                    const updated = { ...settings, ai_calling_disabled: false }
                    await updateAISettings(updated)
                    setSettings(updated)
                    toast.success('AI Calling re-enabled!')
                  } catch {
                    toast.error('Failed to re-enable. Check credentials.')
                  } finally {
                    setSaving(false)
                  }
                }}
                disabled={saving}
                className="shrink-0 bg-orange-500 hover:bg-orange-600 text-white font-semibold px-5 py-2 rounded-xl shadow"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <PhoneCall className="w-4 h-4 mr-2" />}
                Re-enable AI Calling
              </Button>
            </div>
          )}

          {/* Left Column: Settings & Prompt */}
          <div className="space-y-6">
            <div className="bg-white/80 backdrop-blur-xl p-8 rounded-3xl border border-gray-100 shadow-lg hover:shadow-xl transition-shadow duration-300 space-y-8">
              <div className="flex items-center gap-4 border-b border-gray-100 pb-5">
                <div className="p-3 bg-gradient-to-br from-blue-100 to-indigo-50 text-blue-600 rounded-2xl shadow-inner">
                  <Bot className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">AI Agent Configuration</h2>
                  <p className="text-sm text-gray-500">Core connectivity and persona settings.</p>
                </div>
              </div>

              <div className="space-y-4">
                <Label>AI Provider Engine</Label>
                <div className="flex bg-gray-100 p-1 rounded-xl w-fit">
                  <button
                    onClick={() => setSettings({...settings, ai_provider: 'sarvam'})}
                    className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                      (!settings.ai_provider || settings.ai_provider === 'sarvam') 
                        ? 'bg-white shadow-sm text-indigo-700' 
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    Sarvam AI (Managed)
                  </button>
                  <button
                    onClick={() => setSettings({...settings, ai_provider: 'pipecat'})}
                    className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                      settings.ai_provider === 'pipecat'
                        ? 'bg-white shadow-sm text-indigo-700'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    OpenAI (Pipecat)
                  </button>
                </div>
                <p className="text-xs text-gray-500">
                  {(!settings.ai_provider || settings.ai_provider === 'sarvam') 
                    ? "Uses Sarvam's outbound API for regional language models." 
                    : "Uses Genestac's internal Pipecat service and Exotel WebSockets."}
                </p>
              </div>

              <div className="space-y-3">
                <Label>Exotel Source Number (ExoPhone)</Label>
                <Input
                  value={settings.exotel_number || ''}
                  onChange={e => setSettings({...settings, exotel_number: e.target.value})}
                  placeholder="e.g. +91XXXXXXXXXX"
                />
                <p className="text-xs text-gray-500">The verified Exotel number the AI will use to call customers.</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-3">
                  <Label>Exotel Account SID</Label>
                  <Input value={settings.exotel_sid || ''} onChange={e => setSettings({...settings, exotel_sid: e.target.value})} placeholder="e.g. genestac1" />
                </div>
                <div className="space-y-3">
                  <Label>Exotel Subdomain</Label>
                  <Input value={settings.exotel_subdomain || ''} onChange={e => setSettings({...settings, exotel_subdomain: e.target.value})} placeholder="e.g. api.exotel.com" />
                </div>
                <div className="space-y-3">
                  <Label>Exotel API Key</Label>
                  <Input value={settings.exotel_api_key || ''} onChange={e => setSettings({...settings, exotel_api_key: e.target.value})} placeholder="Your API Key" />
                </div>
                <div className="space-y-3">
                  <Label>Exotel API Token</Label>
                  <Input type="password" value={settings.exotel_api_token || ''} onChange={e => setSettings({...settings, exotel_api_token: e.target.value})} placeholder="Your API Token" />
                </div>
              </div>

              <div className="space-y-3">
                <Label>System Prompt (Instructions)</Label>
                <Textarea
                  value={settings.base_prompt}
                  onChange={e => setSettings({...settings, base_prompt: e.target.value})}
                  className="h-48 max-h-96 overflow-y-auto resize-y"
                  style={{ fieldSizing: 'fixed' } as any}
                  placeholder="You are an AI sales agent for..."
                />
                <p className="text-xs text-gray-500">Provide the personality, goal, and rules for the AI here. Dynamic RAG context (lead name, past summary) is automatically injected.</p>
              </div>
            </div>

            <div className="bg-white/80 backdrop-blur-xl p-8 rounded-3xl border border-gray-100 shadow-lg hover:shadow-xl transition-shadow duration-300 space-y-6">
              <div className="flex items-center gap-4 border-b border-gray-100 pb-5">
                <div className="p-3 bg-gradient-to-br from-amber-100 to-orange-50 text-amber-600 rounded-2xl shadow-inner">
                  <Clock className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Trigger & Scheduling</h2>
                  <p className="text-sm text-gray-500">When should the AI auto-dial leads?</p>
                </div>
              </div>
              
              <div className="space-y-5 bg-amber-50/50 p-5 rounded-2xl border border-amber-100/50">
                <Label>Enable Auto-Calling for these Lead Statuses</Label>
                <div className="grid grid-cols-2 gap-3">
                  {leadStatuses.map(status => (
                    <div key={status.value} className="flex items-center space-x-2">
                      <Switch
                        id={`status-${status.value}`}
                        checked={(settings.enabled_statuses || []).includes(status.value)}
                        onCheckedChange={() => toggleStatus(status.value)}
                      />
                      <Label htmlFor={`status-${status.value}`} className="cursor-pointer">{status.label}</Label>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-gray-500 mt-2">When a lead enters one of these statuses, the AI will queue a call.</p>
              </div>

              {/* Lead Filters for Auto-Calling */}
              <div className="space-y-4 bg-amber-50/30 p-5 rounded-2xl border border-amber-100/50">
                <div>
                  <Label className="font-semibold">Lead Filters (Auto-Call Eligibility)</Label>
                  <p className="text-xs text-gray-500 mt-0.5">Only leads matching ALL of these criteria will be auto-called.</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Lead Created From</Label>
                    <Input
                      type="date"
                      value={settings.filter_created_from || ''}
                      onChange={e => setSettings((s: any) => ({ ...s, filter_created_from: e.target.value }))}
                      className="text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Lead Created To</Label>
                    <Input
                      type="date"
                      value={settings.filter_created_to || ''}
                      onChange={e => setSettings((s: any) => ({ ...s, filter_created_to: e.target.value }))}
                      className="text-sm"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Max Calls Per Lead (Retry Limit)</Label>
                  <Input
                    type="number"
                    min={1}
                    max={10}
                    placeholder="e.g. 3"
                    value={settings.max_calls_per_lead || ''}
                    onChange={e => setSettings((s: any) => ({ ...s, max_calls_per_lead: Number(e.target.value) }))}
                    className="text-sm w-32"
                  />
                  <p className="text-xs text-gray-400">Stop calling a lead after this many attempts.</p>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Lead Source Filter (comma-separated)</Label>
                  <Input
                    type="text"
                    placeholder="e.g. facebook,instagram,website"
                    value={settings.filter_sources || ''}
                    onChange={e => setSettings((s: any) => ({ ...s, filter_sources: e.target.value }))}
                    className="text-sm"
                  />
                  <p className="text-xs text-gray-400">Leave blank to call leads from all sources.</p>
                </div>

                <div className="flex items-center gap-3">
                  <Switch
                    id="skip-not-interested"
                    checked={settings.skip_not_interested !== false}
                    onCheckedChange={v => setSettings((s: any) => ({ ...s, skip_not_interested: v }))}
                  />
                  <Label htmlFor="skip-not-interested" className="cursor-pointer text-sm">Skip leads marked as Not Interested</Label>
                </div>

                <div className="flex items-center gap-3">
                  <Switch
                    id="skip-consultation-scheduled"
                    checked={settings.skip_consultation_scheduled !== false}
                    onCheckedChange={v => setSettings((s: any) => ({ ...s, skip_consultation_scheduled: v }))}
                  />
                  <Label htmlFor="skip-consultation-scheduled" className="cursor-pointer text-sm">Skip leads who already have a Consultation Scheduled</Label>
                </div>
              </div>
            </div>

            <Button onClick={handleSaveSettings} disabled={saving} className="w-full">
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save Settings
            </Button>

            {/* ── Eligible Leads Live Overview ── */}
            <div className="bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-100 rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-indigo-800">📊 Live Eligibility Preview</h3>
                  <p className="text-xs text-indigo-500 mt-0.5">How many leads match your current filters right now?</p>
                </div>
                <Button size="sm" variant="outline" onClick={fetchPreview} disabled={previewLoading} className="text-indigo-700 border-indigo-200 hover:bg-indigo-50">
                  {previewLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : '🔍 Preview'}
                </Button>
              </div>

              {preview && (
                <div className="space-y-3">
                  {preview.message && (
                    <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2 border border-amber-100">{preview.message}</p>
                  )}
                  {!preview.message && (
                    <div className="grid grid-cols-3 gap-3">
                      <div className="bg-white rounded-xl border border-indigo-100 p-3 text-center shadow-sm">
                        <p className="text-2xl font-bold text-indigo-700">{preview.total_eligible}</p>
                        <p className="text-[10px] text-gray-500 mt-0.5 font-medium uppercase tracking-wider">Eligible Now</p>
                      </div>
                      <div className="bg-white rounded-xl border border-green-100 p-3 text-center shadow-sm">
                        <p className="text-2xl font-bold text-green-600">{preview.expected_calls_today}</p>
                        <p className="text-[10px] text-gray-500 mt-0.5 font-medium uppercase tracking-wider">Expected Today</p>
                      </div>
                      <div className="bg-white rounded-xl border border-gray-100 p-3 text-center shadow-sm">
                        <p className="text-2xl font-bold text-gray-500">{preview.already_called_today}</p>
                        <p className="text-[10px] text-gray-500 mt-0.5 font-medium uppercase tracking-wider">Already Called</p>
                      </div>
                    </div>
                  )}
                  {preview.status_breakdown && preview.status_breakdown.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Breakdown by Status</p>
                      {preview.status_breakdown.map((s: any) => (
                        <div key={s.status} className="flex items-center justify-between bg-white rounded-lg px-3 py-1.5 border border-gray-100">
                          <span className="text-xs text-gray-600">{s.status.replace(/_/g, ' ')}</span>
                          <span className="text-xs font-bold text-indigo-700 bg-indigo-50 rounded-full px-2 py-0.5">{s.count}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {preview.filter_active && (
                    <p className="text-[10px] text-indigo-400">✅ Active filters applied — showing filtered results only.</p>
                  )}
                </div>
              )}

              {!preview && !previewLoading && (
                <p className="text-xs text-gray-400 text-center py-2">Click Preview to see how many leads will be auto-called based on your current saved settings.</p>
              )}
            </div>
          </div>

          {/* Right Column: Knowledge Base */}
          <div className="bg-white/80 backdrop-blur-xl p-8 rounded-3xl border border-gray-100 shadow-lg hover:shadow-xl transition-shadow duration-300 flex flex-col h-full">
            <div className="flex items-center justify-between border-b border-gray-100 pb-5 mb-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-gradient-to-br from-purple-100 to-pink-50 text-purple-600 rounded-2xl shadow-inner">
                  <Database className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Knowledge Base (RAG)</h2>
                  <p className="text-sm text-gray-500">Company FAQs & rules for the AI to follow.</p>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 min-h-[300px]">
              {kb.length === 0 ? (
                <div className="text-center text-sm text-gray-400 py-10">
                  No knowledge base items yet. Add company FAQs below.
                </div>
              ) : (
                kb.map((item: any) => (
                  <div key={item.id} className="p-4 bg-gray-50 rounded-lg border group relative">
                    <h4 className="font-medium text-sm text-gray-900">{item.title}</h4>
                    <p className="text-xs text-gray-600 mt-1 line-clamp-3">{item.content}</p>
                    <button
                      onClick={() => handleDeleteKb(item.id)}
                      className="absolute top-3 right-3 text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="border-t pt-4 space-y-3">
              <h3 className="text-sm font-medium">Add New Fact</h3>
              <Input placeholder="Title (e.g. Refund Policy)" value={newKbTitle} onChange={e => setNewKbTitle(e.target.value)} />
              <Textarea placeholder="Content..." value={newKbContent} onChange={e => setNewKbContent(e.target.value)} rows={3} />
              <Button onClick={handleAddKb} disabled={addingKb || !newKbTitle || !newKbContent} className="w-full" variant="outline">
                {addingKb ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
                Add to Knowledge Base
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Call Logs Tab ── */}
      {activeTab === 'logs' && (
        <div className="space-y-6">
          {/* Stats row */}
          <div className="grid grid-cols-4 gap-4">
            {[
              { label: 'Total Calls', value: callStats.total_calls, color: 'text-gray-900', bg: 'bg-white' },
              { label: 'Monthly Calls', value: callStats.monthly_calls, color: 'text-blue-700', bg: 'bg-blue-50' },
              { label: 'Today\'s Calls', value: callStats.todays_calls, color: 'text-indigo-700', bg: 'bg-indigo-50' },
              { label: 'Today\'s Picked Up', value: callStats.todays_picked_up, color: 'text-green-700', bg: 'bg-green-50' },
            ].map(s => (
              <div key={s.label} className={`${s.bg} rounded-xl border p-5 shadow-sm`}>
                <p className="text-xs text-gray-500 font-medium">{s.label}</p>
                <p className={`text-3xl font-bold mt-1 ${s.color}`}>{logsLoading ? '—' : s.value}</p>
              </div>
            ))}
          </div>

          {/* Filter Bar */}
          <div className="bg-white border rounded-2xl p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">🔍 Filter Call Logs</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Call Status</label>
                <select
                  className="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  value={logFilters.status_filter}
                  onChange={e => setLogFilters(f => ({ ...f, status_filter: e.target.value }))}
                >
                  <option value="">All Statuses</option>
                  <option value="completed">Completed</option>
                  <option value="no-answer">No Answer</option>
                  <option value="failed">Failed</option>
                  <option value="busy">Busy</option>
                  <option value="ringing">Ringing</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Lead Score</label>
                <select
                  className="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  value={logFilters.score_label}
                  onChange={e => setLogFilters(f => ({ ...f, score_label: e.target.value }))}
                >
                  <option value="">All Scores</option>
                  <option value="Hot">🔥 Hot</option>
                  <option value="Warm">🌡️ Warm</option>
                  <option value="Cold">❄️ Cold</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">CRM Status After</label>
                <select
                  className="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  value={logFilters.crm_status}
                  onChange={e => setLogFilters(f => ({ ...f, crm_status: e.target.value }))}
                >
                  <option value="">All CRM Status</option>
                  <option value="CONTACTED">Contacted</option>
                  <option value="QUALIFIED">Qualified</option>
                  <option value="NOT_INTERESTED">Not Interested</option>
                  <option value="CONSULTATION_SCHEDULED">Consultation Scheduled</option>
                  <option value="CONTACT_ATTEMPTED">Contact Attempted</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">From Date</label>
                <input
                  type="date"
                  className="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  value={logFilters.date_from}
                  onChange={e => setLogFilters(f => ({ ...f, date_from: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">To Date</label>
                <input
                  type="date"
                  className="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  value={logFilters.date_to}
                  onChange={e => setLogFilters(f => ({ ...f, date_to: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex gap-2 mt-3">
              <Button size="sm" onClick={() => fetchCallLogs(1, false, logFilters)} disabled={logsLoading}>
                Apply Filters
              </Button>
              <Button size="sm" variant="outline" onClick={() => {
                const cleared = { status_filter: '', crm_status: '', date_from: '', date_to: '', score_label: '' }
                setLogFilters(cleared)
                fetchCallLogs(1, false, cleared)
              }}>
                Clear
              </Button>
            </div>
          </div>

          {/* Toolbar */}
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Recent Calls</h2>
            <Button variant="outline" size="sm" onClick={() => { fetchCallLogs(logsPage); fetchCallStats(); }} disabled={logsLoading}>
              <RefreshCw className={`w-4 h-4 mr-2 ${logsLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>

          {/* Logs list */}
          {logsLoading ? (
            <div className="flex items-center justify-center py-20 text-gray-400">
              <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading call logs…
            </div>
          ) : callLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400 border rounded-xl bg-white">
              <PhoneCall className="w-10 h-10 mb-3 opacity-30" />
              <p className="text-sm font-medium">No calls recorded yet</p>
              <p className="text-xs mt-1">Trigger an AI call from a lead card to see logs here.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-3">
                {callLogs.map(log => (
                  <CallLogRow key={log.id} log={log} />
                ))}
              </div>
              
              {/* Pagination Controls */}
              <div className="flex items-center justify-between pt-4 border-t">
                <p className="text-xs text-gray-500">
                  Showing {(logsPage - 1) * limit + 1} to {Math.min(logsPage * limit, logsTotal)} of {logsTotal} calls
                </p>
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    disabled={logsPage === 1 || logsLoading}
                    onClick={() => setLogsPage(p => p - 1)}
                  >
                    Previous
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    disabled={logsPage * limit >= logsTotal || logsLoading}
                    onClick={() => setLogsPage(p => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Call Queue Tab ── */}
      {activeTab === 'queue' && (
        <div className="space-y-6">
          {/* Stats row */}
          <div className="grid grid-cols-4 gap-4">
            {[
              { label: 'In Queue (Pending)',  value: callQueue.filter((q: any) => q.status === 'pending').length,     color: 'text-gray-900',   bg: 'bg-white' },
              { label: 'Bot Called',          value: callQueue.filter((q: any) => q.status === 'bot_called').length,  color: 'text-indigo-700', bg: 'bg-indigo-50' },
              { label: 'Picked Up (In Call)', value: callQueue.filter((q: any) => q.status === 'in_call').length,     color: 'text-green-700',  bg: 'bg-green-50' },
              { label: 'Not Picked',          value: callQueue.filter((q: any) => q.status === 'not_picked').length,  color: 'text-red-700',    bg: 'bg-red-50' },
            ].map(s => (
              <div key={s.label} className={`${s.bg} rounded-xl border p-5 shadow-sm`}>
                <p className="text-xs text-gray-500 font-medium">{s.label}</p>
                <p className={`text-3xl font-bold mt-1 ${s.color}`}>{queueLoading ? '—' : s.value}</p>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Call Queue</h2>
              <p className="text-xs text-gray-500 mt-1">Drag pending calls to reorder priority.</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => fetchCallQueue(false)} disabled={queueLoading}>
                <RefreshCw className={`w-4 h-4 mr-2 ${queueLoading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              <Button size="sm" onClick={handleProcessNext} disabled={processingQueue || queueLoading || callQueue.filter((q: any) => q.status === 'pending').length === 0}>
                {processingQueue ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
                Process Next
              </Button>
            </div>
          </div>

          {queueLoading && callQueue.length === 0 ? (
            <div className="flex items-center justify-center py-20 text-gray-400 border rounded-xl bg-white shadow-sm">
              <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading call queue…
            </div>
          ) : callQueue.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400 border rounded-xl bg-white shadow-sm">
              <ListOrdered className="w-10 h-10 mb-3 opacity-30" />
              <p className="text-sm font-medium">No calls in queue</p>
              <p className="text-xs mt-1">Leads triggered for calling will appear here.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Pending Section (draggable) */}
              {callQueue.filter((q: any) => q.status === 'pending').length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5" /> Pending ({callQueue.filter((q: any) => q.status === 'pending').length})
                  </h3>
                  {callQueue.map((item: any, index: number) => item.status === 'pending' && (
                    <div
                      key={item.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, index)}
                      onDragEnter={(e) => handleDragEnter(e, index)}
                      onDragEnd={handleDragEnd}
                      onDragOver={(e) => e.preventDefault()}
                      className={`flex items-center gap-4 p-4 border rounded-xl bg-white shadow-sm transition-all cursor-grab active:cursor-grabbing ${
                        draggedItemIndex === index ? 'opacity-50 scale-[0.99] border-indigo-300' : 'hover:border-indigo-200'
                      }`}
                    >
                      <GripVertical className="w-5 h-5 text-gray-400" />
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-gray-900">{item.leads?.name || 'Unknown'}</span>
                          {item.leads?.phone && <span className="text-xs text-gray-500">{item.leads.phone}</span>}
                          <CrmStatusBadge status={item.leads?.crm_status} />
                        </div>
                        <p className="text-xs text-gray-400 mt-1">
                          Added: {new Date(item.created_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                        </p>
                      </div>
                      <CallStatusBadge status={item.status} />
                    </div>
                  ))}
                </div>
              )}

              {/* Bot Called / In Call / Not Picked History */}
              {callQueue.filter((q: any) => ['bot_called', 'in_call', 'not_picked', 'processing', 'failed'].includes(q.status)).length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-2">
                    <PhoneCall className="w-3.5 h-3.5" /> Call History
                  </h3>
                  {callQueue.filter((q: any) => ['bot_called', 'in_call', 'not_picked', 'processing', 'failed'].includes(q.status)).map((item: any) => (
                    <div
                      key={item.id}
                      className="flex items-center gap-4 p-4 border rounded-xl bg-white shadow-sm"
                    >
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
                        item.status === 'in_call' ? 'bg-green-50' :
                        item.status === 'not_picked' ? 'bg-red-50' :
                        item.status === 'bot_called' ? 'bg-indigo-50' : 'bg-gray-50'
                      }`}>
                        <PhoneCall className={`w-4 h-4 ${
                          item.status === 'in_call' ? 'text-green-600' :
                          item.status === 'not_picked' ? 'text-red-400' :
                          item.status === 'bot_called' ? 'text-indigo-500' : 'text-gray-400'
                        }`} />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-gray-900">{item.leads?.name || 'Unknown'}</span>
                          {item.leads?.phone && <span className="text-xs text-gray-500">{item.leads.phone}</span>}
                          <CrmStatusBadge status={item.leads?.crm_status} />
                        </div>
                        <p className="text-xs text-gray-400 mt-1">
                          {item.called_at
                            ? `Called: ${new Date(item.called_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}`
                            : `Added: ${new Date(item.created_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}`
                          }
                        </p>
                      </div>
                      <CallStatusBadge status={item.status} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
