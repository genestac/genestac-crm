'use client'
import { useState, useEffect, useRef } from 'react'
import { Loader2, Send, Bot, User, CheckCheck } from 'lucide-react'
import { getWhatsappChats, sendWhatsappChat, resumeWhatsappBot } from '@/app/sales/actions'

export function WhatsappChat({ leadId }: { leadId: string }) {
  const [messages, setMessages] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [inputText, setInputText] = useState('')
  const [sending, setSending] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const fetchChats = async () => {
    try {
      const data = await getWhatsappChats(leadId)
      if (data) {
        setMessages(data)
      }
    } catch (e) {
      console.error('Failed to fetch WA chat:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchChats()
    const interval = setInterval(fetchChats, 5000) // Poll every 5s for new messages
    return () => clearInterval(interval)
  }, [leadId])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

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

  const handleResumeBot = async () => {
    try {
      await resumeWhatsappBot(leadId)
      alert("AI Bot resumed for this lead.")
    } catch (e) {
      console.error('Failed to resume bot:', e)
    }
  }

  if (loading) {
    return <div className="flex h-[400px] items-center justify-center text-muted-foreground"><Loader2 className="w-6 h-6 animate-spin" /></div>
  }

  return (
    <div className="flex flex-col h-[600px] bg-slate-50 border rounded-lg overflow-hidden">
      {/* Header */}
      <div className="bg-[#075E54] text-white p-4 flex justify-between items-center shadow-sm z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
            <User className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-semibold text-lg">WhatsApp Chat</h3>
            <p className="text-xs text-white/80">End-to-End Synced</p>
          </div>
        </div>
        <button 
          onClick={handleResumeBot}
          className="text-xs bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded transition"
          title="Sending a manual message pauses the AI. Click this to resume it."
        >
          Resume AI Bot
        </button>
      </div>

      {/* Chat Area (WhatsApp Background pattern) */}
      <div 
        className="flex-1 overflow-y-auto p-4 space-y-4"
        style={{ backgroundColor: '#efeae2', backgroundImage: 'url("https://w0.peakpx.com/wallpaper/818/148/HD-wallpaper-whatsapp-background-solid-color-whatsapp-bg-whatsapp-dark-whatsapp-theme-thumbnail.jpg")', backgroundBlendMode: 'soft-light' }}
      >
        {messages.length === 0 ? (
          <div className="text-center text-sm text-gray-500 mt-10 bg-white/80 w-fit mx-auto px-4 py-2 rounded-lg">
            No messages found. Say hi!
          </div>
        ) : (
          messages.map((msg) => {
            const isMe = msg.sender_type === 'bot' || msg.sender_type === 'admin'
            return (
              <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                <div 
                  className={`max-w-[75%] rounded-lg px-3 py-2 shadow-sm relative ${
                    isMe ? 'bg-[#dcf8c6] rounded-tr-none' : 'bg-white rounded-tl-none'
                  }`}
                >
                  {/* Sender Badge */}
                  {msg.sender_type === 'bot' && (
                    <div className="text-[10px] text-primary flex items-center gap-1 font-semibold mb-1">
                      <Bot className="w-3 h-3" /> AI Bot
                    </div>
                  )}
                  {msg.sender_type === 'admin' && (
                    <div className="text-[10px] text-gray-500 flex items-center gap-1 font-semibold mb-1">
                      <User className="w-3 h-3" /> You (Admin)
                    </div>
                  )}

                  <div className="text-[15px] text-gray-800 break-words whitespace-pre-wrap">{msg.message_body}</div>
                  
                  <div className="text-[10px] text-gray-500 text-right mt-1 flex justify-end items-center gap-1">
                    {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    {isMe && <CheckCheck className="w-3 h-3 text-blue-500" />}
                  </div>
                </div>
              </div>
            )
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
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
