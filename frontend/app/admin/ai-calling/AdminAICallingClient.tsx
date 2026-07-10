'use client'

import { useState, useEffect, useCallback } from 'react'
import { updateAISettings, addKnowledgeBaseItem, deleteKnowledgeBaseItem, getCallLogs, getCallQueue, updateCallQueue, processNextCall } from '../actions'
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
    completed:          { label: 'Completed',  className: 'bg-green-50 text-green-700 border-green-200',  icon: <CheckCircle2 className="w-3 h-3" /> },
    ringing:            { label: 'Ringing',    className: 'bg-blue-50 text-blue-700 border-blue-200',    icon: <PhoneCall className="w-3 h-3 animate-pulse" /> },
    failed_to_initiate: { label: 'Failed',     className: 'bg-red-50 text-red-700 border-red-200',       icon: <XCircle className="w-3 h-3" /> },
    no_answer:          { label: 'No Answer',  className: 'bg-yellow-50 text-yellow-700 border-yellow-200', icon: <PhoneMissed className="w-3 h-3" /> },
    busy:               { label: 'Busy',       className: 'bg-orange-50 text-orange-700 border-orange-200', icon: <PhoneOff className="w-3 h-3" /> },
  }
  const s = map[status] ?? { label: status, className: 'bg-gray-50 text-gray-600 border-gray-200', icon: null }
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border ${s.className}`}>
      {s.icon}{s.label}
    </span>
  )
}

// ─── Single call log row ─────────────────────────────────────────────────────
function CallLogRow({ log }: { log: any }) {
  const [open, setOpen] = useState(false)
  const date = new Date(log.created_at).toLocaleString('en-IN', {
    dateStyle: 'medium', timeStyle: 'short'
  })
  const leadName = log.leads?.name ?? 'Unknown'
  const leadPhone = log.leads?.phone ?? ''

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
          <p className="text-xs text-gray-400 mt-0.5">{date}</p>
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
              <p className="text-sm text-gray-700">{log.summary}</p>
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
          {log.transcript ? (
            <div>
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Transcript</h4>
              <div className="rounded-lg bg-white border p-4 max-h-64 overflow-y-auto space-y-2 font-mono text-xs text-gray-700">
                {log.transcript.split('\n').filter(Boolean).map((line: string, i: number) => {
                  const isUser = line.toLowerCase().startsWith('user:')
                  return (
                    <div key={i} className={`flex gap-2 ${isUser ? 'justify-end' : 'justify-start'}`}>
                      <span className={`px-3 py-1.5 rounded-xl max-w-[80%] break-words ${
                        isUser ? 'bg-indigo-100 text-indigo-800' : 'bg-gray-100 text-gray-800'
                      }`}>
                        {line}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            <p className="text-xs text-gray-400 italic">No transcript recorded for this call.</p>
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

  // Call logs state
  const [callLogs, setCallLogs] = useState<any[]>([])
  const [logsLoading, setLogsLoading] = useState(false)

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

  const fetchCallLogs = useCallback(async () => {
    setLogsLoading(true)
    try {
      const logs = await getCallLogs()
      setCallLogs(logs)
    } catch {
      toast.error('Failed to load call logs')
    } finally {
      setLogsLoading(false)
    }
  }, [])

  const fetchCallQueue = useCallback(async () => {
    setQueueLoading(true)
    try {
      const queue = await getCallQueue()
      setCallQueue(queue)
    } catch {
      toast.error('Failed to load call queue')
    } finally {
      setQueueLoading(false)
    }
  }, [])

  useEffect(() => {
    if (activeTab === 'logs') fetchCallLogs()
    if (activeTab === 'queue') fetchCallQueue()
  }, [activeTab, fetchCallLogs, fetchCallQueue])

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
      const enabled = prev.enabled_statuses.includes(statusValue)
      return {
        ...prev,
        enabled_statuses: enabled
          ? prev.enabled_statuses.filter((s: string) => s !== statusValue)
          : [...prev.enabled_statuses, statusValue]
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
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">AI Voice Calling</h1>
        <p className="text-muted-foreground mt-2">
          Configure automated calls, AI instructions, knowledge base, and view call logs.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        {[
          { id: 'settings', label: 'Settings & Knowledge Base', icon: <Bot className="w-4 h-4" /> },
          { id: 'logs', label: 'Call Logs', icon: <PhoneCall className="w-4 h-4" /> },
          { id: 'queue', label: 'Call Queue', icon: <ListOrdered className="w-4 h-4" /> },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === tab.id
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.icon}{tab.label}
          </button>
        ))}
      </div>

      {/* ── Settings Tab ── */}
      {activeTab === 'settings' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left Column: Settings & Prompt */}
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-xl border shadow-sm space-y-6">
              <div className="flex items-center gap-3 border-b pb-4">
                <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                  <Bot className="w-5 h-5" />
                </div>
                <h2 className="text-lg font-semibold">AI Agent Configuration</h2>
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
                  rows={8}
                  placeholder="You are an AI sales agent for..."
                />
                <p className="text-xs text-gray-500">Provide the personality, goal, and rules for the AI here. Dynamic RAG context (lead name, past summary) is automatically injected.</p>
              </div>
            </div>

            <div className="bg-white p-6 rounded-xl border shadow-sm space-y-6">
              <div className="flex items-center gap-3 border-b pb-4">
                <div className="p-2 bg-amber-50 text-amber-600 rounded-lg">
                  <Clock className="w-5 h-5" />
                </div>
                <h2 className="text-lg font-semibold">Trigger & Scheduling</h2>
              </div>

              <div className="space-y-4">
                <Label>Enable Auto-Calling for these Lead Statuses</Label>
                <div className="grid grid-cols-2 gap-3">
                  {leadStatuses.map(status => (
                    <div key={status.value} className="flex items-center space-x-2">
                      <Switch
                        id={`status-${status.value}`}
                        checked={settings.enabled_statuses.includes(status.value)}
                        onCheckedChange={() => toggleStatus(status.value)}
                      />
                      <Label htmlFor={`status-${status.value}`} className="cursor-pointer">{status.label}</Label>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-gray-500 mt-2">When a lead enters one of these statuses, the AI will queue a call.</p>
              </div>
            </div>

            <Button onClick={handleSaveSettings} disabled={saving} className="w-full">
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save Settings
            </Button>
          </div>

          {/* Right Column: Knowledge Base */}
          <div className="bg-white p-6 rounded-xl border shadow-sm space-y-6 flex flex-col">
            <div className="flex items-center justify-between border-b pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-50 text-purple-600 rounded-lg">
                  <Database className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold">Knowledge Base (RAG)</h2>
                  <p className="text-xs text-gray-500">Data the AI can search during calls.</p>
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
              { label: 'Total Calls',  value: totalCount,     color: 'text-gray-900',   bg: 'bg-white' },
              { label: 'Completed',    value: completedCount, color: 'text-green-700',  bg: 'bg-green-50' },
              { label: 'Failed',       value: failedCount,    color: 'text-red-700',    bg: 'bg-red-50' },
              { label: '🔥 Hot Leads', value: hotCount,       color: 'text-orange-700', bg: 'bg-orange-50' },
            ].map(s => (
              <div key={s.label} className={`${s.bg} rounded-xl border p-5 shadow-sm`}>
                <p className="text-xs text-gray-500 font-medium">{s.label}</p>
                <p className={`text-3xl font-bold mt-1 ${s.color}`}>{logsLoading ? '—' : s.value}</p>
              </div>
            ))}
          </div>

          {/* Toolbar */}
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Recent Calls</h2>
            <Button variant="outline" size="sm" onClick={fetchCallLogs} disabled={logsLoading}>
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
            <div className="space-y-3">
              {callLogs.map(log => (
                <CallLogRow key={log.id} log={log} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Call Queue Tab ── */}
      {activeTab === 'queue' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Upcoming Calls</h2>
              <p className="text-xs text-gray-500 mt-1">Drag and drop to reorder the call priority.</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={fetchCallQueue} disabled={queueLoading}>
                <RefreshCw className={`w-4 h-4 mr-2 ${queueLoading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              <Button size="sm" onClick={handleProcessNext} disabled={processingQueue || queueLoading || callQueue.length === 0}>
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
            <div className="space-y-2">
              {callQueue.map((item, index) => (
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
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-gray-900">{item.leads?.name || 'Unknown'}</span>
                      {item.leads?.phone && <span className="text-xs text-gray-500">{item.leads.phone}</span>}
                    </div>
                    <p className="text-xs text-gray-400 mt-1">
                      Added: {new Date(item.created_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                    </p>
                  </div>
                  <div className="flex-shrink-0">
                    <CallStatusBadge status={item.status} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
