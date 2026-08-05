'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { Terminal, Circle, Wifi, WifiOff, Trash2, Download, Filter, X, ChevronDown } from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────────────
type LogLevel = 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL'

interface LogEntry {
  id: number
  ts: string
  level: LogLevel
  logger: string
  message: string
}

// ─── Config ──────────────────────────────────────────────────────────────────
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000'
const MAX_DISPLAY = 2000

const LEVEL_STYLES: Record<LogLevel, { badge: string; text: string; dot: string }> = {
  DEBUG:    { badge: 'bg-gray-700 text-gray-300',     text: 'text-gray-400',    dot: 'bg-gray-500'   },
  INFO:     { badge: 'bg-blue-900/60 text-blue-300',  text: 'text-blue-300',    dot: 'bg-blue-400'   },
  WARNING:  { badge: 'bg-yellow-900/60 text-yellow-300', text: 'text-yellow-300', dot: 'bg-yellow-400' },
  ERROR:    { badge: 'bg-red-900/60 text-red-300',    text: 'text-red-400',     dot: 'bg-red-500'    },
  CRITICAL: { badge: 'bg-red-700 text-white',         text: 'text-red-300 font-bold', dot: 'bg-red-600' },
}

const ALL_LEVELS: LogLevel[] = ['DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL']

