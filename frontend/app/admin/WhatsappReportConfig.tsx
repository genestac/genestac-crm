"use client"

import { useState, useEffect } from "react"
import { Save, Send, Clock, Phone } from "lucide-react"

export default function WhatsappReportConfig() {
  const [numbers, setNumbers] = useState<string>("")
  const [time, setTime] = useState<string>("21:00")
  const [isLoading, setIsLoading] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [message, setMessage] = useState<{ text: string, type: 'success' | 'error' } | null>(null)

  useEffect(() => {
    fetchConfig()
  }, [])

  const fetchConfig = async () => {
    try {
      const token = localStorage.getItem("token")
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/metrics/whatsapp-config`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (res.ok) {
        const data = await res.json()
        setNumbers(data.numbers ? data.numbers.join(", ") : "")
        setTime(data.time || "21:00")
      }
    } catch (err) {
      console.error("Failed to fetch whatsapp config", err)
    }
  }

  const handleSave = async () => {
    setIsLoading(true)
    setMessage(null)
    try {
      const token = localStorage.getItem("token")
      const numList = numbers.split(",").map(n => n.trim()).filter(n => n.length > 0)
      
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/metrics/whatsapp-config`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ numbers: numList, time })
      })

      if (res.ok) {
        setMessage({ text: "Configuration saved successfully!", type: "success" })
      } else {
        setMessage({ text: "Failed to save configuration.", type: "error" })
      }
    } catch (err) {
      setMessage({ text: "Network error occurred.", type: "error" })
    } finally {
      setIsLoading(false)
    }
  }

  const handleManualSend = async () => {
    if (!confirm("Are you sure you want to trigger the daily report to be sent immediately?")) return;
    
    setIsSending(true)
    setMessage(null)
    try {
      const token = localStorage.getItem("token")
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/metrics/send-whatsapp-report`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }
      })

      if (res.ok) {
        setMessage({ text: "Report triggered successfully! Check WhatsApp shortly.", type: "success" })
      } else {
        setMessage({ text: "Failed to trigger report.", type: "error" })
      }
    } catch (err) {
      setMessage({ text: "Network error occurred.", type: "error" })
    } finally {
      setIsSending(false)
    }
  }

  return (
    <div className="bg-white/80 backdrop-blur-xl border border-gray-100 rounded-3xl p-6 shadow-sm col-span-1 lg:col-span-2">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Daily WhatsApp Report</h2>
          <p className="text-sm text-gray-500 mt-1">Configure automated daily analytics reports sent via WhatsApp.</p>
        </div>
      </div>

      {message && (
        <div className={`mb-4 p-3 rounded-xl text-sm font-medium ${message.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
          {message.text}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center">
            <Phone className="w-4 h-4 mr-2 text-gray-400" />
            Phone Numbers (Comma separated)
          </label>
          <input
            type="text"
            value={numbers}
            onChange={(e) => setNumbers(e.target.value)}
            placeholder="+919876543210, +919999999999"
            className="w-full px-4 py-3 rounded-2xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
          />
          <p className="text-xs text-gray-400 mt-2">Include country code. E.g. +919876543210</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center">
            <Clock className="w-4 h-4 mr-2 text-gray-400" />
            Scheduled Time (24hr format)
          </label>
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="w-full px-4 py-3 rounded-2xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
          />
        </div>
      </div>

      <div className="flex gap-4 mt-6">
        <button
          onClick={handleSave}
          disabled={isLoading}
          className="flex items-center px-6 py-2.5 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
        >
          <Save className="w-4 h-4 mr-2" />
          {isLoading ? "Saving..." : "Save Config"}
        </button>
        
        <button
          onClick={handleManualSend}
          disabled={isSending}
          className="flex items-center px-6 py-2.5 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 transition-colors disabled:opacity-50"
        >
          <Send className="w-4 h-4 mr-2" />
          {isSending ? "Sending..." : "Send Report Now"}
        </button>
      </div>
    </div>
  )
}
