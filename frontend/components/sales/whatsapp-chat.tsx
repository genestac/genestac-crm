'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Loader2, Send, Bot, User, CheckCheck, Trash2, Pencil, Check, X, Phone, ShieldOff, ShieldAlert, Flame, Thermometer, Snowflake, RefreshCw, ExternalLink, ChevronsUp } from 'lucide-react'
import {
  getWhatsappChats,
  sendWhatsappChat,
  resumeWhatsappBot,
  deleteWhatsappMessage,
  deleteAllWhatsappMessages,
  renameWhatsappLead,
  triggerAICall,
  unblockWhatsappLead,
} from '@/app/sales/actions'
import { UserManagementSheet } from '@/components/sales/user-management-sheet'

export function WhatsappChat({ leadId, leadName: initialLeadName, showManageButton = false }: { leadId: string; leadName?: string; showManageButton?: boolean }) {
  const [messages, setMessages] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [hasOlderMessages, setHasOlderMessages] = useState(false)
  const [oldestTs, setOldestTs] = useState<string | null>(null)
  const [inputText, setInputText] = useState('')
  const [sending, setSending] = useState(false)
  const [isBlocked, setIsBlocked] = useState(false)
  const [abuseStrikes, setAbuseStrikes] = useState(0)
  const [scoreLabel, setScoreLabel] = useState<string | null>(null)
  const [scoreValue, setScoreValue] = useState<number | null>(null)
  const [rescoring, setRescoring] = useState(false)

  // Manage sheet
  const [manageLead, setManageLead] = useState<any | null>(null)
  const [manageLoading, setManageLoading] = useState(false)
  const [manageOpen, setManageOpen] = useState(false)

  const fetchAndOpenManage = async () => {
    if (manageLead) { setManageOpen(true); return }
    setManageLoading(true)
    try {
      const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'
      let res = await fetch(`${BACKEND_URL}/api/sales/leads/${leadId}`, { credentials: 'include' })
      if (!res.ok) res = await fetch(`${BACKEND_URL}/api/admin/leads/${leadId}`, { credentials: 'include' })
      if (res.ok) {
        const data = await res.json()
        setManageLead(data.data || data)
        setManageOpen(true)
      }
    } catch { /* silent */ }
    finally { setManageLoading(false) }
  }

  // Per-message delete
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  // Name editing
  const [leadName, setLeadName] = useState(initialLeadName || 'Lead')
  const [editingName, setEditingName] = useState(false)
  const [nameInput, setNameInput] = useState(leadName)
  const [savingName, setSavingName] = useState(false)
  const nameInputRef = useRef<HTMLInputElement>(null)

  // Header button states
  type BtnState = null | 'confirm' | 'loading' | 'success' | 'error'
  const [callState, setCallState] = useState<BtnState>(null)
  const [clearState, setClearState] = useState<BtnState>(null)
  const [botState, setBotState] = useState<BtnState>(null)
  const [unblockState, setUnblockState] = useState<BtnState>(null)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesTopRef = useRef<HTMLDivElement>(null)  // sentinel for loading older msgs
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const prevMessageCountRef = useRef<number>(0)

  const autoDismiss = (setter: (v: BtnState) => void) =>
    setTimeout(() => setter(null), 2500)

  /** Returns 'Today', 'Yesterday', or a locale date string for date separators */
  const getDateLabel = (isoString: string): string => {
    const msgDate   = new Date(isoString)
    const today     = new Date()
    const yesterday = new Date()
    yesterday.setDate(today.getDate() - 1)
    const sameDay = (a: Date, b: Date) =>
      a.getFullYear() === b.getFullYear() &&
      a.getMonth()    === b.getMonth()    &&
      a.getDate()     === b.getDate()
    if (sameDay(msgDate, today))     return 'Today'
    if (sameDay(msgDate, yesterday)) return 'Yesterday'
    return msgDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
  }

  // Initial fetch — newest 50 messages
  const fetchChats = useCallback(async () => {
    try {
      const res = await getWhatsappChats(leadId)
      if (res?.data) {
        setMessages(res.data)
        setHasOlderMessages(!!res.has_more)
        setOldestTs(res.oldest_timestamp || null)
        setIsBlocked(!!res.is_blocked)
        setAbuseStrikes(res.abuse_strikes ?? 0)
        setScoreLabel(res.score_label ?? null)
        setScoreValue(res.score ?? null)
      }
    } catch (e) {
      console.error('Failed to fetch WA chat:', e)
    } finally {
      setLoading(false)
    }
  }, [leadId])

  // Poll for new messages only — merge at bottom, don't reload all history
  const pollNewMessages = useCallback(async () => {
    try {
      const res = await getWhatsappChats(leadId)
      if (res?.data) {
        setMessages(prev => {
          const existingIds = new Set(prev.map((m: any) => m.id))
          const newMsgs = res.data.filter((m: any) => !existingIds.has(m.id))
          if (newMsgs.length === 0) return prev
          return [...prev, ...newMsgs]
        })
        setIsBlocked(!!res.is_blocked)
      }
    } catch { /* silent */ }
  }, [leadId])

  useEffect(() => {
    setMessages([])
    setHasOlderMessages(false)
    setOldestTs(null)
    setLoading(true)
    fetchChats()
  }, [leadId])

  useEffect(() => {
    const interval = setInterval(pollNewMessages, 5000)
    return () => clearInterval(interval)
  }, [pollNewMessages])

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messages.length > prevMessageCountRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
    prevMessageCountRef.current = messages.length
  }, [messages])

  // IntersectionObserver on top sentinel — load older messages
  useEffect(() => {
    if (!messagesTopRef.current || !hasOlderMessages) return
    const observer = new IntersectionObserver(
      async (entries) => {
        if (entries[0].isIntersecting && hasOlderMessages && !loadingOlder) {
          setLoadingOlder(true)
          const container = scrollContainerRef.current
          const prevScrollHeight = container?.scrollHeight || 0
          try {
            const res = await getWhatsappChats(leadId, oldestTs || undefined)
            if (res?.data && res.data.length > 0) {
              setMessages(prev => {
                const existingIds = new Set(prev.map((m: any) => m.id))
                const olderMsgs = res.data.filter((m: any) => !existingIds.has(m.id))
                return [...olderMsgs, ...prev]
              })
              setHasOlderMessages(!!res.has_more)
              setOldestTs(res.oldest_timestamp || null)
              // Restore scroll position so it doesn't jump
              requestAnimationFrame(() => {
                if (container) {
                  container.scrollTop = container.scrollHeight - prevScrollHeight
                }
              })
            } else {
              setHasOlderMessages(false)
            }
          } catch { /* silent */ }
          finally { setLoadingOlder(false) }
        }
      },
      { threshold: 0.1 }
    )
    observer.observe(messagesTopRef.current)
    return () => observer.disconnect()
  }, [hasOlderMessages, loadingOlder, leadId, oldestTs])

  useEffect(() => {
    setLeadName(initialLeadName || 'Lead')
    setNameInput(initialLeadName || 'Lead')
  }, [initialLeadName, leadId])

  useEffect(() => {
    if (editingName) {
      setNameInput(leadName)
      setTimeout(() => nameInputRef.current?.focus(), 50)
    }
  }, [editingName])

  useEffect(() => {
    if (deleteConfirmId && hoveredId !== deleteConfirmId) {
      setDeleteConfirmId(null)
    }
  }, [hoveredId])

  const handleSend = async () => {
    if (!inputText.trim()) return
    setSending(true)
    try {
      const res = await sendWhatsappChat(leadId, inputText)
      if (res?.data) {
        setMessages(prev => [...prev, res.data])
        setInputText('')
      }
    } catch (e) {
      console.error('Failed to send:', e)
    } finally {
      setSending(false)
    }
  }

  const handleDeleteClick = (messageId: string) => setDeleteConfirmId(messageId)

  const handleDeleteConfirm = async (messageId: string) => {
    setDeleteConfirmId(null)
    setDeletingId(messageId)
    try {
      await deleteWhatsappMessage(leadId, messageId)
      setMessages(prev => prev.filter(m => m.id !== messageId))
    } catch (e) {
      console.error('Failed to delete message:', e)
    } finally {
      setDeletingId(null)
    }
  }

  const handleSaveName = async () => {
    const trimmed = nameInput.trim()
    if (!trimmed || trimmed === leadName) { setEditingName(false); return }
    setSavingName(true)
    try {
      await renameWhatsappLead(leadId, trimmed)
      setLeadName(trimmed)
      setEditingName(false)
    } catch (e) {
      console.error('Failed to rename lead:', e)
    } finally {
      setSavingName(false)
    }
  }

  const handleCallClick = () => setCallState('confirm')
  const handleCallConfirm = async () => {
    setCallState('loading')
    try {
      const res = await triggerAICall(leadId)
      setCallState(res?.success ? 'success' : 'error')
      autoDismiss(setCallState)
    } catch {
      setCallState('error')
      autoDismiss(setCallState)
    }
  }

  const handleClearClick = () => setClearState('confirm')
  const handleClearConfirm = async () => {
    setClearState('loading')
    try {
      await deleteAllWhatsappMessages(leadId)
      setMessages([])
      setClearState(null)
    } catch {
      setClearState('error')
      autoDismiss(setClearState)
    }
  }

  const handleResumeBot = async () => {
    setBotState('loading')
    try {
      await resumeWhatsappBot(leadId)
      setBotState('success')
      autoDismiss(setBotState)
    } catch {
      setBotState('error')
      autoDismiss(setBotState)
    }
  }

  const handleUnblock = async () => {
    setUnblockState('loading')
    try {
      await unblockWhatsappLead(leadId)
      setIsBlocked(false)
      setAbuseStrikes(0)
      setUnblockState('success')
      autoDismiss(setUnblockState)
    } catch {
      setUnblockState('error')
      autoDismiss(setUnblockState)
    }
  }

  if (loading) {
    return (
      <div className="flex h-[400px] items-center justify-center text-muted-foreground">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-[600px] bg-slate-50 border rounded-lg overflow-hidden">

      {/* ── Header ── */}
      <div className="bg-[#075E54] text-white p-3 flex justify-between items-center shadow-sm z-10 gap-2 flex-wrap">

        {/* Left: avatar + name */}
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="w-9 h-9 bg-white/20 rounded-full flex items-center justify-center shrink-0">
            <User className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            {editingName ? (
              <div className="flex items-center gap-1">
                <input
                  ref={nameInputRef}
                  value={nameInput}
                  onChange={e => setNameInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleSaveName(); if (e.key === 'Escape') setEditingName(false) }}
                  className="bg-white/20 text-white placeholder-white/50 rounded px-2 py-0.5 text-sm font-semibold w-36 outline-none border border-white/40 focus:border-white"
                  placeholder="Enter name..."
                />
                <button onClick={handleSaveName} disabled={savingName} className="p-1 rounded hover:bg-white/20 transition">
                  {savingName ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                </button>
                <button onClick={() => setEditingName(false)} className="p-1 rounded hover:bg-white/20 transition">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-1.5 group cursor-pointer" onClick={() => setEditingName(true)}>
                  <h3 className="font-semibold text-base truncate">{leadName}</h3>
                  <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-60 transition-opacity shrink-0" />
                </div>
                {/* Score Badge */}
                {scoreLabel && (
                  <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    scoreLabel === 'hot'  ? 'bg-red-500/80 text-white' :
                    scoreLabel === 'warm' ? 'bg-yellow-400/80 text-yellow-900' :
                                           'bg-blue-400/80 text-white'
                  }`}>
                    {scoreLabel === 'hot'  ? <Flame className="w-2.5 h-2.5" /> :
                     scoreLabel === 'warm' ? <Thermometer className="w-2.5 h-2.5" /> :
                                             <Snowflake className="w-2.5 h-2.5" />}
                    {scoreLabel.toUpperCase()} {scoreValue != null ? `·${scoreValue}` : ''}
                  </span>
                )}
              </div>
            )}
            <p className="text-[11px] text-white/70">End-to-End Synced</p>
          </div>
        </div>

        {/* Right: action buttons */}
        <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">

          {/* ── Re-score ── */}
          <button
            onClick={async () => {
              setRescoring(true)
              try {
                const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'
                const res = await fetch(`${BACKEND_URL}/api/admin/lead-scoring/${leadId}/score`, { method: 'POST', credentials: 'include' })
                const data = await res.json()
                if (data.label) { setScoreLabel(data.label) }
              } catch { /* silent */ }
              finally { setRescoring(false) }
            }}
            disabled={rescoring}
            className="flex items-center gap-1 text-[10px] bg-white/10 hover:bg-white/20 px-2 py-1 rounded-lg transition"
            title="Re-analyse chat and update hot/cold score"
          >
            {rescoring ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            <span>Score</span>
          </button>

          {/* ── Manage Lead ── */}
          {showManageButton && (
            manageLead ? (
              <UserManagementSheet
                lead={manageLead}
                defaultTab="overview"
                onLeadUpdate={(updated) => setManageLead(updated)}
              >
                <button
                  className="flex items-center gap-1.5 text-[10px] bg-indigo-500 hover:bg-indigo-400 px-2 py-1 rounded-lg transition font-semibold"
                  title="Open lead management panel"
                >
                  <ExternalLink className="w-3 h-3" />
                  <span>Manage</span>
                </button>
              </UserManagementSheet>
            ) : (
              <button
                onClick={fetchAndOpenManage}
                disabled={manageLoading}
                className="flex items-center gap-1.5 text-[10px] bg-indigo-500 hover:bg-indigo-400 px-2 py-1 rounded-lg transition font-semibold disabled:opacity-60"
                title="Open lead management panel"
              >
                {manageLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <ExternalLink className="w-3 h-3" />}
                <span>Manage</span>
              </button>
            )
          )}

          {/* ── Unblock (only shown when blocked) ── */}
          {isBlocked && (
            unblockState === 'loading' ? (
              <div className="flex items-center gap-1.5 text-xs bg-orange-500/60 px-3 py-1.5 rounded">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /><span>Unblocking…</span>
              </div>
            ) : unblockState === 'success' ? (
              <div className="flex items-center gap-1.5 text-xs bg-green-600 px-3 py-1.5 rounded">
                <Check className="w-3.5 h-3.5" /><span>Unblocked!</span>
              </div>
            ) : unblockState === 'error' ? (
              <div className="flex items-center gap-1.5 text-xs bg-red-600 px-3 py-1.5 rounded">
                <X className="w-3.5 h-3.5" /><span>Failed</span>
              </div>
            ) : (
              <button
                onClick={handleUnblock}
                className="flex items-center gap-1.5 text-xs bg-orange-500 hover:bg-orange-400 px-3 py-1.5 rounded transition font-medium"
                title="Remove abuse block and re-enable AI bot for this lead"
              >
                <ShieldOff className="w-3.5 h-3.5" /><span>Unblock</span>
              </button>
            )
          )}

          {/* ── Clear Chat ── */}
          {clearState === 'confirm' ? (
            <div className="flex items-center gap-1 bg-red-600 rounded px-2 py-1 text-xs animate-in fade-in duration-150">
              <span className="text-white/90 mr-1">Clear all?</span>
              <button onClick={handleClearConfirm} className="bg-white text-red-600 font-bold px-2 py-0.5 rounded hover:bg-red-50 transition">Yes</button>
              <button onClick={() => setClearState(null)} className="bg-white/20 text-white px-2 py-0.5 rounded hover:bg-white/30 transition">No</button>
            </div>
          ) : clearState === 'loading' ? (
            <div className="flex items-center gap-1.5 text-xs bg-red-500/60 px-3 py-1.5 rounded">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /><span>Clearing…</span>
            </div>
          ) : clearState === 'error' ? (
            <div className="flex items-center gap-1.5 text-xs bg-red-700 px-3 py-1.5 rounded">
              <X className="w-3.5 h-3.5" /><span>Failed</span>
            </div>
          ) : (
            <button
              onClick={handleClearClick}
              disabled={messages.length === 0}
              className="flex items-center gap-1.5 text-xs bg-red-500/80 hover:bg-red-600 px-3 py-1.5 rounded transition disabled:opacity-40"
              title="Delete entire chat history"
            >
              <Trash2 className="w-3.5 h-3.5" /><span>Clear Chat</span>
            </button>
          )}

          {/* ── Call ── */}
          {callState === 'confirm' ? (
            <div className="flex items-center gap-1 bg-green-700 rounded px-2 py-1 text-xs animate-in fade-in duration-150">
              <span className="text-white/90 mr-1">Call {leadName}?</span>
              <button onClick={handleCallConfirm} className="bg-white text-green-700 font-bold px-2 py-0.5 rounded hover:bg-green-50 transition">Yes</button>
              <button onClick={() => setCallState(null)} className="bg-white/20 text-white px-2 py-0.5 rounded hover:bg-white/30 transition">No</button>
            </div>
          ) : callState === 'loading' ? (
            <div className="flex items-center gap-1.5 text-xs bg-green-600/60 px-3 py-1.5 rounded">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /><span>Calling…</span>
            </div>
          ) : callState === 'success' ? (
            <div className="flex items-center gap-1.5 text-xs bg-green-600 px-3 py-1.5 rounded">
              <Check className="w-3.5 h-3.5" /><span>Call started!</span>
            </div>
          ) : callState === 'error' ? (
            <div className="flex items-center gap-1.5 text-xs bg-red-600 px-3 py-1.5 rounded">
              <X className="w-3.5 h-3.5" /><span>Call failed</span>
            </div>
          ) : (
            <button
              onClick={handleCallClick}
              className="flex items-center gap-1.5 text-xs bg-white/10 hover:bg-green-500/80 px-3 py-1.5 rounded transition"
              title="Trigger AI phone call"
            >
              <Phone className="w-3.5 h-3.5" /><span>Call</span>
            </button>
          )}

          {/* ── Resume Bot ── */}
          {botState === 'loading' ? (
            <div className="flex items-center gap-1.5 text-xs bg-white/10 px-3 py-1.5 rounded">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /><span>Resuming…</span>
            </div>
          ) : botState === 'success' ? (
            <div className="flex items-center gap-1.5 text-xs bg-green-600 px-3 py-1.5 rounded">
              <Check className="w-3.5 h-3.5" /><span>Bot resumed!</span>
            </div>
          ) : botState === 'error' ? (
            <div className="flex items-center gap-1.5 text-xs bg-red-600 px-3 py-1.5 rounded">
              <X className="w-3.5 h-3.5" /><span>Failed</span>
            </div>
          ) : (
            <button
              onClick={handleResumeBot}
              className="text-xs bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded transition"
              title="Sending a manual message pauses the AI. Click this to resume it."
            >
              Resume AI Bot
            </button>
          )}
        </div>
      </div>

      {/* ── Abuse Blocked Banner ── */}
      {isBlocked && (
        <div className="flex items-center gap-3 bg-red-50 border-b border-red-200 px-4 py-2.5 text-sm">
          <ShieldAlert className="w-4 h-4 text-red-500 shrink-0" />
          <div className="flex-1">
            <span className="font-semibold text-red-700">Bot blocked</span>
            <span className="text-red-600 ml-1">— This lead sent {abuseStrikes} abusive message{abuseStrikes !== 1 ? 's' : ''}. The AI bot has stopped responding.</span>
          </div>
          <button
            onClick={handleUnblock}
            disabled={unblockState === 'loading'}
            className="shrink-0 text-xs font-semibold bg-red-100 hover:bg-red-200 text-red-700 border border-red-300 px-3 py-1 rounded-full transition"
          >
            {unblockState === 'loading' ? 'Unblocking…' : 'Remove Block'}
          </button>
        </div>
      )}

      {/* ── Chat Area ── */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto p-4 space-y-4"
        style={{
          backgroundColor: '#efeae2',
          backgroundImage: 'url("https://w0.peakpx.com/wallpaper/818/148/HD-wallpaper-whatsapp-background-solid-color-whatsapp-bg-whatsapp-dark-whatsapp-theme-thumbnail.jpg")',
          backgroundBlendMode: 'soft-light',
        }}
      >
        {/* Top sentinel — triggers loading older messages when scrolled to */}
        <div ref={messagesTopRef} className="h-1" />

        {/* Loading older indicator */}
        {loadingOlder && (
          <div className="flex justify-center py-2">
            <div className="flex items-center gap-2 bg-white/80 px-3 py-1.5 rounded-full text-xs text-gray-500 shadow-sm">
              <Loader2 className="w-3 h-3 animate-spin" />
              Loading older messages...
            </div>
          </div>
        )}
        {!loadingOlder && !hasOlderMessages && messages.length > 0 && (
          <div className="flex justify-center py-1">
            <span className="text-[10px] text-gray-400 bg-white/60 px-2 py-1 rounded-full">Beginning of conversation</span>
          </div>
        )}

        {messages.length === 0 ? (
          <div className="text-center text-sm text-gray-500 mt-10 bg-white/80 w-fit mx-auto px-4 py-2 rounded-lg">
            No messages found. Say hi!
          </div>
        ) : (
          messages.map((msg, idx) => {
            const isMe = msg.sender_type === 'bot' || msg.sender_type === 'admin'
            const isHovered    = hoveredId      === msg.id
            const isDeleting   = deletingId     === msg.id
            const isConfirming = deleteConfirmId === msg.id

            // ── Date separator ─────────────────────────────────────────
            const currentLabel  = getDateLabel(msg.created_at)
            const prevLabel     = idx > 0 ? getDateLabel(messages[idx - 1].created_at) : null
            const showSeparator = currentLabel !== prevLabel

            return (
              <>
                {/* WhatsApp-style date pill */}
                {showSeparator && (
                  <div key={`sep-${msg.id}`} className="flex justify-center my-2">
                    <span className="bg-[#e1f2fb]/90 text-[#54656f] text-[11.5px] font-medium px-3 py-1 rounded-full shadow-sm select-none backdrop-blur-sm">
                      {currentLabel}
                    </span>
                  </div>
                )}

                <div
                  key={msg.id}
                  className={`flex ${isMe ? 'justify-end' : 'justify-start'} items-center gap-1`}
                  onMouseEnter={() => setHoveredId(msg.id)}
                  onMouseLeave={() => setHoveredId(null)}
                >
                  {/* Left delete controls (incoming) */}
                  {!isMe && (
                    <div className={`flex items-center gap-0.5 shrink-0 transition-all duration-150 ${isHovered || isConfirming ? 'opacity-100' : 'opacity-0'}`}>
                      {isConfirming ? (
                        <>
                          <button onClick={() => handleDeleteConfirm(msg.id)} className="p-1 rounded-full bg-red-500 text-white hover:bg-red-600 transition shadow-sm" title="Yes, delete">
                            <Check className="w-3 h-3" />
                          </button>
                          <button onClick={() => setDeleteConfirmId(null)} className="p-1 rounded-full bg-gray-400 text-white hover:bg-gray-500 transition shadow-sm" title="Cancel">
                            <X className="w-3 h-3" />
                          </button>
                        </>
                      ) : isDeleting ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400 mx-1" />
                      ) : (
                        <button onClick={() => handleDeleteClick(msg.id)} className="p-1 rounded-full bg-white/80 text-red-400 hover:text-red-600 hover:bg-white shadow-sm transition" title="Delete message">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  )}

                  {/* Message bubble */}
                  <div className={`max-w-[75%] rounded-lg px-3 py-2 shadow-sm relative ${isMe ? 'bg-[#dcf8c6] rounded-tr-none' : 'bg-white rounded-tl-none'} ${isDeleting ? 'opacity-40 pointer-events-none' : ''}`}>
                    {msg.sender_type === 'bot' && (
                      <div className="text-[10px] text-primary flex items-center gap-1 font-semibold mb-1"><Bot className="w-3 h-3" /> AI Bot</div>
                    )}
                    {msg.sender_type === 'admin' && (
                      <div className="text-[10px] text-gray-500 flex items-center gap-1 font-semibold mb-1"><User className="w-3 h-3" /> You (Admin)</div>
                    )}
                    <div className="text-[15px] text-gray-800 break-words whitespace-pre-wrap">{msg.message_body}</div>
                    <div className="text-[10px] text-gray-500 text-right mt-1 flex justify-end items-center gap-1">
                      {new Date(msg.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
                      {isMe && <CheckCheck className="w-3 h-3 text-blue-500" />}
                    </div>
                  </div>

                  {/* Right delete controls (outgoing) */}
                  {isMe && (
                    <div className={`flex items-center gap-0.5 shrink-0 transition-all duration-150 ${isHovered || isConfirming ? 'opacity-100' : 'opacity-0'}`}>
                      {isConfirming ? (
                        <>
                          <button onClick={() => handleDeleteConfirm(msg.id)} className="p-1 rounded-full bg-red-500 text-white hover:bg-red-600 transition shadow-sm" title="Yes, delete">
                            <Check className="w-3 h-3" />
                          </button>
                          <button onClick={() => setDeleteConfirmId(null)} className="p-1 rounded-full bg-gray-400 text-white hover:bg-gray-500 transition shadow-sm" title="Cancel">
                            <X className="w-3 h-3" />
                          </button>
                        </>
                      ) : isDeleting ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400 mx-1" />
                      ) : (
                        <button onClick={() => handleDeleteClick(msg.id)} className="p-1 rounded-full bg-white/80 text-red-400 hover:text-red-600 hover:bg-white shadow-sm transition" title="Delete message">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </>
            )
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* ── Input Area ── */}
      <div className="bg-[#f0f0f0] p-3 flex items-center gap-2 border-t">
        <input
          type="text"
          value={inputText}
          onChange={e => setInputText(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSend()}
          placeholder="Type a message..."
          className="flex-1 rounded-full px-4 py-2 border-none outline-none focus:ring-0"
        />
        <button
          onClick={handleSend}
          disabled={!inputText.trim() || sending}
          className="bg-[#00a884] text-white p-2.5 rounded-full hover:bg-[#008f6f] disabled:opacity-50 transition"
        >
          {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
        </button>
      </div>
    </div>
  )
}
