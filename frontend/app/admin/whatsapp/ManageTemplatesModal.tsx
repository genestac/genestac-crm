'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { createWhatsAppTemplate, syncWhatsAppTemplates } from '../whatsapp-actions'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { RefreshCw } from 'lucide-react'

export function ManageTemplatesModal({ isOpen, onClose, initialTemplates }: { isOpen: boolean, onClose: () => void, initialTemplates: any[] }) {
  const [templates, setTemplates] = useState(initialTemplates)
  const [isCreating, setIsCreating] = useState(false)
  const [name, setName] = useState('')
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)

  const handleSync = async () => {
    setIsSyncing(true)
    try {
      const res = await syncWhatsAppTemplates()
      if (res && res.message) {
        toast.success(res.message)
        // Refresh the page to get the updated templates
        window.location.reload()
      } else {
        toast.error(res.error || "Failed to sync templates")
      }
    } catch (e) {
      toast.error("An error occurred while syncing.")
    } finally {
      setIsSyncing(false)
    }
  }

  const handleCreate = async () => {
    if (!name || !content) {
      toast.error("Please fill all fields")
      return
    }
    setLoading(true)
    try {
      const newTemp = await createWhatsAppTemplate(name, content)
      setTemplates([newTemp, ...templates])
      setIsCreating(false)
      setName('')
      setContent('')
      toast.success("Template created successfully!")
    } catch (err) {
      toast.error("Failed to create template")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Manage WhatsApp Templates</DialogTitle>
        </DialogHeader>

        {isCreating ? (
          <div className="space-y-4 my-4">
            <div>
              <Label>Template Name (Meta API Name)</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="hello_world" />
              <p className="text-xs text-muted-foreground mt-1">Must exactly match the template name approved in your Meta Business Manager.</p>
            </div>
            <div>
              <Label>Template Content</Label>
              <Textarea value={content} onChange={e => setContent(e.target.value)} placeholder="Hello {{1}}, welcome to Genestac!" rows={4} />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setIsCreating(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={loading}>{loading ? 'Creating...' : 'Save Template'}</Button>
            </div>
          </div>
        ) : (
          <div className="my-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-medium text-sm text-gray-500">Your Templates</h3>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={handleSync} disabled={isSyncing}>
                  <RefreshCw className={`w-4 h-4 mr-2 ${isSyncing ? 'animate-spin' : ''}`} />
                  Sync from Meta
                </Button>
                <Button size="sm" onClick={() => setIsCreating(true)}>Add New Template</Button>
              </div>
            </div>
            
            <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
              {templates.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No templates found. Add one to get started!</p>
              ) : (
                templates.map(temp => (
                  <div key={temp.id} className="p-3 border rounded-lg bg-gray-50">
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-semibold text-sm">{temp.name}</span>
                      <Badge variant="outline" className="bg-green-50 text-green-700">{temp.status}</Badge>
                    </div>
                    <p className="text-sm text-gray-600 whitespace-pre-wrap">{temp.content}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
