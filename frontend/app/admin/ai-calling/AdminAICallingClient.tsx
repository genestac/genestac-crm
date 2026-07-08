'use client'

import { useState } from 'react'
import { updateAISettings, addKnowledgeBaseItem, deleteKnowledgeBaseItem } from '../actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { toast } from 'sonner'
import { Loader2, Plus, Trash2, Bot, Database, Clock } from 'lucide-react'

export function AdminAICallingClient({ initialSettings, initialKnowledgeBase }: { initialSettings: any, initialKnowledgeBase: any[] }) {
  const [settings, setSettings] = useState(initialSettings || {
    enabled_statuses: [],
    base_prompt: "You are a helpful AI assistant for Genestac CRM. Be concise and polite.",
    allowed_time_windows: [{ start: "09:00", end: "18:00", days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"] }],
    exotel_number: "",
    exotel_api_key: "",
    exotel_api_token: "",
    exotel_sid: "",
    exotel_subdomain: ""
  })
  
  const [kb, setKb] = useState(initialKnowledgeBase || [])
  const [saving, setSaving] = useState(false)
  const [newKbTitle, setNewKbTitle] = useState('')
  const [newKbContent, setNewKbContent] = useState('')
  const [addingKb, setAddingKb] = useState(false)

  const leadStatuses = [
    { value: "NEW", label: "New" },
    { value: "UNREAD", label: "Unread" },
    { value: "CONTACT_ATTEMPTED", label: "Contact Attempted" },
    { value: "CONTACTED", label: "Contacted" },

    { value: "QUALIFIED", label: "Qualified" },
  ]

  const handleSaveSettings = async () => {
    setSaving(true)
    try {
      await updateAISettings(settings)
      toast.success('AI Call settings updated successfully')
    } catch (err) {
      toast.error('Failed to update settings')
    } finally {
      setSaving(false)
    }
  }

  const handleAddKb = async () => {
    if (!newKbTitle || !newKbContent) return
    setAddingKb(true)
    try {
      const res = await addKnowledgeBaseItem({ title: newKbTitle, content: newKbContent, category: 'FAQ' })
      if (res.success) {
        setKb([...kb, res.data[0]])
        setNewKbTitle('')
        setNewKbContent('')
        toast.success('Knowledge base item added')
      }
    } catch (err) {
      toast.error('Failed to add knowledge base item')
    } finally {
      setAddingKb(false)
    }
  }

  const handleDeleteKb = async (id: string) => {
    try {
      await deleteKnowledgeBaseItem(id)
      setKb(kb.filter(item => item.id !== id))
      toast.success('Knowledge base item deleted')
    } catch (err) {
      toast.error('Failed to delete item')
    }
  }

  const toggleStatus = (statusValue: string) => {
    setSettings((prev: any) => {
      const enabled = prev.enabled_statuses.includes(statusValue)
      return {
        ...prev,
        enabled_statuses: enabled 
          ? prev.enabled_statuses.filter((s: string) => s !== statusValue)
          : [...prev.enabled_statuses, statusValue]
      }
    })
  }

  return (
    <div className="space-y-8 pb-12">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">AI Voice Calling</h1>
        <p className="text-muted-foreground mt-2">
          Configure automated calls, AI instructions, and the RAG knowledge base.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left Column: Settings & Prompt */}
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-xl border shadow-sm space-y-6">
            <div className="flex items-center gap-3 border-b pb-4">
              <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                <Bot className="w-5 h-5" />
              </div>
              <h2 className="text-lg font-semibold">AI Agent Configuration</h2>
            </div>
            
            <div className="space-y-3">
              <Label>Exotel Source Number (ExoPhone)</Label>
              <Input 
                value={settings.exotel_number || ''} 
                onChange={e => setSettings({...settings, exotel_number: e.target.value})}
                placeholder="e.g. +91XXXXXXXXXX" 
              />
              <p className="text-xs text-gray-500">The verified Exotel number that the AI will use to call customers.</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-3">
                <Label>Exotel Account SID</Label>
                <Input 
                  value={settings.exotel_sid || ''} 
                  onChange={e => setSettings({...settings, exotel_sid: e.target.value})}
                  placeholder="e.g. genestac1" 
                />
              </div>
              <div className="space-y-3">
                <Label>Exotel Subdomain</Label>
                <Input 
                  value={settings.exotel_subdomain || ''} 
                  onChange={e => setSettings({...settings, exotel_subdomain: e.target.value})}
                  placeholder="e.g. api.exotel.com" 
                />
              </div>
              <div className="space-y-3">
                <Label>Exotel API Key</Label>
                <Input 
                  value={settings.exotel_api_key || ''} 
                  onChange={e => setSettings({...settings, exotel_api_key: e.target.value})}
                  placeholder="Your API Key" 
                />
              </div>
              <div className="space-y-3">
                <Label>Exotel API Token</Label>
                <Input 
                  type="password"
                  value={settings.exotel_api_token || ''} 
                  onChange={e => setSettings({...settings, exotel_api_token: e.target.value})}
                  placeholder="Your API Token" 
                />
              </div>
            </div>

            <div className="space-y-3">
              <Label>System Prompt (Instructions)</Label>
              <Textarea 
                value={settings.base_prompt} 
                onChange={e => setSettings({...settings, base_prompt: e.target.value})}
                rows={8} 
                placeholder="You are an AI sales agent for..." 
              />
              <p className="text-xs text-gray-500">Provide the personality, goal, and rules for the AI here. Dynamic RAG context (like lead name and past summary) will be automatically injected.</p>
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl border shadow-sm space-y-6">
            <div className="flex items-center gap-3 border-b pb-4">
              <div className="p-2 bg-amber-50 text-amber-600 rounded-lg">
                <Clock className="w-5 h-5" />
              </div>
              <h2 className="text-lg font-semibold">Trigger & Scheduling</h2>
            </div>
            
            <div className="space-y-4">
              <Label>Enable Auto-Calling for these Lead Statuses</Label>
              <div className="grid grid-cols-2 gap-3">
                {leadStatuses.map(status => (
                  <div key={status.value} className="flex items-center space-x-2">
                    <Switch 
                      id={`status-${status.value}`} 
                      checked={settings.enabled_statuses.includes(status.value)}
                      onCheckedChange={() => toggleStatus(status.value)}
                    />
                    <Label htmlFor={`status-${status.value}`} className="cursor-pointer">{status.label}</Label>
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-500 mt-2">When a lead enters one of these statuses, the AI will queue a call.</p>
            </div>
          </div>

          <Button onClick={handleSaveSettings} disabled={saving} className="w-full">
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Save Settings
          </Button>
        </div>

        {/* Right Column: Knowledge Base */}
        <div className="bg-white p-6 rounded-xl border shadow-sm space-y-6 flex flex-col">
          <div className="flex items-center justify-between border-b pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-50 text-purple-600 rounded-lg">
                <Database className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Knowledge Base (RAG)</h2>
                <p className="text-xs text-gray-500">Data the AI can search during calls.</p>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto space-y-3 min-h-[300px]">
            {kb.length === 0 ? (
              <div className="text-center text-sm text-gray-400 py-10">
                No knowledge base items yet. Add company FAQs below.
              </div>
            ) : (
              kb.map((item) => (
                <div key={item.id} className="p-4 bg-gray-50 rounded-lg border group relative">
                  <h4 className="font-medium text-sm text-gray-900">{item.title}</h4>
                  <p className="text-xs text-gray-600 mt-1 line-clamp-3">{item.content}</p>
                  <button 
                    onClick={() => handleDeleteKb(item.id)}
                    className="absolute top-3 right-3 text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))
            )}
          </div>

          <div className="border-t pt-4 space-y-3">
            <h3 className="text-sm font-medium">Add New Fact</h3>
            <Input 
              placeholder="Title (e.g. Refund Policy)" 
              value={newKbTitle} 
              onChange={e => setNewKbTitle(e.target.value)} 
            />
            <Textarea 
              placeholder="Content..." 
              value={newKbContent} 
              onChange={e => setNewKbContent(e.target.value)} 
              rows={3}
            />
            <Button onClick={handleAddKb} disabled={addingKb || !newKbTitle || !newKbContent} className="w-full" variant="outline">
              {addingKb ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
              Add to Knowledge Base
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
