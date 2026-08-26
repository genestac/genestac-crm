'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { toast } from 'sonner'
import {
  Bell, Send, Users, Crown, User, Image as ImageIcon, Upload,
  Megaphone, Tag, Zap, Heart, RefreshCw, Search, Loader2,
  Clock, CheckCircle, AlertCircle, BarChart3, TrendingUp,
  Target, Award, Activity, ChevronRight
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

// All API calls go through the Next.js proxy so they work in production
// without needing NEXT_PUBLIC_API_URL set in the browser.
const PROXY = '/api/proxy/push-notifications'

type NotifType = 'general' | 'offer' | 'health_tip' | 'system_update' | 'reminder'
type TargetType = 'all' | 'subscribers' | 'specific'
type Tab = 'compose' | 'history' | 'analytics'

interface Stats { total_users: number; users_with_tokens: number; subscribers_with_tokens: number }
interface HistoryItem { id: string; title: string; body: string; image_url?: string; type: string; target: string; recipients_count: number; sent_count: number; failed_count: number; open_count?: number; sent_at: string }
interface TargetUser { id: string; name: string; email: string; phone: string }
interface Analytics { overall: any; by_type: any[]; daily_trend: any[]; top_notifications: any[] }

const TYPE_CFG: Record<string, { label: string; icon: any; badge: string; bar: string }> = {
  general:       { label: 'General',       icon: Bell,   badge: 'bg-blue-100 text-blue-700',   bar: 'bg-blue-500' },
  offer:         { label: 'Offer / Promo', icon: Tag,    badge: 'bg-amber-100 text-amber-700', bar: 'bg-amber-500' },
  health_tip:    { label: 'Health Tip',    icon: Heart,  badge: 'bg-green-100 text-green-700', bar: 'bg-green-500' },
  system_update: { label: 'System Update', icon: Zap,    badge: 'bg-purple-100 text-purple-700',bar: 'bg-purple-500' },
  reminder:      { label: 'Reminder',      icon: Clock,  badge: 'bg-orange-100 text-orange-700',bar: 'bg-orange-500' },
}

const SCREENS = [
  { value: '', label: 'No deep link' },
  { value: 'dashboard', label: 'Dashboard' },
  { value: 'ai-doctor-chat', label: 'AI Health Coach' },
  { value: 'profile', label: 'Profile' },
  { value: 'plans', label: 'Plans & Subscriptions' },
  { value: 'daily-log', label: 'Daily Health Log' },
]

function ProgressBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(Math.round((value / max) * 100), 100) : 0
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-muted-foreground w-8 text-right">{pct}%</span>
    </div>
  )
}

