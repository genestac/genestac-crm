'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { createWhatsAppTemplate, syncWhatsAppTemplates, setTemplateHeaderUrl } from '../whatsapp-actions'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { RefreshCw, ImageIcon, AlertTriangle, CheckCircle2 } from 'lucide-react'

function getHeaderMeta(template: any) {
  const comps: any[] = template.default_components || []
  return comps.find((c: any) => c._meta && c.header_format) || null
}

export function ManageTemplatesModal({ isOpen, onClose, initialTemplates }: { isOpen: boolean, onClose: () => void, initialTemplates: any[] }) {
  const [templates, setTemplates] = useState(initialTemplates)
  const [isCreating, setIsCreating] = useState(false)
  const [name, setName] = useState('')
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  // Map of templateId -> pending URL input value
  const [urlInputs, setUrlInputs] = useState<Record<string, string>>({})
  const [savingUrl, setSavingUrl] = useState<string | null>(null)

  const handleSync = async () => {
    setIsSyncing(true)
    try {
      const res = await syncWhatsAppTemplates()
      if (res && res.message) {
        toast.success(res.message)
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

  const handleSaveUrl = async (templateId: string, headerFormat: string) => {
    const url = urlInputs[templateId]?.trim()
    if (!url) {
      toast.error("Please enter a valid URL")
      return
    }
    setSavingUrl(templateId)
    try {
      const res = await setTemplateHeaderUrl(templateId, url)
      if (res && res.message) {
        toast.success(res.message)
        // Update local state so the UI reflects saved URL immediately
        setTemplates(prev => prev.map(t => {
          if (t.id !== templateId) return t
          const updatedComps = (t.default_components || []).map((c: any) =>
            c._meta && c.header_format ? { ...c, header_media_url: url } : c
          )
          return { ...t, default_components: updatedComps }
        }))
      } else {
        toast.error(res.error || "Failed to save URL")
      }
    } catch {
      toast.error("An error occurred.")
    } finally {
      setSavingUrl(null)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
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

            <div className="space-y-3 pr-2">
              {templates.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No templates found. Add one to get started!</p>
              ) : (
                templates.map(temp => {
                  const headerMeta = getHeaderMeta(temp)
                  const savedUrl = headerMeta?.header_media_url
                  const currentInput = urlInputs[temp.id] ?? savedUrl ?? ''

                  return (
                    <div key={temp.id} className="p-3 border rounded-lg bg-gray-50">
                      <div className="flex justify-between items-center mb-2">
                        <span className="font-semibold text-sm">{temp.name}</span>
                        <div className="flex items-center gap-2">
                          {headerMeta && (
                            <Badge variant="outline" className="text-xs flex items-center gap-1 bg-blue-50 text-blue-700 border-blue-200">
                              <ImageIcon className="w-3 h-3" />
                              {headerMeta.header_format} Header
                            </Badge>
                          )}
                          <Badge variant="outline" className="bg-green-50 text-green-700">{temp.status}</Badge>
                        </div>
                      </div>
                      <p className="text-sm text-gray-600 whitespace-pre-wrap">{temp.content}</p>

                      {headerMeta && (
                        <div className="mt-3 p-2.5 border rounded-md bg-white space-y-2">
                          <div className="flex items-center gap-1.5 text-xs font-medium text-gray-700">
                            {savedUrl ? (
                              <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
                            ) : (
                              <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                            )}
                            {savedUrl ? 'Media URL configured' : `${headerMeta.header_format} header requires a public media URL`}
                          </div>
                          <div className="flex gap-2">
                            <Input
                              className="text-xs h-8"
                              placeholder={`https://your-domain.com/image.jpg`}
                              value={currentInput}
                              onChange={e => setUrlInputs(prev => ({ ...prev, [temp.id]: e.target.value }))}
                            />
                            <Button
                              size="sm"
                              className="h-8 shrink-0"
                              disabled={savingUrl === temp.id || currentInput === savedUrl}
                              onClick={() => handleSaveUrl(temp.id, headerMeta.header_format)}
                            >
                              {savingUrl === temp.id ? 'Saving...' : 'Save'}
                            </Button>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Must be a publicly accessible HTTPS URL. This image will be sent with every campaign using this template.
                          </p>
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
