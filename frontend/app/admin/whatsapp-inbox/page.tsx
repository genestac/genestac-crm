'use client'
import { useState, useEffect, useCallback } from 'react'
import { getWhatsappConversations } from '@/app/sales/actions'
import { getInactiveSubscriberConversations, backfillEngagementMessages } from '@/app/admin/whatsapp-actions'
import { WhatsappChat } from '@/components/sales/whatsapp-chat'
import { Loader2, Search, User, MessageCircle, Bell, Clock, Users, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react'

type ConversationEntry = {
  id: string
  name: string
  phone?: string
  last_message: string
  last_message_time: string
  sender_type?: string
  bot_paused?: boolean
  is_user?: boolean
  is_reminder_subscriber?: boolean
  subscription_start_date?: string
  days_inactive?: number
}

type ActiveTab = 'all' | 'reminders'

export default function WhatsappInboxPage() {
  const [conversations, setConversations] = useState<ConversationEntry[]>([])
  const [reminders, setReminders] = useState<ConversationEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [activeLeadId, setActiveLeadId] = useState<string | null>(null)
  const [activeLeadName, setActiveLeadName] = useState<string>('Lead')
  const [activeTab, setActiveTab] = useState<ActiveTab>('all')
  const [backfilling, setBackfilling] = useState(false)
  const [backfillResult, setBackfillResult] = useState<{ success: boolean; message: string } | null>(null)


  const fetchAll = useCallback(async () => {
    const [convData, reminderData] = await Promise.all([
      getWhatsappConversations(),
      getInactiveSubscriberConversations(),
    ])
    setConversations(convData)
    setReminders(reminderData)
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchAll()
    const interval = setInterval(fetchAll, 15000)
    return () => clearInterval(interval)
  }, [fetchAll])

  const filteredConversations = conversations.filter(c =>
    c.name?.toLowerCase().includes(search.toLowerCase()) ||
    c.phone?.includes(search)
  )

  const filteredReminders = reminders.filter(c =>
    c.name?.toLowerCase().includes(search.toLowerCase()) ||
    c.phone?.includes(search)
  )

  const formatTime = (isoString: string) => {
    if (!isoString) return ''
    const date = new Date(isoString)
    const today = new Date()
    if (date.toDateString() === today.toDateString()) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
  }

  const handleBackfill = async () => {
    setBackfilling(true)
    setBackfillResult(null)
    try {
      const res = await backfillEngagementMessages()
      setBackfillResult({ success: true, message: res.message || `Updated ${res.updated} message(s).` })
      // Refresh conversations to show new content
      await fetchAll()
    } catch (err: any) {
      setBackfillResult({ success: false, message: err.message || 'Backfill failed.' })
    } finally {
      setBackfilling(false)
    }
  }

  const displayList = activeTab === 'all' ? filteredConversations : filteredReminders


  return (
    <div className="flex h-[calc(100vh-6rem)] -m-6 bg-white overflow-hidden shadow-sm border border-gray-200">

      {/* Left Sidebar */}
      <div className="w-[380px] flex flex-col border-r bg-white flex-shrink-0 z-10">

        {/* Header */}
        <div className="h-16 bg-[#f0f2f5] flex items-center px-4 flex-shrink-0 gap-3">
          <MessageCircle className="w-6 h-6 text-[#00a884]" />
          <h2 className="text-xl font-semibold text-gray-800">WhatsApp Inbox</h2>
        </div>

        {/* Tabs */}
        <div className="flex border-b bg-white flex-shrink-0">
          <button
            onClick={() => setActiveTab('all')}
            className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-semibold transition-colors border-b-2 ${
              activeTab === 'all'
                ? 'border-[#00a884] text-[#00a884]'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Users className="w-4 h-4" />
            All Chats
            {conversations.length > 0 && (
              <span className="bg-[#00a884] text-white text-xs rounded-full px-1.5 py-0.5 leading-none">
                {conversations.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('reminders')}
            className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-semibold transition-colors border-b-2 ${
              activeTab === 'reminders'
                ? 'border-amber-500 text-amber-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Bell className="w-4 h-4" />
            Reminders
            {reminders.length > 0 && (
              <span className="bg-amber-500 text-white text-xs rounded-full px-1.5 py-0.5 leading-none">
                {reminders.length}
              </span>
            )}
          </button>
        </div>

        {/* Search */}
        <div className="p-2 border-b bg-white flex-shrink-0">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-3 text-gray-500" />
            <input
              type="text"
              placeholder="Search by name or phone"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-[#f0f2f5] rounded-lg pl-10 pr-4 py-2 text-sm outline-none"
            />
          </div>
        </div>

        {/* Reminders Tab Info Banner + Backfill Button */}
        {activeTab === 'reminders' && !loading && (
          <div className="bg-amber-50 border-b border-amber-100 px-4 py-2.5 flex-shrink-0 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-amber-700 font-medium flex items-center gap-1.5">
                <Bell className="w-3.5 h-3.5 flex-shrink-0" />
                Subscribed users who haven't engaged since joining
              </p>
              <button
                onClick={handleBackfill}
                disabled={backfilling}
                title="Populate older placeholder messages with real template content"
                className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-60 transition-colors whitespace-nowrap flex-shrink-0"
              >
                {backfilling
                  ? <><Loader2 className="w-3 h-3 animate-spin" /> Populating…</>
                  : <><RefreshCw className="w-3 h-3" /> Populate Old Messages</>
                }
              </button>
            </div>
            {backfillResult && (
              <div className={`flex items-center gap-2 text-xs rounded-lg px-3 py-1.5 ${
                backfillResult.success
                  ? 'bg-green-50 text-green-700 border border-green-200'
                  : 'bg-red-50 text-red-700 border border-red-200'
              }`}>
                {backfillResult.success
                  ? <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
                  : <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                }
                <span>{backfillResult.message}</span>
                <button
                  onClick={() => setBackfillResult(null)}
                  className="ml-auto text-current opacity-60 hover:opacity-100"
                >✕</button>
              </div>
            )}
          </div>
        )}


        {/* Conversation List */}
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {loading ? (
            <div className="flex justify-center p-10">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : displayList.length === 0 ? (
            <div className="p-10 text-center">
              {activeTab === 'reminders' ? (
                <>
                  <Bell className="w-10 h-10 mx-auto mb-3 text-gray-300" />
                  <p className="text-sm text-gray-500 font-medium">No inactive subscribers</p>
                  <p className="text-xs text-gray-400 mt-1">All subscribed users are actively engaging 🎉</p>
                </>
              ) : (
                <p className="text-sm text-gray-500">No active chats found.</p>
              )}
            </div>
          ) : (
            displayList.map(conv => (
              <div
                key={conv.id}
                onClick={() => { setActiveLeadId(conv.id); setActiveLeadName(conv.name || 'Lead') }}
                className={`flex items-start px-4 py-3 cursor-pointer hover:bg-[#f5f6f6] transition group border-b border-gray-100 ${
                  activeLeadId === conv.id ? 'bg-[#f0f2f5]' : ''
                }`}
              >
                {/* Avatar */}
                <div className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 mr-3 mt-0.5 ${
                  conv.is_reminder_subscriber
                    ? 'bg-amber-100'
                    : 'bg-gray-200'
                }`}>
                  {conv.is_reminder_subscriber
                    ? <Bell className="w-5 h-5 text-amber-500" />
                    : <User className="w-6 h-6 text-gray-500" />
                  }
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-baseline mb-0.5">
                    <h3 className="font-semibold text-gray-900 truncate pr-2 text-base">{conv.name}</h3>
                    <span className="text-xs text-gray-500 flex-shrink-0">{formatTime(conv.last_message_time)}</span>
                  </div>

                  {/* Reminder badge row */}
                  {conv.is_reminder_subscriber && (
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">
                        <Bell className="w-2.5 h-2.5" />
                        Reminder Sent
                      </span>
                      <span className="inline-flex items-center gap-1 text-[10px] text-gray-500">
                        <Clock className="w-2.5 h-2.5" />
                        {conv.days_inactive ?? 0}d inactive
                      </span>
                    </div>
                  )}

                  <div className="flex items-center gap-1 text-sm text-gray-500 truncate">
                    {!conv.is_reminder_subscriber && (conv.sender_type === 'bot' || conv.sender_type === 'admin') && (
                      <span className="text-[#53bdeb] text-xs mr-0.5">✓✓</span>
                    )}
                    <span className="truncate">{conv.last_message}</span>
                  </div>

                  {/* Subscription start date for reminders */}
                  {conv.is_reminder_subscriber && conv.subscription_start_date && (
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      Subscribed since {new Date(conv.subscription_start_date).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Right Pane — Chat Interface */}
      <div className="flex-1 flex flex-col bg-[#f0f2f5] relative overflow-hidden">
        {activeLeadId ? (
          <div className="absolute inset-0 [&>div]:h-full [&>div]:border-0 [&>div]:rounded-none">
            <WhatsappChat leadId={activeLeadId} leadName={activeLeadName} showManageButton={true} />
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-500 bg-[#f0f2f5] border-b-8 border-[#00a884]">
            <MessageCircle className="w-24 h-24 mb-6 text-gray-300" strokeWidth={1} />
            <h2 className="text-3xl font-light text-gray-600 mb-4">WhatsApp Inbox</h2>
            <p className="text-sm text-gray-500 text-center max-w-md">
              Send and receive messages seamlessly. <br />
              Select a conversation from the sidebar to start chatting.
            </p>
            {reminders.length > 0 && (
              <button
                onClick={() => setActiveTab('reminders')}
                className="mt-6 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-500 text-white text-sm font-semibold hover:bg-amber-600 transition-colors shadow"
              >
                <Bell className="w-4 h-4" />
                View {reminders.length} subscriber reminder{reminders.length !== 1 ? 's' : ''}
              </button>
            )}
          </div>
        )}
      </div>

    </div>
  )
}