// ─── Component ───────────────────────────────────────────────────────────────
export function SystemLogsClient() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [connected, setConnected] = useState(false)
  const [autoScroll, setAutoScroll] = useState(true)
  const [search, setSearch] = useState('')
  const [levelFilter, setLevelFilter] = useState<Set<LogLevel>>(new Set(ALL_LEVELS))
  const [loggerFilter, setLoggerFilter] = useState('')
  const [paused, setPaused] = useState(false)
  const [showFilters, setShowFilters] = useState(false)

  const bottomRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const esRef = useRef<EventSource | null>(null)
  const pendingRef = useRef<LogEntry[]>([])
  const pausedRef = useRef(false)

  pausedRef.current = paused

  // ── EventSource connection ────────────────────────────────────────────────
  const connect = useCallback(() => {
    if (esRef.current) {
      esRef.current.close()
    }

    const url = `${BACKEND_URL}/api/admin/system-logs/stream`
    const es = new EventSource(url, { withCredentials: true })
    esRef.current = es

    es.onopen = () => setConnected(true)

    es.onmessage = (e) => {
      if (e.data === '') return
      try {
        const entry: LogEntry = JSON.parse(e.data)
        if (!pausedRef.current) {
          setLogs(prev => {
            const next = [...prev, entry]
            return next.length > MAX_DISPLAY ? next.slice(-MAX_DISPLAY) : next
          })
        } else {
          pendingRef.current.push(entry)
        }
      } catch {
        // ignore parse errors from heartbeat comments
      }
    }

    es.onerror = () => {
      setConnected(false)
      es.close()
      // Reconnect after 3s
      setTimeout(connect, 3000)
    }
  }, [])

  useEffect(() => {
    connect()
    return () => esRef.current?.close()
  }, [connect])

  // ── Resume from pause ─────────────────────────────────────────────────────
  const handleResume = () => {
    if (pendingRef.current.length > 0) {
      setLogs(prev => {
        const next = [...prev, ...pendingRef.current]
        pendingRef.current = []
        return next.length > MAX_DISPLAY ? next.slice(-MAX_DISPLAY) : next
      })
    }
    setPaused(false)
  }

  // ── Auto-scroll ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (autoScroll && !paused) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [logs, autoScroll, paused])

  const handleScroll = () => {
    const el = containerRef.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60
    setAutoScroll(atBottom)
  }

  // ── Filter ────────────────────────────────────────────────────────────────
  const filtered = logs.filter(log => {
    if (!levelFilter.has(log.level as LogLevel)) return false
    if (loggerFilter && !log.logger.toLowerCase().includes(loggerFilter.toLowerCase())) return false
    if (search && !log.message.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const toggleLevel = (level: LogLevel) => {
    setLevelFilter(prev => {
      const next = new Set(prev)
      next.has(level) ? next.delete(level) : next.add(level)
      return next
    })
  }

  // ── Download ──────────────────────────────────────────────────────────────
  const downloadLogs = () => {
    const content = filtered.map(l => `[${l.ts}] [${l.level}] [${l.logger}] ${l.message}`).join('\n')
    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `system-logs-${new Date().toISOString().slice(0, 19)}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ── Unique loggers for filter ─────────────────────────────────────────────
  const uniqueLoggers = [...new Set(logs.map(l => l.logger))].sort()

  // ── Counts ────────────────────────────────────────────────────────────────
  const counts = logs.reduce((acc, l) => {
    acc[l.level as LogLevel] = (acc[l.level as LogLevel] || 0) + 1
    return acc
  }, {} as Record<LogLevel, number>)

  return (
    <div className="flex flex-col h-[calc(100vh-7rem)] bg-[#0d1117] rounded-2xl border border-gray-700/50 overflow-hidden shadow-2xl">

      {/* ── Top bar ── */}
      <div className="flex items-center justify-between px-5 py-3 bg-[#161b22] border-b border-gray-700/60 gap-3 flex-wrap">

        {/* Title */}
        <div className="flex items-center gap-3">
          <div className="p-2 bg-green-900/40 rounded-lg">
            <Terminal className="w-4 h-4 text-green-400" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-white tracking-wide">System Logs</h1>
            <p className="text-[10px] text-gray-500">Live backend output stream</p>
          </div>
          {/* Connection indicator */}
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold border ${
            connected
              ? 'bg-green-900/30 text-green-400 border-green-700/40'
              : 'bg-red-900/30 text-red-400 border-red-700/40'
          }`}>
            {connected
              ? <><Wifi className="w-3 h-3" /> Live</>
              : <><WifiOff className="w-3 h-3" /> Reconnecting…</>
            }
          </div>
        </div>

        {/* Level badges (count summary) */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {ALL_LEVELS.filter(l => counts[l] > 0).map(level => {
            const s = LEVEL_STYLES[level]
            return (
              <button
                key={level}
                onClick={() => toggleLevel(level)}
                className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono transition ${s.badge} ${
                  levelFilter.has(level) ? 'opacity-100' : 'opacity-30'
                }`}
              >
                {level} {counts[level] ?? 0}
              </button>
            )
          })}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFilters(f => !f)}
            className={`flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg border transition ${
              showFilters
                ? 'bg-indigo-900/40 border-indigo-600 text-indigo-300'
                : 'bg-gray-800 border-gray-600 text-gray-400 hover:text-white'
            }`}
          >
            <Filter className="w-3 h-3" /> Filter
          </button>

          {paused ? (
            <button
              onClick={handleResume}
              className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg bg-yellow-700/40 border border-yellow-600 text-yellow-300 hover:bg-yellow-700/60 transition"
            >
              <Circle className="w-2.5 h-2.5 fill-yellow-400" />
              Resume ({pendingRef.current.length})
            </button>
          ) : (
            <button
              onClick={() => setPaused(true)}
              className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-600 text-gray-400 hover:text-white transition"
            >
              <Circle className="w-2.5 h-2.5 fill-gray-400" />
              Pause
            </button>
          )}

          <button
            onClick={downloadLogs}
            className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-600 text-gray-400 hover:text-white transition"
            title="Download filtered logs"
          >
            <Download className="w-3 h-3" />
          </button>

          <button
            onClick={() => setLogs([])}
            className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-600 text-gray-400 hover:text-red-400 transition"
            title="Clear display"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* ── Filter bar ── */}
      {showFilters && (
        <div className="flex items-center gap-3 px-5 py-2.5 bg-[#1a2030] border-b border-gray-700/40 flex-wrap">
          {/* Level toggles */}
          <div className="flex items-center gap-1">
            {ALL_LEVELS.map(level => {
              const s = LEVEL_STYLES[level]
              const active = levelFilter.has(level)
              return (
                <button
                  key={level}
                  onClick={() => toggleLevel(level)}
                  className={`px-2.5 py-1 rounded text-[10px] font-bold transition border ${
                    active ? `${s.badge} border-current/40` : 'bg-gray-800 text-gray-600 border-gray-700'
                  }`}
                >
                  {level}
                </button>
              )
            })}
          </div>

          {/* Search */}
          <div className="relative flex-1 min-w-[180px]">
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search message…"
              className="w-full bg-[#0d1117] border border-gray-700 text-gray-300 text-xs rounded-lg px-3 py-1.5 placeholder-gray-600 outline-none focus:border-indigo-500 font-mono"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Logger filter */}
          <div className="relative min-w-[160px]">
            <select
              value={loggerFilter}
              onChange={e => setLoggerFilter(e.target.value)}
              className="w-full appearance-none bg-[#0d1117] border border-gray-700 text-gray-300 text-xs rounded-lg px-3 py-1.5 outline-none focus:border-indigo-500 font-mono"
            >
              <option value="">All loggers</option>
              {uniqueLoggers.map(l => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-500 pointer-events-none" />
          </div>

          <span className="text-[10px] text-gray-600">{filtered.length} / {logs.length} lines</span>
        </div>
      )}

      {/* ── Log output ── */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto font-mono text-[11px] leading-5 p-3 space-y-0.5 scroll-smooth"
        style={{ scrollbarWidth: 'thin', scrollbarColor: '#30363d transparent' }}
      >
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-600 gap-3">
            <Terminal className="w-10 h-10 opacity-30" />
            <p className="text-sm">{connected ? 'Waiting for logs…' : 'Connecting to log stream…'}</p>
          </div>
        ) : (
          filtered.map((log, i) => {
            const s = LEVEL_STYLES[log.level as LogLevel] ?? LEVEL_STYLES.DEBUG
            const time = new Date(log.ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
            return (
              <div
                key={`${log.id}-${i}`}
                className={`flex items-start gap-2 px-2 py-0.5 rounded hover:bg-white/5 transition-colors group ${
                  log.level === 'ERROR' || log.level === 'CRITICAL' ? 'bg-red-950/20' : ''
                }`}
              >
                {/* Timestamp */}
                <span className="text-gray-600 shrink-0 w-20 select-none">{time}</span>

                {/* Level badge */}
                <span className={`shrink-0 px-1.5 py-px rounded text-[9px] font-bold w-16 text-center ${s.badge}`}>
                  {log.level}
                </span>

                {/* Logger name */}
                <span className="text-gray-600 shrink-0 max-w-[120px] truncate" title={log.logger}>
                  [{log.logger}]
                </span>

                {/* Message */}
                <span className={`flex-1 break-all ${s.text} whitespace-pre-wrap`}>
                  {log.message}
                </span>
              </div>
            )
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* ── Footer status bar ── */}
      <div className="flex items-center justify-between px-5 py-1.5 bg-[#161b22] border-t border-gray-700/60 text-[10px] text-gray-600">
        <span>
          {filtered.length} lines displayed
          {filtered.length !== logs.length && ` (${logs.length} total, ${logs.length - filtered.length} filtered)`}
        </span>
        <div className="flex items-center gap-3">
          {paused && <span className="text-yellow-500 font-semibold">⏸ Paused — {pendingRef.current.length} pending</span>}
          {!autoScroll && !paused && (
            <button
              onClick={() => {
                setAutoScroll(true)
                bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
              }}
              className="text-indigo-400 hover:text-indigo-300 font-semibold"
            >
              ↓ Scroll to bottom
            </button>
          )}
          <span className={connected ? 'text-green-500' : 'text-red-500'}>
            {connected ? '● live' : '● disconnected'}
          </span>
        </div>
      </div>
    </div>
  )
}
