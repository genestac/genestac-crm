'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Bell, X, CheckCheck, Flame, Thermometer, Snowflake, Phone, PhoneMissed, Calendar, MessageCircle, UserX, TrendingUp, ExternalLink } from 'lucide-react'
import Link from 'next/link'

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'

type NotifType = 'wa_message' | 'lead_scored' | 'call_complete' | 'callback_due' | 'lead_converted' | 'not_interested' | 'abuse_blocked'

interface Notification {
  id: string
  type: NotifType
  title: string
  body?: string
  lead_id?: string
  is_read: boolean
  created_at: string
}

const TYPE_CONFIG: Record<NotifType, { icon: React.ReactNode; color: string; bg: string }> = {
  wa_message:     { icon: <MessageCircle className="w-4 h-4" />, color: 'text-green-600',  bg: 'bg-green-50' },
  lead_scored:    { icon: <TrendingUp className="w-4 h-4" />,    color: 'text-indigo-600', bg: 'bg-indigo-50' },
  call_complete:  { icon: <Phone className="w-4 h-4" />,         color: 'text-blue-600',   bg: 'bg-blue-50' },
  callback_due:   { icon: <Calendar className="w-4 h-4" />,      color: 'text-yellow-600', bg: 'bg-yellow-50' },
  lead_converted: { icon: <Flame className="w-4 h-4" />,         color: 'text-emerald-600',bg: 'bg-emerald-50' },
  not_interested: { icon: <PhoneMissed className="w-4 h-4" />,   color: 'text-gray-500',   bg: 'bg-gray-50' },
  abuse_blocked:  { icon: <UserX className="w-4 h-4" />,         color: 'text-red-600',    bg: 'bg-red-50' },
}

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

async function fetchJSON(path: string, opts?: RequestInit) {
  const r = await fetch(`${BACKEND_URL}${path}`, { credentials: 'include', ...opts })
  if (!r.ok) throw new Error('Request failed')
  return r.json()
}

export function NotificationBell() {
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unread, setUnread] = useState(0)
  const [loading, setLoading] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  // ── Fetch count via SSE ──────────────────────────────────────────────────
  useEffect(() => {
    const es = new EventSource(`${BACKEND_URL}/api/admin/notifications/stream`, { withCredentials: true })
    es.onmessage = (e) => {
      try { setUnread(JSON.parse(e.data).unread ?? 0) } catch { /* ignore */ }
    }
    return () => es.close()
  }, [])

  // ── Close on outside click ───────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // ── Load notifications when panel opens ──────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetchJSON('/api/admin/notifications/?limit=30')
      setNotifications(res.data || [])
      const cnt = await fetchJSON('/api/admin/notifications/unread-count')
      setUnread(cnt.count ?? 0)
    } catch { /* silent */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { if (open) load() }, [open, load])

  const markAllRead = async () => {
    await fetchJSON('/api/admin/notifications/read-all', { method: 'POST' })
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
    setUnread(0)
  }

  const markRead = async (id: string) => {
    await fetchJSON(`/api/admin/notifications/${id}/read`, { method: 'POST' })
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n))
    setUnread(prev => Math.max(0, prev - 1))
  }

  const deleteNotif = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    await fetchJSON(`/api/admin/notifications/${id}`, { method: 'DELETE' })
    setNotifications(prev => prev.filter(n => n.id !== id))
  }

  return (
    <div className="relative" ref={panelRef}>
      {/* ── Bell button ── */}
      <button
        onClick={() => setOpen(o => !o)}
        className="relative p-2 rounded-full hover:bg-muted/80 transition-colors text-muted-foreground hover:text-foreground"
        aria-label="Notifications"
      >
        <Bell className="w-5 h-5" />
        {unread > 0 && (
          <>
            <span className="absolute top-1 right-1 min-w-[18px] h-[18px] bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center ring-2 ring-background px-0.5">
              {unread > 99 ? '99+' : unread}
            </span>
            <span className="absolute top-1 right-1 w-[18px] h-[18px] bg-red-500 rounded-full animate-ping opacity-60" />
          </>
        )}
      </button>

      {/* ── Dropdown panel ── */}
      {open && (
        <div className="absolute right-0 top-12 w-[400px] bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-700 z-50 overflow-hidden animate-in slide-in-from-top-2 fade-in duration-200">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-primary" />
              <span className="font-semibold text-sm">Notifications</span>
              {unread > 0 && (
                <span className="bg-red-100 text-red-600 text-[10px] font-bold px-2 py-0.5 rounded-full">{unread} new</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {unread > 0 && (
                <button
                  onClick={markAllRead}
                  className="flex items-center gap-1 text-[11px] text-primary hover:text-primary/80 font-medium transition-colors"
                >
                  <CheckCheck className="w-3.5 h-3.5" /> Mark all read
                </button>
              )}
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* List */}
          <div className="max-h-[440px] overflow-y-auto divide-y divide-gray-50 dark:divide-gray-800">
            {loading ? (
              <div className="flex items-center justify-center h-24 text-sm text-gray-400">Loading…</div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 gap-2 text-gray-400">
                <Bell className="w-8 h-8 opacity-20" />
                <p className="text-sm">All caught up! 🎉</p>
              </div>
            ) : (
              notifications.map(n => {
                const cfg = TYPE_CONFIG[n.type] ?? TYPE_CONFIG.wa_message
                return (
                  <div
                    key={n.id}
                    onClick={() => !n.is_read && markRead(n.id)}
                    className={`flex items-start gap-3 px-5 py-3.5 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors group relative ${
                      !n.is_read ? 'bg-blue-50/40 dark:bg-blue-900/10' : ''
                    }`}
                  >
                    {/* Unread dot */}
                    {!n.is_read && (
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 w-1.5 h-1.5 bg-blue-500 rounded-full" />
                    )}

                    {/* Icon */}
                    <div className={`shrink-0 p-2 rounded-xl ${cfg.bg} ${cfg.color} mt-0.5`}>
                      {cfg.icon}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm leading-snug ${!n.is_read ? 'font-semibold text-gray-900 dark:text-white' : 'font-medium text-gray-700 dark:text-gray-300'}`}>
                        {n.title}
                      </p>
                      {n.body && (
                        <p className="text-xs text-gray-500 mt-0.5 truncate">{n.body}</p>
                      )}
                      <p className="text-[10px] text-gray-400 mt-1">{timeAgo(n.created_at)}</p>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      {n.lead_id && (
                        <Link href={`/sales/leads?highlight=${n.lead_id}`} onClick={() => setOpen(false)}
                          className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600"
                          title="View lead"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </Link>
                      )}
                      <button
                        onClick={(e) => deleteNotif(n.id, e)}
                        className="p-1 rounded hover:bg-red-100 text-gray-400 hover:text-red-500 transition-colors"
                        title="Dismiss"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )
              })
            )}
          </div>

          {/* Footer */}
          <div className="px-5 py-3 border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/50">
            <p className="text-[10px] text-gray-400 text-center">Notifications are auto-refreshed via live stream</p>
          </div>
        </div>
      )}
    </div>
  )
}
