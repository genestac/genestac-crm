'use client'

import { useState, useEffect } from 'react'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { getAutoResponderSettings, updateAutoResponderSettings } from '../whatsapp-actions'
import { toast } from 'sonner'
import { BotMessageSquare } from 'lucide-react'

export function AutoResponderSettings({ templates }: { templates: any[] }) {
  const [enabled, setEnabled] = useState(false)
  const [templateId, setTemplateId] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    getAutoResponderSettings().then((data) => {
      setEnabled(data.enabled)
      setTemplateId(data.template_id || '')
      setLoading(false)
    })
  }, [])

  const handleSave = async () => {
    if (enabled && !templateId) {
      toast.error("Please select a template for the auto-responder")
      return
    }
    setSaving(true)
    try {
      await updateAutoResponderSettings(enabled, templateId)
      toast.success("Auto-responder settings saved")
    } catch (e) {
      toast.error("Failed to save auto-responder settings")
    } finally {
      setSaving(false)
    }
  }

  if (loading) return null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <BotMessageSquare className="w-5 h-5 text-green-600" />
          <CardTitle>Welcome Message Auto-Responder</CardTitle>
        </div>
        <CardDescription>
          Automatically send a WhatsApp template message the moment a new lead is added to the system.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center space-x-2">
          <Switch id="autoresponder" checked={enabled} onCheckedChange={setEnabled} />
          <Label htmlFor="autoresponder">Enable Auto-Responder</Label>
        </div>
        
        {enabled && (
          <div className="space-y-2 mt-4 max-w-md">
            <Label>Select Template</Label>
            <Select value={templateId} onValueChange={setTemplateId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a welcome template" />
              </SelectTrigger>
              <SelectContent>
                {templates.map(t => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        
        <Button onClick={handleSave} disabled={saving} className="mt-4">
          {saving ? "Saving..." : "Save Settings"}
        </Button>
      </CardContent>
    </Card>
  )
}
