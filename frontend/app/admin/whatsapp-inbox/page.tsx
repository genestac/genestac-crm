'use client'
import { useState, useEffect } from 'react'
import { getWhatsappConversations } from '@/app/sales/actions'
import { WhatsappChat } from '@/components/sales/whatsapp-chat'
import { Loader2, Search, User, MessageCircle, Clock } from 'lucide-react'

export default function WhatsappInboxPage() {
  const [conversations, setConversations] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [activeLeadId, setActiveLeadId] = useState<string | null>(null)

  useEffect(() => {
    const fetchConvos = async () => {
      const data = await getWhatsappConversations()
      setConversations(data)
      setLoading(false)
    }
    fetchConvos()
    const interval = setInterval(fetchConvos, 10000) // update every 10s
    return () => clearInterval(interval)
  }, [])

  const filteredConversations = conversations.filter(c => 
    c.name?.toLowerCase().includes(search.toLowerCase()) || 
    c.phone?.includes(search)
  )

  const formatTime = (isoString: string) => {
    const date = new Date(isoString)
    const today = new Date()
    if (date.toDateString() === today.toDateString()) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
  }

  return (
    <div className="flex h-[calc(100vh-6rem)] -m-6 bg-white overflow-hidden shadow-sm border border-gray-200">
      
      {/* Left Sidebar (Contacts) */}
      <div className="w-[380px] flex flex-col border-r bg-white flex-shrink-0 z-10">
        <div className="h-16 bg-[#f0f2f5] flex items-center px-4 flex-shrink-0">
          <h2 className="text-xl font-semibold text-gray-800 flex items-center gap-2">
            <MessageCircle className="w-6 h-6 text-[#00a884]" />
            Chats
          </h2>
        </div>
        
        <div className="p-2 border-b bg-white">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-3 text-gray-500" />
            <input 
              type="text" 
              placeholder="Search or start new chat" 
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-[#f0f2f5] rounded-lg pl-10 pr-4 py-2 text-sm outline-none focus:ring-0 focus:border-transparent"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {loading ? (
            <div className="flex justify-center p-10"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
          ) : filteredConversations.length === 0 ? (
            <div className="p-10 text-center text-sm text-gray-500">No active chats found.</div>
          ) : (
            filteredConversations.map(conv => (
              <div 
                key={conv.id}
                onClick={() => setActiveLeadId(conv.id)}
                className={`flex items-center px-4 py-3 cursor-pointer hover:bg-[#f5f6f6] transition group border-b border-gray-100 ${activeLeadId === conv.id ? 'bg-[#f0f2f5]' : ''}`}
              >
                <div className="w-12 h-12 bg-gray-200 rounded-full flex items-center justify-center flex-shrink-0 mr-3">
                  <User className="w-6 h-6 text-gray-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-baseline mb-1">
                    <h3 className="font-semibold text-gray-900 truncate pr-2 text-base">{conv.name}</h3>
                    <span className="text-xs text-gray-500 flex-shrink-0">{formatTime(conv.last_message_time)}</span>
                  </div>
                  <div className="flex items-center gap-1 text-sm text-gray-500 truncate">
                    <span className="truncate">{conv.sender_type === 'bot' || conv.sender_type === 'admin' ? '✓✓ ' : ''}{conv.last_message}</span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Right Pane (Chat Interface) */}
      <div className="flex-1 flex flex-col bg-[#f0f2f5] relative overflow-hidden">
        {activeLeadId ? (
          // Re-use the existing component, but stretch it to full height
          <div className="absolute inset-0 [&>div]:h-full [&>div]:border-0 [&>div]:rounded-none">
            <WhatsappChat leadId={activeLeadId} />
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-500 bg-[#f0f2f5] border-b-8 border-[#00a884]">
            <MessageCircle className="w-24 h-24 mb-6 text-gray-300" strokeWidth={1} />
            <h2 className="text-3xl font-light text-gray-600 mb-4">WhatsApp Web</h2>
            <p className="text-sm text-gray-500 text-center max-w-md">
              Send and receive messages seamlessly. <br/>
              Select a conversation from the sidebar to start chatting.
            </p>
          </div>
        )}
      </div>

    </div>
  )
}
