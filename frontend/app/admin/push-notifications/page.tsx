'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Bell, Send, Users, Crown, User, Image as ImageIcon,
  Megaphone, Tag, Zap, Shield, Heart, RefreshCw, Search,
  Clock, CheckCircle, AlertCircle, BarChart3, TrendingUp,
  Target, Award, ChevronUp, ChevronDown, Activity
} from 'lucide-react'

const CRM_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.genestac.com'

type NotificationType = 'general' | 'offer' | 'health_tip' | 'system_update' | 'reminder'
type TargetType = 'all' | 'subscribers' | 'specific'
type Tab = 'compose' | 'history' | 'analytics'

interface NotificationHistory {
  id: string
  title: string
  body: string
  image_url?: string
  type: NotificationType
  target: string
  recipients_count: number
  sent_count: number
  failed_count: number
  open_count?: number
  sent_at: string
}

interface Stats {
  total_users: number
  users_with_tokens: number
  subscribers_with_tokens: number
}

interface Analytics {
  overall: {
    total_notifications_sent: number
    total_recipients: number
    total_delivered: number
    total_failed: number
    total_opened: number
    delivery_rate: number
    open_rate: number
  }
  by_type: Array<{ type: string; count: number; delivered: number; opened: number; open_rate: number; delivery_rate: number; recipients: number }>
  daily_trend: Array<{ date: string; sent: number; delivered: number; opened: number }>
  top_notifications: Array<{ id: string; title: string; type: string; recipients: number; delivered: number; opened: number; open_rate: number; sent_at: string }>
}

interface TargetUser {
  id: string
  name: string
  email: string
  phone: string
}

const TYPE_CONFIG: Record<string, { label: string; icon: any; color: string; bg: string; bar: string }> = {
  general: { label: 'General', icon: Bell, color: 'text-blue-400', bg: 'bg-blue-500/15 border-blue-500/30', bar: 'bg-blue-500' },
  offer: { label: 'Offer / Promo', icon: Tag, color: 'text-amber-400', bg: 'bg-amber-500/15 border-amber-500/30', bar: 'bg-amber-500' },
  health_tip: { label: 'Health Tip', icon: Heart, color: 'text-emerald-400', bg: 'bg-emerald-500/15 border-emerald-500/30', bar: 'bg-emerald-500' },
  system_update: { label: 'System Update', icon: Zap, color: 'text-purple-400', bg: 'bg-purple-500/15 border-purple-500/30', bar: 'bg-purple-500' },
  reminder: { label: 'Reminder', icon: Clock, color: 'text-orange-400', bg: 'bg-orange-500/15 border-orange-500/30', bar: 'bg-orange-500' },
}

const SCREEN_OPTIONS = [
  { value: '', label: 'No deep link' },
  { value: 'dashboard', label: 'Dashboard' },
  { value: 'ai-doctor-chat', label: 'AI Health Coach Chat' },
  { value: 'profile', label: 'Profile' },
  { value: 'plans', label: 'Plans & Subscriptions' },
  { value: 'daily-log', label: 'Daily Health Log' },
]

function MiniBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-zinc-700/60 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-zinc-500 w-8 text-right">{pct}%</span>
    </div>
  )
}

function RateCircle({ value, label, color }: { value: number; label: string; color: string }) {
  const r = 36
  const circ = 2 * Math.PI * r
  const offset = circ - (value / 100) * circ
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-24 h-24">
        <svg className="w-24 h-24 -rotate-90" viewBox="0 0 96 96">
          <circle cx="48" cy="48" r={r} fill="none" stroke="#27272a" strokeWidth="8" />
          <circle cx="48" cy="48" r={r} fill="none" stroke="currentColor"
            strokeWidth="8" strokeDasharray={circ} strokeDashoffset={offset}
            strokeLinecap="round" className={color} />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xl font-bold text-white">{value}%</span>
        </div>
      </div>
      <p className="text-xs text-zinc-400 font-medium">{label}</p>
    </div>
  )
}