export default function PushNotificationsPage() {
  const [activeTab, setActiveTab]         = useState<Tab>('compose')
  const [title, setTitle]                 = useState('')
  const [body, setBody]                   = useState('')
  const [imageUrl, setImageUrl]           = useState('')
  const [type, setType]                   = useState<NotifType>('general')
  const [target, setTarget]               = useState<TargetType>('all')
  const [screen, setScreen]               = useState('')
  const [search, setSearch]               = useState('')
  const [selectedIds, setSelectedIds]     = useState<string[]>([])
  const [allUsers, setAllUsers]           = useState<TargetUser[]>([])
  const [stats, setStats]                 = useState<Stats | null>(null)
  const [history, setHistory]             = useState<HistoryItem[]>([])
  const [analytics, setAnalytics]         = useState<Analytics | null>(null)
  const [sending, setSending]             = useState(false)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [loadingAnalytics, setLoadingAnalytics] = useState(false)
  const imageInputRef = useRef<HTMLInputElement>(null)

  const uploadImage = useCallback(async (file: File) => {
    setUploadingImage(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/proxy/push-notifications/upload-image', { method: 'POST', body: form })
      const data = await res.json()
      if (data.success && data.url) {
        setImageUrl(data.url)
      } else {
        alert('Image upload failed: ' + (data.detail || 'Unknown error'))
      }
    } catch (e) {
      alert('Image upload failed')
    } finally {
      setUploadingImage(false)
    }
  }, [])

  const apiFetch = useCallback(async (path: string, opts?: RequestInit) => {
    // Map backend paths to proxy endpoints
    // GET  /api/admin/push-notifications/stats    → GET  /api/proxy/push-notifications?endpoint=stats
    // POST /api/admin/push-notifications/send     → POST /api/proxy/push-notifications?endpoint=send
    const endpoint = path.split('/').pop() ?? 'stats'
    const method = opts?.method ?? 'GET'
    const url = `${PROXY}?endpoint=${endpoint}`
    const res = await fetch(url, opts ? { ...opts, method } : { method })
    if (!res.ok) throw new Error(`API ${path} returned ${res.status}`)
    return res.json()
  }, [])

  const loadStats = useCallback(async () => {
    try {
      const data = await apiFetch('/api/admin/push-notifications/stats')
      if (data.success) setStats(data)
    } catch (e) { console.warn('[PushNotif] stats error:', e) }
  }, [apiFetch])

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true)
    try {
      const data = await apiFetch('/api/admin/push-notifications/history')
      if (data.success) setHistory(data.data ?? [])
    } catch (e) { console.warn('[PushNotif] history error:', e) }
    setLoadingHistory(false)
  }, [apiFetch])

  const loadAnalytics = useCallback(async () => {
    setLoadingAnalytics(true)
    try {
      const data = await apiFetch('/api/admin/push-notifications/analytics')
      if (data.success) setAnalytics(data)
    } catch (e) { console.warn('[PushNotif] analytics error:', e) }
    setLoadingAnalytics(false)
  }, [apiFetch])

  const loadUsers = useCallback(async () => {
    try {
      const data = await apiFetch('/api/admin/push-notifications/users')
      if (data.success) setAllUsers(data.data ?? [])
    } catch (e) { console.warn('[PushNotif] users error:', e) }
  }, [apiFetch])

  useEffect(() => { loadStats(); loadHistory(); loadUsers() }, [loadStats, loadHistory, loadUsers])
  useEffect(() => { if (activeTab === 'analytics') loadAnalytics() }, [activeTab, loadAnalytics])

  const filteredUsers = allUsers.filter(u =>
    u.name?.toLowerCase().includes(search.toLowerCase()) ||
    u.email?.toLowerCase().includes(search.toLowerCase()) ||
    u.phone?.includes(search)
  )

  const recipientCount = stats
    ? target === 'all' ? stats.users_with_tokens
    : target === 'subscribers' ? stats.subscribers_with_tokens
    : selectedIds.length
    : 0

  const handleSend = async () => {
    if (!title.trim()) { toast.error('Title is required'); return }
    if (!body.trim())  { toast.error('Message body is required'); return }
    if (target === 'specific' && selectedIds.length === 0) { toast.error('Select at least one user'); return }
    setSending(true)
    try {
      const data = await apiFetch('/api/admin/push-notifications/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, body, image_url: imageUrl || undefined, type, target, screen: screen || undefined, user_ids: target === 'specific' ? selectedIds : undefined }),
      })
      if (data.success) {
        toast.success(`Sent to ${data.sent} users${data.failed > 0 ? ` (${data.failed} failed)` : ''}`)
        setTitle(''); setBody(''); setImageUrl(''); setScreen('')
        loadHistory(); loadStats()
      } else {
        toast.error(data.error ?? 'Failed to send notification')
      }
    } catch (e: any) { toast.error(e.message) }
    setSending(false)
  }

  const TypeIcon = TYPE_CFG[type]?.icon ?? Bell

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 flex items-center gap-3">
            <Megaphone className="w-8 h-8 text-violet-600" />
            Push Notifications
          </h1>
          <p className="text-muted-foreground mt-2">Send targeted notifications directly to your mobile app users.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => { loadStats(); loadHistory(); if (activeTab === 'analytics') loadAnalytics() }}>
          <RefreshCw className="w-4 h-4 mr-2" /> Refresh
        </Button>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total App Users',      value: stats?.total_users ?? '—',              icon: Users,  color: 'text-blue-600',   bg: 'bg-blue-50' },
          { label: 'Users with Tokens',    value: stats?.users_with_tokens ?? '—',        icon: Bell,   color: 'text-violet-600', bg: 'bg-violet-50' },
          { label: 'Active Subscribers',   value: stats?.subscribers_with_tokens ?? '—',  icon: Crown,  color: 'text-amber-600',  bg: 'bg-amber-50' },
        ].map(s => (
          <Card key={s.label}>
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">{s.label}</p>
                  <p className="text-3xl font-bold text-gray-900 mt-1">{s.value}</p>
                </div>
                <div className={`w-12 h-12 ${s.bg} rounded-xl flex items-center justify-center`}>
                  <s.icon className={`w-6 h-6 ${s.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        {([
          { id: 'compose',   label: 'Compose',   icon: Send },
          { id: 'history',   label: 'History',   icon: Clock },
          { id: 'analytics', label: 'Analytics', icon: BarChart3 },
        ] as const).map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === t.id ? 'border-violet-600 text-violet-600' : 'border-transparent text-muted-foreground hover:text-gray-900'}`}>
            <t.icon className="w-4 h-4" />{t.label}
          </button>
        ))}
      </div>

      {/* ─── COMPOSE ─── */}
      {activeTab === 'compose' && (
        <div className="grid grid-cols-5 gap-6">
          <div className="col-span-3 space-y-5">
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="text-base flex items-center gap-2"><Send className="w-4 h-4 text-violet-600" />Compose Notification</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">

                {/* Type */}
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">Type</label>
                  <div className="grid grid-cols-5 gap-2">
                    {(Object.keys(TYPE_CFG) as NotifType[]).map(t => {
                      const cfg = TYPE_CFG[t]; const Icon = cfg.icon
                      return (
                        <button key={t} onClick={() => setType(t)}
                          className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all text-xs font-medium ${type === t ? 'border-violet-500 bg-violet-50 text-violet-700' : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'}`}>
                          <Icon className="w-4 h-4" />{cfg.label}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Title */}
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">Title *</label>
                  <input value={title} onChange={e => setTitle(e.target.value)} maxLength={100}
                    placeholder="e.g. 🎉 Special Offer Just for You!"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400 transition-all bg-white" />
                  <p className="text-xs text-muted-foreground mt-1 text-right">{title.length}/100</p>
                </div>

                {/* Body */}
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">Message *</label>
                  <textarea value={body} onChange={e => setBody(e.target.value)} rows={3} maxLength={300}
                    placeholder="Write your notification message here..."
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400 transition-all bg-white resize-none" />
                  <p className="text-xs text-muted-foreground mt-1 text-right">{body.length}/300</p>
                </div>

                {/* Image */}
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1">
                    <ImageIcon className="w-3 h-3" />Image <span className="font-normal normal-case">(optional)</span>
                  </label>
                  <div className="flex gap-2">
                    <input value={imageUrl} onChange={e => setImageUrl(e.target.value)}
                      placeholder="https://cdn.genestac.com/banners/offer.jpg"
                      className="flex-1 border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400 transition-all bg-white" />
                    <button type="button" onClick={() => imageInputRef.current?.click()}
                      disabled={uploadingImage}
                      className="flex items-center gap-1.5 px-3 py-2.5 border border-dashed border-violet-400 rounded-lg text-xs font-semibold text-violet-600 hover:bg-violet-50 transition-all disabled:opacity-50 whitespace-nowrap">
                      {uploadingImage ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                      {uploadingImage ? 'Uploading…' : 'Upload'}
                    </button>
                    <input ref={imageInputRef} type="file" accept="image/*" className="hidden"
                      onChange={e => { const f = e.target.files?.[0]; if (f) uploadImage(f); e.target.value = '' }} />
                  </div>
                  {imageUrl && <img src={imageUrl} alt="preview" className="mt-2 rounded-lg h-24 w-full object-cover border border-gray-200" onError={e => (e.currentTarget.style.display = 'none')} />}
                </div>

                {/* Screen */}
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">Open Screen on Tap</label>
                  <select value={screen} onChange={e => setScreen(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400 transition-all bg-white">
                    {SCREENS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>

                {/* Target */}
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">Send To</label>
                  <div className="grid grid-cols-3 gap-3">
                    {([
                      { key: 'all',         label: 'All Users',       icon: Users, count: stats?.users_with_tokens },
                      { key: 'subscribers', label: 'Subscribers Only', icon: Crown, count: stats?.subscribers_with_tokens },
                      { key: 'specific',    label: 'Specific Users',   icon: User,  count: selectedIds.length },
                    ] as const).map(t => (
                      <button key={t.key} onClick={() => setTarget(t.key)}
                        className={`flex flex-col items-start gap-1 p-4 rounded-xl border-2 transition-all ${target === t.key ? 'border-violet-500 bg-violet-50 text-violet-700' : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'}`}>
                        <t.icon className="w-4 h-4" />
                        <span className="text-xs font-semibold">{t.label}</span>
                        <span className="text-xs text-muted-foreground">{t.count ?? '...'} users</span>
                      </button>
                    ))}
                  </div>
                </div>


                <Button onClick={handleSend} disabled={sending || !title.trim() || !body.trim()} className="w-full bg-violet-600 hover:bg-violet-700 text-white">
                  {sending ? <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />Sending...</>
                           : <><Send className="w-4 h-4 mr-2" />Send to {recipientCount} users</>}
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Right Panel: Phone Preview or Specific User Picker */}
          <div className="col-span-2">
            {target === 'specific' ? (
              <Card className="sticky top-6">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2"><User className="w-4 h-4 text-violet-600" />Select Recipients</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input value={search} onChange={e => setSearch(e.target.value)}
                      placeholder="Search by name, email or phone..."
                      className="w-full border border-gray-200 rounded-lg pl-9 pr-4 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400" />
                  </div>
                  <div className="max-h-96 overflow-y-auto space-y-1 rounded-xl bg-gray-50 border border-gray-200 p-2">
                    {filteredUsers.length === 0 ? (
                      <p className="text-muted-foreground text-sm text-center py-8">No users found</p>
                    ) : (
                      filteredUsers.map(u => (
                        <label key={u.id} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-white cursor-pointer transition-colors">
                          <input type="checkbox" checked={selectedIds.includes(u.id)}
                            onChange={e => setSelectedIds(p => e.target.checked ? [...p, u.id] : p.filter(id => id !== u.id))}
                            className="w-4 h-4 accent-violet-600 shrink-0" />
                          <div className="min-w-0">
                            <p className="text-sm text-gray-900 font-medium truncate">{u.name || 'Unknown'}</p>
                            <p className="text-xs text-muted-foreground truncate">{u.email || u.phone}</p>
                          </div>
                        </label>
                      ))
                    )}
                  </div>
                  {selectedIds.length > 0 ? (
                    <div className="flex items-center justify-between p-3 bg-violet-50 rounded-xl border border-violet-200">
                      <p className="text-sm text-violet-700 font-semibold">{selectedIds.length} user{selectedIds.length !== 1 ? 's' : ''} selected</p>
                      <button onClick={() => setSelectedIds([])} className="text-xs text-violet-500 hover:text-violet-700 underline">Clear all</button>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground text-center py-1">Select users to send to</p>
                  )}
                </CardContent>
              </Card>
            ) : (
              <Card className="sticky top-6">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2"><Bell className="w-4 h-4 text-violet-600" />Phone Preview</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="bg-gray-100 rounded-2xl p-4 border border-gray-200">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shrink-0">
                        <span className="text-white text-xs font-bold">G</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-gray-500 mb-1">Genestac · now</p>
                        <p className="text-gray-900 text-sm font-semibold leading-snug">{title || 'Notification Title'}</p>
                        <p className="text-gray-600 text-xs mt-1 leading-relaxed">{body || 'Your message will appear here...'}</p>
                        {imageUrl && <img src={imageUrl} alt="" className="mt-2 rounded-lg w-full h-28 object-cover" onError={e => (e.currentTarget.style.display = 'none')} />}
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Badge className={TYPE_CFG[type]?.badge ?? ''}>{TYPE_CFG[type]?.label}</Badge>
                    {screen && <Badge variant="outline">→ {SCREENS.find(s => s.value === screen)?.label}</Badge>}
                    <Badge variant="outline">{target === 'all' ? 'All users' : 'Subscribers'}</Badge>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}

      {/* ─── HISTORY ─── */}
      {activeTab === 'history' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><Clock className="w-4 h-4 text-violet-600" />Sent Notifications</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loadingHistory ? (
              <div className="p-6 space-y-3">{[1,2,3].map(i => <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />)}</div>
            ) : history.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground"><Bell className="w-10 h-10 mx-auto mb-3 opacity-30" /><p>No notifications sent yet</p></div>
            ) : (
              <div className="divide-y divide-gray-100">
                {history.map((n, i) => {
                  const cfg = TYPE_CFG[n.type] ?? TYPE_CFG.general; const Icon = cfg.icon
                  const openRate = (n.open_count ?? 0) > 0 && n.sent_count > 0 ? Math.round((n.open_count! / n.sent_count) * 100) : 0
                  const delivRate = n.sent_count > 0 && n.recipients_count > 0 ? Math.round((n.sent_count / n.recipients_count) * 100) : 0
                  return (
                    <div key={n.id ?? i} className="p-5 hover:bg-gray-50 transition-colors">
                      <div className="flex items-start gap-4">
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${cfg.badge.replace('text-', 'text-').replace('bg-', 'bg-')}`}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <p className="font-semibold text-gray-900">{n.title}</p>
                              <p className="text-sm text-muted-foreground mt-0.5 line-clamp-1">{n.body}</p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-xs text-muted-foreground">{new Date(n.sent_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
                              <Badge className={`mt-1 ${cfg.badge}`}>{cfg.label}</Badge>
                            </div>
                          </div>
                          <div className="grid grid-cols-4 gap-4 mt-3">
                            {[
                              { l: 'Recipients', v: n.recipients_count, c: 'text-gray-900' },
                              { l: 'Delivered',  v: n.sent_count,        c: 'text-green-600' },
                              { l: 'Failed',     v: n.failed_count,      c: n.failed_count > 0 ? 'text-red-600' : 'text-gray-400' },
                              { l: 'Opened',     v: n.open_count ?? '—', c: 'text-violet-600' },
                            ].map(s => (
                              <div key={s.l}><p className="text-xs text-muted-foreground">{s.l}</p><p className={`text-lg font-bold ${s.c}`}>{s.v}</p></div>
                            ))}
                          </div>
                          <div className="grid grid-cols-2 gap-3 mt-3">
                            <div><p className="text-xs text-muted-foreground mb-1">Delivery rate</p><ProgressBar value={delivRate} max={100} color="bg-green-500" /></div>
                            <div><p className="text-xs text-muted-foreground mb-1">Open rate</p><ProgressBar value={openRate} max={100} color="bg-violet-500" /></div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ─── ANALYTICS ─── */}
      {activeTab === 'analytics' && (
        <div className="space-y-6">
          {loadingAnalytics ? (
            <div className="grid grid-cols-4 gap-4">{[1,2,3,4].map(i => <div key={i} className="h-28 bg-gray-100 rounded-xl animate-pulse" />)}</div>
          ) : !analytics ? (
            <div className="text-center py-16 text-muted-foreground"><BarChart3 className="w-10 h-10 mx-auto mb-3 opacity-30" /><p>No analytics data yet — send some notifications first.</p></div>
          ) : (
            <>
              {/* KPIs */}
              <div className="grid grid-cols-4 gap-4">
                {[
                  { l: 'Sent',        v: analytics.overall.total_notifications_sent, icon: Send,         c: 'text-blue-600',   bg: 'bg-blue-50' },
                  { l: 'Recipients',  v: (analytics.overall.total_recipients ?? 0).toLocaleString(), icon: Users, c: 'text-violet-600', bg: 'bg-violet-50' },
                  { l: 'Delivered',   v: (analytics.overall.total_delivered ?? 0).toLocaleString(),  icon: CheckCircle, c: 'text-green-600', bg: 'bg-green-50' },
                  { l: 'Opens',       v: (analytics.overall.total_opened ?? 0).toLocaleString(),     icon: Activity, c: 'text-amber-600',  bg: 'bg-amber-50' },
                ].map(s => (
                  <Card key={s.l}><CardContent className="p-5">
                    <div className="flex items-start justify-between">
                      <div><p className="text-sm font-medium text-muted-foreground">{s.l}</p><p className="text-3xl font-bold text-gray-900 mt-1">{s.v}</p></div>
                      <div className={`w-10 h-10 ${s.bg} rounded-xl flex items-center justify-center`}><s.icon className={`w-5 h-5 ${s.c}`} /></div>
                    </div>
                  </CardContent></Card>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-6">
                {/* Rates */}
                <Card>
                  <CardHeader><CardTitle className="text-base flex items-center gap-2"><TrendingUp className="w-4 h-4 text-violet-600" />Delivery & Open Rates</CardTitle></CardHeader>
                  <CardContent className="space-y-5">
                    <div>
                      <div className="flex justify-between text-sm mb-2"><span className="text-muted-foreground">Delivery Rate</span><span className="font-bold text-gray-900">{analytics.overall.delivery_rate}%</span></div>
                      <ProgressBar value={analytics.overall.delivery_rate} max={100} color="bg-green-500" />
                    </div>
                    <div>
                      <div className="flex justify-between text-sm mb-2"><span className="text-muted-foreground">Open Rate</span><span className="font-bold text-gray-900">{analytics.overall.open_rate}%</span></div>
                      <ProgressBar value={analytics.overall.open_rate} max={100} color="bg-violet-500" />
                    </div>
                    <div className="pt-3 border-t border-gray-100 grid grid-cols-2 gap-4">
                      <div><p className="text-xs text-muted-foreground">Failed</p><p className="text-xl font-bold text-red-600">{analytics.overall.total_failed}</p></div>
                      <div><p className="text-xs text-muted-foreground">Success Rate</p><p className="text-xl font-bold text-green-600">{analytics.overall.delivery_rate}%</p></div>
                    </div>
                  </CardContent>
                </Card>

                {/* By type */}
                <Card>
                  <CardHeader><CardTitle className="text-base flex items-center gap-2"><Target className="w-4 h-4 text-violet-600" />By Notification Type</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                    {analytics.by_type.length === 0
                      ? <p className="text-muted-foreground text-sm text-center py-4">No data yet</p>
                      : analytics.by_type.map(t => {
                          const cfg = TYPE_CFG[t.type] ?? TYPE_CFG.general; const Icon = cfg.icon
                          return (
                            <div key={t.type}>
                              <div className="flex items-center justify-between mb-1.5">
                                <div className="flex items-center gap-2">
                                  <Badge className={cfg.badge}><Icon className="w-3 h-3 mr-1" />{cfg.label}</Badge>
                                </div>
                                <span className="text-sm font-semibold text-gray-900">{t.count} sent</span>
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <div><p className="text-xs text-muted-foreground mb-1">Delivered</p><ProgressBar value={t.delivered} max={Math.max(...analytics.by_type.map((x: any) => x.delivered), 1)} color={cfg.bar} /></div>
                                <div><p className="text-xs text-muted-foreground mb-1">Open rate</p><ProgressBar value={t.open_rate} max={100} color="bg-violet-500" /></div>
                              </div>
                            </div>
                          )
                        })}
                  </CardContent>
                </Card>
              </div>

              {/* Daily Trend */}
              <Card>
                <CardHeader><CardTitle className="text-base flex items-center gap-2"><BarChart3 className="w-4 h-4 text-violet-600" />Daily Trend — Last 30 Days</CardTitle></CardHeader>
                <CardContent>
                  {analytics.daily_trend.length === 0
                    ? <p className="text-muted-foreground text-sm text-center py-8">No trend data yet</p>
                    : <>
                        <div className="flex items-end gap-1 h-40 mb-2">
                          {analytics.daily_trend.map((d: any, i: number) => {
                            const max = Math.max(...analytics.daily_trend.map((x: any) => x.delivered), 1)
                            const h = Math.round((d.delivered / max) * 100)
                            const hOpen = Math.round(((d.opened ?? 0) / max) * 100)
                            return (
                              <div key={i} className="flex-1 flex flex-col items-center gap-0.5 group relative">
                                <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-gray-900 text-white rounded-md px-2 py-1 text-xs opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                                  {d.date}: {d.delivered} sent, {d.opened ?? 0} opened
                                </div>
                                {hOpen > 0 && <div className="w-full rounded-sm bg-violet-400" style={{ height: `${hOpen}%`, minHeight: '2px' }} />}
                                <div className="w-full rounded-sm bg-green-300 hover:bg-green-400 transition-colors cursor-pointer" style={{ height: `${h}%`, minHeight: '4px' }} />
                                {i % 5 === 0 && <span className="text-gray-400 text-[9px] rotate-45 origin-left translate-y-2">{d.date.slice(5)}</span>}
                              </div>
                            )
                          })}
                        </div>
                        <div className="flex items-center gap-4 mt-4 pt-2 border-t border-gray-100">
                          <div className="flex items-center gap-1.5"><div className="w-3 h-2 rounded-sm bg-green-300" /><span className="text-xs text-muted-foreground">Delivered</span></div>
                          <div className="flex items-center gap-1.5"><div className="w-3 h-2 rounded-sm bg-violet-400" /><span className="text-xs text-muted-foreground">Opened</span></div>
                        </div>
                      </>
                  }
                </CardContent>
              </Card>

              {/* Top performers */}
              <Card>
                <CardHeader><CardTitle className="text-base flex items-center gap-2"><Award className="w-4 h-4 text-amber-500" />Top Performing Notifications</CardTitle></CardHeader>
                <CardContent>
                  {analytics.top_notifications.length === 0
                    ? <div className="text-center py-8 text-muted-foreground"><Award className="w-8 h-8 mx-auto mb-2 opacity-30" /><p className="text-sm">Send notifications to see top performers</p></div>
                    : <div className="space-y-3">
                        {analytics.top_notifications.map((n: any, i: number) => (
                          <div key={n.id ?? i} className="flex items-center gap-4 p-4 bg-gray-50 rounded-xl border border-gray-200">
                            <div className="w-8 h-8 rounded-lg bg-amber-100 border border-amber-200 flex items-center justify-center shrink-0">
                              <span className="text-amber-600 text-sm font-bold">#{i+1}</span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-gray-900 truncate">{n.title}</p>
                              <p className="text-xs text-muted-foreground">{n.delivered} delivered · {n.opened} opened</p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-2xl font-bold text-violet-600">{n.open_rate}%</p>
                              <p className="text-xs text-muted-foreground">open rate</p>
                            </div>
                          </div>
                        ))}
                      </div>
                  }
                </CardContent>
              </Card>
            </>
          )}
        </div>
      )}
    </div>
  )
}
