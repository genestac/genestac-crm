'use client'

import { useState, useEffect, useCallback } from 'react'
import { CalendarClock, Flame, Thermometer, Snowflake, Phone, RefreshCw, Clock, AlertCircle, CheckCircle } from 'lucide-react'

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'

interface ScheduledCall {
  id: string
  name: string
  phone: string
  status: string
  scheduled_at: string
  is_overdue: boolean
  score_label: string | null
  score: number | null
  source: string
  table: string
}

function ScoreBadge({ label, score }: { label: string | null; score: number | null }) {
  if (!label) return <span className="text-gray-400 text-xs">—</span>
  const cfg =
    label === 'hot'  ? { icon: <Flame className="w-3 h-3" />,       cls: 'bg-red-100 text-red-700 border-red-200' } :
    label === 'warm' ? { icon: <Thermometer className="w-3 h-3" />, cls: 'bg-yellow-100 text-yellow-700 border-yellow-200' } :
                       { icon: <Snowflake className="w-3 h-3" />,   cls: 'bg-blue-100 text-blue-700 border-blue-200' }
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${cfg.cls}`}>
      {cfg.icon} {label.toUpperCase()} {score != null ? `· ${score}` : ''}
    </span>
  )
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleString('en-IN', {
    dateStyle: 'medium', timeStyle: 'short'
  })
}

function timeFromNow(iso: string) {
  const diff = new Date(iso).getTime() - Date.now()
  const abs = Math.abs(diff)
  const m = Math.floor(abs / 60000)
  const h = Math.floor(m / 60)
  const d = Math.floor(h / 24)
  const label = d > 0 ? `${d}d ${h % 24}h` : h > 0 ? `${h}h ${m % 60}m` : `${m}m`
  return diff < 0 ? `${label} overdue` : `in ${label}`
}

export default function ScheduledCallsPage() {
  const [calls, setCalls] = useState<ScheduledCall[]>([])
  const [loading, setLoading] = useState(true)
  const [callingId, setCallingId] = useState<string | null>(null)
  const [callResult, setCallResult] = useState<Record<string, 'success' | 'error'>>({})

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/sales/scheduled-calls/`, { credentials: 'include' })
      const data = await res.json()
      setCalls(data.data || [])
    } catch { /* silent */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    load()
    const iv = setInterval(load, 30000)
    return () => clearInterval(iv)
  }, [load])

  const handleCall = async (call: ScheduledCall) => {
    setCallingId(call.id)
    try {
      const res = await fetch(`${BACKEND_URL}/api/sales/leads/${call.id}/trigger-ai-call`, {
        method: 'POST', credentials: 'include'
      })
      const data = await res.json()
      setCallResult(prev => ({ ...prev, [call.id]: data.success ? 'success' : 'error' }))
      setTimeout(() => setCallResult(prev => { const n = { ...prev }; delete n[call.id]; return n }), 3000)
    } catch {
      setCallResult(prev => ({ ...prev, [call.id]: 'error' }))
    } finally {
      setCallingId(null)
    }
  }

  const overdue = calls.filter(c => c.is_overdue)
  const upcoming = calls.filter(c => !c.is_overdue)

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-100 rounded-xl">
            <CalendarClock className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Scheduled Calls</h1>
            <p className="text-sm text-gray-500">
              {calls.length} pending · {overdue.length} overdue
            </p>
          </div>
        </div>
        <button
          onClick={() => { setLoading(true); load() }}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 px-3 py-1.5 rounded-lg border border-gray-200 hover:border-gray-300 transition bg-white"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {loading && calls.length === 0 ? (
        <div className="flex items-center justify-center h-48 text-gray-400">
          <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Loading…
        </div>
      ) : calls.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 bg-white rounded-2xl border border-gray-100 shadow-sm gap-3 text-gray-400">
          <CalendarClock className="w-10 h-10 opacity-30" />
          <p className="text-sm">No scheduled callbacks right now. 🎉</p>
        </div>
      ) : (
        <>
          {/* Overdue section */}
          {overdue.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <AlertCircle className="w-4 h-4 text-red-500" />
                <h2 className="text-sm font-semibold text-red-600">Overdue ({overdue.length})</h2>
              </div>
              <div className="space-y-2">
                {overdue.map(c => <CallRow key={c.id} call={c} onCall={handleCall} callingId={callingId} callResult={callResult} />)}
              </div>
            </section>
          )}

          {/* Upcoming section */}
          {upcoming.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <Clock className="w-4 h-4 text-blue-500" />
                <h2 className="text-sm font-semibold text-blue-600">Upcoming ({upcoming.length})</h2>
              </div>
              <div className="space-y-2">
                {upcoming.map(c => <CallRow key={c.id} call={c} onCall={handleCall} callingId={callingId} callResult={callResult} />)}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}

function CallRow({ call, onCall, callingId, callResult }: {
  call: ScheduledCall
  onCall: (c: ScheduledCall) => void
  callingId: string | null
  callResult: Record<string, 'success' | 'error'>
}) {
  const result = callResult[call.id]
  return (
    <div className={`flex items-center gap-4 bg-white rounded-xl border px-5 py-4 shadow-sm hover:shadow-md transition-shadow ${call.is_overdue ? 'border-red-200' : 'border-gray-100'}`}>
      {/* Avatar */}
      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
        call.is_overdue ? 'bg-red-100 text-red-600' : 'bg-indigo-100 text-indigo-600'
      }`}>
        {(call.name || '?')[0].toUpperCase()}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-gray-900 text-sm">{call.name}</span>
          <ScoreBadge label={call.score_label} score={call.score} />
        </div>
        <div className="flex items-center gap-3 mt-0.5 flex-wrap">
          <span className="text-xs text-gray-500">{call.phone}</span>
          <span className="text-xs text-gray-400">·</span>
          <span className="text-xs text-gray-500">{call.status.replace(/_/g, ' ')}</span>
        </div>
      </div>

      {/* Time */}
      <div className="text-right shrink-0">
        <p className={`text-xs font-semibold ${call.is_overdue ? 'text-red-600' : 'text-indigo-600'}`}>
          {timeFromNow(call.scheduled_at)}
        </p>
        <p className="text-[10px] text-gray-400 mt-0.5">{formatTime(call.scheduled_at)}</p>
      </div>

      {/* Call button */}
      <div className="shrink-0">
        {result === 'success' ? (
          <span className="flex items-center gap-1 text-xs text-green-600 font-semibold px-3 py-1.5 bg-green-50 rounded-lg">
            <CheckCircle className="w-3.5 h-3.5" /> Called!
          </span>
        ) : result === 'error' ? (
          <span className="flex items-center gap-1 text-xs text-red-600 font-semibold px-3 py-1.5 bg-red-50 rounded-lg">
            Failed
          </span>
        ) : (
          <button
            onClick={() => onCall(call)}
            disabled={callingId === call.id}
            className="flex items-center gap-1.5 text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-3 py-1.5 rounded-lg transition disabled:opacity-50"
          >
            {callingId === call.id ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Phone className="w-3.5 h-3.5" />
            )}
            Call Now
          </button>
        )}
      </div>
    </div>
  )
}