export default function PushNotificationsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('compose')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [type, setType] = useState<NotificationType>('general')
  const [target, setTarget] = useState<TargetType>('all')
  const [screen, setScreen] = useState('')
  const [specificSearch, setSpecificSearch] = useState('')
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([])
  const [allUsers, setAllUsers] = useState<TargetUser[]>([])

  const [stats, setStats] = useState<Stats | null>(null)
  const [history, setHistory] = useState<NotificationHistory[]>([])
  const [analytics, setAnalytics] = useState<Analytics | null>(null)
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null)
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [loadingAnalytics, setLoadingAnalytics] = useState(false)

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`${CRM_URL}/api/admin/push-notifications/stats`)
      const data = await res.json()
      if (data.success) setStats(data)
    } catch { }
  }, [])

  const fetchHistory = useCallback(async () => {
    setLoadingHistory(true)
    try {
      const res = await fetch(`${CRM_URL}/api/admin/push-notifications/history`)
      const data = await res.json()
      if (data.success) setHistory(data.data)
    } catch { }
    setLoadingHistory(false)
  }, [])

  const fetchAnalytics = useCallback(async () => {
    setLoadingAnalytics(true)
    try {
      const res = await fetch(`${CRM_URL}/api/admin/push-notifications/analytics`)
      const data = await res.json()
      if (data.success) setAnalytics(data)
    } catch { }
    setLoadingAnalytics(false)
  }, [])

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch(`${CRM_URL}/api/admin/push-notifications/users`)
      const data = await res.json()
      if (data.success) setAllUsers(data.data)
    } catch { }
  }, [])

  useEffect(() => {
    fetchStats(); fetchHistory(); fetchUsers()
  }, [fetchStats, fetchHistory, fetchUsers])

  useEffect(() => {
    if (activeTab === 'analytics') fetchAnalytics()
  }, [activeTab, fetchAnalytics])

  const filteredUsers = allUsers.filter(u =>
    u.name?.toLowerCase().includes(specificSearch.toLowerCase()) ||
    u.email?.toLowerCase().includes(specificSearch.toLowerCase()) ||
    u.phone?.includes(specificSearch)
  )

  const recipientCount = () => {
    if (target === 'all') return stats?.users_with_tokens ?? 0
    if (target === 'subscribers') return stats?.subscribers_with_tokens ?? 0
    return selectedUserIds.length
  }

  const handleSend = async () => {
    if (!title.trim() || !body.trim()) { setResult({ success: false, message: 'Title and body are required.' }); return }
    if (target === 'specific' && selectedUserIds.length === 0) { setResult({ success: false, message: 'Select at least one user.' }); return }
    setSending(true); setResult(null)
    try {
      const res = await fetch(`${CRM_URL}/api/admin/push-notifications/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, body, image_url: imageUrl || undefined, type, target, screen: screen || undefined, user_ids: target === 'specific' ? selectedUserIds : undefined }),
      })
      const data = await res.json()
      if (data.success) {
        setResult({ success: true, message: `✅ Sent to ${data.sent} users (${data.failed} failed)` })
        fetchHistory(); fetchStats()
      } else {
        setResult({ success: false, message: data.error || 'Failed to send' })
      }
    } catch (e: any) { setResult({ success: false, message: e.message }) }
    setSending(false)
  }

  const maxDelivered = Math.max(...(analytics?.by_type.map(t => t.delivered) || [1]), 1)

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white p-6">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-500/30">
              <Megaphone className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Push Notifications</h1>
              <p className="text-zinc-400 text-sm">Reach your mobile users directly</p>
            </div>
          </div>
          <button onClick={() => { fetchStats(); fetchHistory(); if (activeTab === 'analytics') fetchAnalytics() }}
            className="flex items-center gap-2 px-4 py-2 bg-zinc-800/60 border border-zinc-700/50 rounded-xl text-zinc-300 hover:bg-zinc-700/60 transition-all text-sm">
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
        </div>

        {/* Stats Row */}
        {stats && (
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Total App Users', value: stats.total_users, icon: Users, grad: 'from-blue-500/20 to-blue-600/5', ic: 'text-blue-400' },
              { label: 'Users with Tokens', value: stats.users_with_tokens, icon: Bell, grad: 'from-violet-500/20 to-violet-600/5', ic: 'text-violet-400' },
              { label: 'Active Subscribers', value: stats.subscribers_with_tokens, icon: Crown, grad: 'from-amber-500/20 to-amber-600/5', ic: 'text-amber-400' },
            ].map(s => (
              <div key={s.label} className={`bg-gradient-to-br ${s.grad} border border-white/5 rounded-2xl p-5`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-zinc-400 text-xs font-medium uppercase tracking-wider">{s.label}</p>
                    <p className="text-3xl font-bold text-white mt-1">{s.value}</p>
                  </div>
                  <div className={`w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center ${s.ic}`}>
                    <s.icon className="w-6 h-6" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div className="flex items-center gap-1 bg-zinc-900/60 border border-zinc-800/60 rounded-2xl p-1 w-fit">
          {([
            { id: 'compose', label: 'Compose', icon: Send },
            { id: 'history', label: 'History', icon: Clock },
            { id: 'analytics', label: 'Analytics', icon: BarChart3 },
          ] as const).map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all ${activeTab === t.id ? 'bg-violet-600 text-white shadow-lg shadow-violet-500/25' : 'text-zinc-400 hover:text-white'}`}>
              <t.icon className="w-4 h-4" /> {t.label}
            </button>
          ))}
        </div>

        {/* ── COMPOSE TAB ── */}
        {activeTab === 'compose' && (
          <div className="grid grid-cols-5 gap-6">
            <div className="col-span-3 bg-zinc-900/60 border border-zinc-800/60 rounded-2xl p-6 space-y-5">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2"><Send className="w-4 h-4 text-violet-400" /> Compose</h2>

              {/* Type */}
              <div>
                <label className="text-xs text-zinc-400 uppercase tracking-wider mb-2 block">Type</label>
                <div className="grid grid-cols-5 gap-2">
                  {(Object.keys(TYPE_CONFIG) as NotificationType[]).map(t => {
                    const cfg = TYPE_CONFIG[t]; const Icon = cfg.icon
                    return (
                      <button key={t} onClick={() => setType(t)}
                        className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all ${type === t ? `border ${cfg.bg} ${cfg.color}` : 'border-zinc-700/50 bg-zinc-800/30 text-zinc-500 hover:border-zinc-600'}`}>
                        <Icon className="w-4 h-4" /><span className="text-xs font-medium leading-none">{cfg.label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Title */}
              <div>
                <label className="text-xs text-zinc-400 uppercase tracking-wider mb-2 block">Title *</label>
                <input value={title} onChange={e => setTitle(e.target.value)} maxLength={100}
                  placeholder="e.g. 🎉 Special Offer Just for You!"
                  className="w-full bg-zinc-800/50 border border-zinc-700/60 rounded-xl px-4 py-3 text-white placeholder:text-zinc-500 focus:outline-none focus:border-violet-500/60 transition-all text-sm" />
                <p className="text-xs text-zinc-600 mt-1 text-right">{title.length}/100</p>
              </div>

              {/* Body */}
              <div>
                <label className="text-xs text-zinc-400 uppercase tracking-wider mb-2 block">Message *</label>
                <textarea value={body} onChange={e => setBody(e.target.value)} rows={3} maxLength={300}
                  placeholder="Write your message here..."
                  className="w-full bg-zinc-800/50 border border-zinc-700/60 rounded-xl px-4 py-3 text-white placeholder:text-zinc-500 focus:outline-none focus:border-violet-500/60 transition-all text-sm resize-none" />
                <p className="text-xs text-zinc-600 mt-1 text-right">{body.length}/300</p>
              </div>

              {/* Image URL */}
              <div>
                <label className="text-xs text-zinc-400 uppercase tracking-wider mb-2 block flex items-center gap-1"><ImageIcon className="w-3 h-3" /> Image URL <span className="text-zinc-600 normal-case">(optional, shows below message)</span></label>
                <input value={imageUrl} onChange={e => setImageUrl(e.target.value)}
                  placeholder="https://cdn.genestac.com/banners/offer.jpg"
                  className="w-full bg-zinc-800/50 border border-zinc-700/60 rounded-xl px-4 py-3 text-white placeholder:text-zinc-500 focus:outline-none focus:border-violet-500/60 transition-all text-sm" />
                {imageUrl && <img src={imageUrl} alt="preview" className="mt-2 rounded-lg h-24 object-cover border border-zinc-700/50 w-full" onError={e => (e.currentTarget.style.display = 'none')} />}
              </div>

              {/* Screen */}
              <div>
                <label className="text-xs text-zinc-400 uppercase tracking-wider mb-2 block">Open Screen on Tap</label>
                <select value={screen} onChange={e => setScreen(e.target.value)}
                  className="w-full bg-zinc-800/50 border border-zinc-700/60 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-violet-500/60 transition-all text-sm">
                  {SCREEN_OPTIONS.map(o => <option key={o.value} value={o.value} className="bg-zinc-900">{o.label}</option>)}
                </select>
              </div>

              {/* Target */}
              <div>
                <label className="text-xs text-zinc-400 uppercase tracking-wider mb-2 block">Send To</label>
                <div className="grid grid-cols-3 gap-3">
                  {[{ key: 'all', label: 'All Users', icon: Users, count: stats?.users_with_tokens },
                    { key: 'subscribers', label: 'Subscribers', icon: Crown, count: stats?.subscribers_with_tokens },
                    { key: 'specific', label: 'Specific Users', icon: User, count: selectedUserIds.length || undefined }
                  ].map(t => (
                    <button key={t.key} onClick={() => setTarget(t.key as TargetType)}
                      className={`flex flex-col items-start gap-1 p-4 rounded-xl border transition-all ${target === t.key ? 'bg-violet-500/15 border-violet-500/40 text-violet-300' : 'border-zinc-700/50 bg-zinc-800/30 text-zinc-400 hover:border-zinc-600'}`}>
                      <t.icon className="w-4 h-4" />
                      <span className="text-xs font-semibold">{t.label}</span>
                      {t.count !== undefined && <span className="text-xs text-zinc-500">{t.count} users</span>}
                    </button>
                  ))}
                </div>
              </div>

              {/* User Picker */}
              {target === 'specific' && (
                <div className="bg-zinc-800/30 border border-zinc-700/40 rounded-xl p-4">
                  <div className="relative mb-3">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                    <input value={specificSearch} onChange={e => setSpecificSearch(e.target.value)}
                      placeholder="Search by name, email or phone..."
                      className="w-full bg-zinc-800/60 border border-zinc-700/50 rounded-lg pl-9 pr-4 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-violet-500/50" />
                  </div>
                  <div className="max-h-48 overflow-y-auto space-y-1">
                    {filteredUsers.slice(0, 20).map(u => (
                      <label key={u.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-zinc-700/30 cursor-pointer">
                        <input type="checkbox" checked={selectedUserIds.includes(u.id)}
                          onChange={e => setSelectedUserIds(prev => e.target.checked ? [...prev, u.id] : prev.filter(id => id !== u.id))}
                          className="w-4 h-4 accent-violet-500" />
                        <div><p className="text-sm text-white font-medium">{u.name || 'Unknown'}</p><p className="text-xs text-zinc-500">{u.email || u.phone}</p></div>
                      </label>
                    ))}
                    {filteredUsers.length === 0 && <p className="text-zinc-500 text-sm text-center py-4">No users found</p>}
                  </div>
                  {selectedUserIds.length > 0 && <p className="text-xs text-violet-400 mt-2 pt-2 border-t border-zinc-700/40">{selectedUserIds.length} user{selectedUserIds.length !== 1 ? 's' : ''} selected</p>}
                </div>
              )}

              {result && (
                <div className={`p-4 rounded-xl flex items-start gap-3 ${result.success ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300' : 'bg-red-500/10 border border-red-500/30 text-red-300'}`}>
                  {result.success ? <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" /> : <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />}
                  <span className="text-sm">{result.message}</span>
                </div>
              )}

              <button onClick={handleSend} disabled={sending || !title.trim() || !body.trim()}
                className="w-full py-3.5 rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white shadow-lg shadow-violet-500/25 disabled:opacity-50 disabled:cursor-not-allowed">
                {sending ? <><RefreshCw className="w-4 h-4 animate-spin" /> Sending...</> : <><Send className="w-4 h-4" /> Send to {recipientCount()} users</>}
              </button>
            </div>

            {/* Preview */}
            <div className="col-span-2">
              <div className="bg-zinc-900/60 border border-zinc-800/60 rounded-2xl p-5 sticky top-6">
                <h3 className="text-sm font-semibold text-zinc-300 mb-4 flex items-center gap-2"><Bell className="w-4 h-4 text-violet-400" /> Phone Preview</h3>
                <div className="bg-zinc-800/80 border border-zinc-700/50 rounded-2xl p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shrink-0">
                      <span className="text-white text-xs font-bold">G</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-zinc-400 mb-1">Genestac · now</p>
                      <p className="text-white text-sm font-semibold">{title || 'Notification Title'}</p>
                      <p className="text-zinc-400 text-xs mt-1 leading-relaxed">{body || 'Your message will appear here...'}</p>
                      {imageUrl && <img src={imageUrl} alt="" className="mt-2 rounded-lg w-full h-28 object-cover" onError={e => (e.currentTarget.style.display = 'none')} />}
                    </div>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {TYPE_CONFIG[type] && <span className={`text-xs px-2 py-1 rounded-full border ${TYPE_CONFIG[type].bg} ${TYPE_CONFIG[type].color}`}>{TYPE_CONFIG[type].label}</span>}
                  {screen && <span className="text-xs px-2 py-1 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-400">→ {screen}</span>}
                  <span className="text-xs px-2 py-1 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-400">{target === 'all' ? 'All users' : target === 'subscribers' ? 'Subscribers' : `${selectedUserIds.length} users`}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── HISTORY TAB ── */}
        {activeTab === 'history' && (
          <div className="bg-zinc-900/60 border border-zinc-800/60 rounded-2xl overflow-hidden">
            <div className="p-6 border-b border-zinc-800/60">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2"><Clock className="w-4 h-4 text-violet-400" /> Sent Notifications</h2>
            </div>
            {loadingHistory ? (
              <div className="p-6 space-y-3">{[1, 2, 3, 4].map(i => <div key={i} className="h-20 bg-zinc-800/40 rounded-xl animate-pulse" />)}</div>
            ) : history.length === 0 ? (
              <div className="text-center py-16 text-zinc-600"><Bell className="w-10 h-10 mx-auto mb-3 opacity-30" /><p>No notifications sent yet</p></div>
            ) : (
              <div className="divide-y divide-zinc-800/40">
                {history.map((n, i) => {
                  const cfg = TYPE_CONFIG[n.type] || TYPE_CONFIG.general; const Icon = cfg.icon
                  const openRate = n.open_count && n.sent_count ? Math.round(n.open_count / n.sent_count * 100) : 0
                  const deliveryRate = n.sent_count && n.recipients_count ? Math.round(n.sent_count / n.recipients_count * 100) : 0
                  return (
                    <div key={n.id || i} className="p-5 hover:bg-zinc-800/20 transition-colors">
                      <div className="flex items-start gap-4">
                        <div className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${cfg.bg}`}>
                          <Icon className={`w-5 h-5 ${cfg.color}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <p className="font-semibold text-white">{n.title}</p>
                              <p className="text-sm text-zinc-400 mt-0.5 line-clamp-1">{n.body}</p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-xs text-zinc-500">{new Date(n.sent_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
                              <span className={`text-xs px-2 py-0.5 rounded-full border mt-1 inline-block ${cfg.bg} ${cfg.color}`}>{cfg.label}</span>
                            </div>
                          </div>
                          <div className="grid grid-cols-4 gap-4 mt-3">
                            {[
                              { label: 'Recipients', value: n.recipients_count, color: 'text-zinc-300' },
                              { label: 'Delivered', value: n.sent_count, color: 'text-emerald-400' },
                              { label: 'Failed', value: n.failed_count, color: n.failed_count > 0 ? 'text-red-400' : 'text-zinc-600' },
                              { label: 'Opened', value: n.open_count ?? '—', color: 'text-violet-400' },
                            ].map(s => (
                              <div key={s.label}>
                                <p className="text-xs text-zinc-600">{s.label}</p>
                                <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
                              </div>
                            ))}
                          </div>
                          <div className="grid grid-cols-2 gap-3 mt-3">
                            <div><p className="text-xs text-zinc-600 mb-1">Delivery Rate</p><MiniBar value={deliveryRate} max={100} color="bg-emerald-500" /></div>
                            <div><p className="text-xs text-zinc-600 mb-1">Open Rate</p><MiniBar value={openRate} max={100} color="bg-violet-500" /></div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ── ANALYTICS TAB ── */}
        {activeTab === 'analytics' && (
          <div className="space-y-6">
            {loadingAnalytics ? (
              <div className="grid grid-cols-3 gap-4">{[1, 2, 3, 4, 5, 6].map(i => <div key={i} className="h-32 bg-zinc-900/60 border border-zinc-800/60 rounded-2xl animate-pulse" />)}</div>
            ) : !analytics ? (
              <div className="text-center py-16 text-zinc-600"><BarChart3 className="w-10 h-10 mx-auto mb-3 opacity-30" /><p>No analytics data available yet</p></div>
            ) : (
              <>
                {/* Overall KPIs */}
                <div className="grid grid-cols-4 gap-4">
                  {[
                    { label: 'Notifications Sent', value: analytics.overall.total_notifications_sent, icon: Send, color: 'text-blue-400', grad: 'from-blue-500/15' },
                    { label: 'Total Recipients', value: analytics.overall.total_recipients.toLocaleString(), icon: Users, color: 'text-violet-400', grad: 'from-violet-500/15' },
                    { label: 'Total Delivered', value: analytics.overall.total_delivered.toLocaleString(), icon: CheckCircle, color: 'text-emerald-400', grad: 'from-emerald-500/15' },
                    { label: 'Total Opens', value: analytics.overall.total_opened.toLocaleString(), icon: Activity, color: 'text-amber-400', grad: 'from-amber-500/15' },
                  ].map(s => (
                    <div key={s.label} className={`bg-gradient-to-br ${s.grad} to-transparent border border-white/5 rounded-2xl p-5`}>
                      <div className="flex items-start justify-between">
                        <div><p className="text-xs text-zinc-400 uppercase tracking-wider">{s.label}</p><p className="text-3xl font-bold text-white mt-1">{s.value}</p></div>
                        <s.icon className={`w-6 h-6 ${s.color} mt-1`} />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Rate Circles + Daily Trend */}
                <div className="grid grid-cols-5 gap-6">
                  {/* Rate circles */}
                  <div className="col-span-2 bg-zinc-900/60 border border-zinc-800/60 rounded-2xl p-6">
                    <h3 className="text-sm font-semibold text-zinc-300 mb-6 flex items-center gap-2"><TrendingUp className="w-4 h-4 text-violet-400" /> Rates</h3>
                    <div className="flex items-center justify-around">
                      <RateCircle value={analytics.overall.delivery_rate} label="Delivery Rate" color="text-emerald-400" />
                      <RateCircle value={analytics.overall.open_rate} label="Open Rate" color="text-violet-400" />
                    </div>
                    <div className="mt-6 space-y-3">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-zinc-400">Failed deliveries</span>
                        <span className="text-red-400 font-semibold">{analytics.overall.total_failed.toLocaleString()}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-zinc-400">Success rate</span>
                        <span className="text-emerald-400 font-semibold">{analytics.overall.delivery_rate}%</span>
                      </div>
                    </div>
                  </div>

                  {/* Daily trend chart */}
                  <div className="col-span-3 bg-zinc-900/60 border border-zinc-800/60 rounded-2xl p-6">
                    <h3 className="text-sm font-semibold text-zinc-300 mb-4 flex items-center gap-2"><BarChart3 className="w-4 h-4 text-violet-400" /> Daily Trend (last 30 days)</h3>
                    {analytics.daily_trend.length === 0 ? (
                      <div className="flex items-center justify-center h-32 text-zinc-600 text-sm">No trend data yet</div>
                    ) : (
                      <div className="flex items-end gap-1 h-36">
                        {analytics.daily_trend.map((d, i) => {
                          const maxVal = Math.max(...analytics.daily_trend.map(x => x.delivered), 1)
                          const height = Math.round((d.delivered / maxVal) * 100)
                          return (
                            <div key={i} className="flex-1 flex flex-col items-center gap-1 group relative">
                              <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1 text-xs text-white opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                                {d.date}: {d.delivered} sent, {d.opened} opened
                              </div>
                              <div className="w-full flex flex-col items-center gap-0.5">
                                {d.opened > 0 && <div className="w-full rounded-sm bg-violet-500/70" style={{ height: `${Math.round((d.opened / maxVal) * 100)}%`, minHeight: '2px' }} />}
                                <div className="w-full rounded-sm bg-emerald-500/50 hover:bg-emerald-500/80 transition-colors cursor-pointer" style={{ height: `${height}%`, minHeight: '4px' }} />
                              </div>
                              {i % 5 === 0 && <span className="text-zinc-600 text-[9px] rotate-45">{d.date.slice(5)}</span>}
                            </div>
                          )
                        })}
                      </div>
                    )}
                    <div className="flex items-center gap-4 mt-2">
                      <div className="flex items-center gap-1.5"><div className="w-3 h-2 rounded-sm bg-emerald-500/50" /><span className="text-xs text-zinc-500">Delivered</span></div>
                      <div className="flex items-center gap-1.5"><div className="w-3 h-2 rounded-sm bg-violet-500/70" /><span className="text-xs text-zinc-500">Opened</span></div>
                    </div>
                  </div>
                </div>

                {/* By type + Top performers */}
                <div className="grid grid-cols-2 gap-6">
                  {/* By type */}
                  <div className="bg-zinc-900/60 border border-zinc-800/60 rounded-2xl p-6">
                    <h3 className="text-sm font-semibold text-zinc-300 mb-5 flex items-center gap-2"><Target className="w-4 h-4 text-violet-400" /> Performance by Type</h3>
                    <div className="space-y-4">
                      {analytics.by_type.map(t => {
                        const cfg = TYPE_CONFIG[t.type] || TYPE_CONFIG.general; const Icon = cfg.icon
                        return (
                          <div key={t.type}>
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <div className={`w-7 h-7 rounded-lg border flex items-center justify-center ${cfg.bg}`}><Icon className={`w-3.5 h-3.5 ${cfg.color}`} /></div>
                                <span className="text-sm text-white font-medium">{cfg.label}</span>
                              </div>
                              <div className="text-right">
                                <span className="text-sm font-bold text-white">{t.count}</span>
                                <span className="text-xs text-zinc-500 ml-1">sent</span>
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div><p className="text-xs text-zinc-600 mb-1">Delivery</p><MiniBar value={t.delivered} max={maxDelivered} color={cfg.bar} /></div>
                              <div><p className="text-xs text-zinc-600 mb-1">Open rate</p><MiniBar value={t.open_rate} max={100} color="bg-violet-500" /></div>
                            </div>
                          </div>
                        )
                      })}
                      {analytics.by_type.length === 0 && <p className="text-zinc-600 text-sm text-center py-4">No data yet</p>}
                    </div>
                  </div>

                  {/* Top performers */}
                  <div className="bg-zinc-900/60 border border-zinc-800/60 rounded-2xl p-6">
                    <h3 className="text-sm font-semibold text-zinc-300 mb-5 flex items-center gap-2"><Award className="w-4 h-4 text-amber-400" /> Top Performing Notifications</h3>
                    <div className="space-y-3">
                      {analytics.top_notifications.map((n, i) => {
                        const cfg = TYPE_CONFIG[n.type] || TYPE_CONFIG.general
                        return (
                          <div key={n.id || i} className="flex items-center gap-3 p-3 bg-zinc-800/40 rounded-xl border border-zinc-700/40">
                            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-500/30 to-amber-600/20 border border-amber-500/30 flex items-center justify-center shrink-0">
                              <span className="text-amber-400 text-xs font-bold">#{i + 1}</span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-white font-medium truncate">{n.title}</p>
                              <p className="text-xs text-zinc-500">{n.delivered} delivered · {n.opened} opened</p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-lg font-bold text-violet-400">{n.open_rate}%</p>
                              <p className="text-xs text-zinc-600">open rate</p>
                            </div>
                          </div>
                        )
                      })}
                      {analytics.top_notifications.length === 0 && (
                        <div className="text-center py-8 text-zinc-600"><Award className="w-8 h-8 mx-auto mb-2 opacity-30" /><p className="text-sm">Send some notifications to see top performers</p></div>
                      )}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
