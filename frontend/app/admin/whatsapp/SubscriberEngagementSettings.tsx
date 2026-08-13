'use client'

import { useState, useEffect } from 'react'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { getSubscriberEngagementSettings, updateSubscriberEngagementSettings } from '../whatsapp-actions'
import { toast } from 'sonner'
import { Activity, Variable, Info, ChevronDown, ChevronUp } from 'lucide-react'

// All subscriber data fields that can be injected into template variables
const AVAILABLE_FIELDS = [
  { key: 'name',           label: 'Full Name',         example: 'Priya Sharma' },
  { key: 'first_name',     label: 'First Name',        example: 'Priya' },
  { key: 'days_inactive',  label: 'Days Inactive',     example: '3' },
  { key: 'last_log_date',  label: 'Last Log Date',     example: '2026-08-10' },
  { key: 'today',          label: "Today's Date",      example: '2026-08-13' },
  { key: 'phone',          label: 'Phone Number',      example: '9876543210' },
]

type MappingType = { reminder: Record<string, string>, motivation: Record<string, string> }

function VariableMappingEditor({
  label,
  type,
  templateContent,
  mappings,
  onChange,
}: {
  label: string
  type: 'reminder' | 'motivation'
  templateContent: string
  mappings: Record<string, string>
  onChange: (mappings: Record<string, string>) => void
}) {
  // Detect {{N}} slots in the template content
  const slots = [...new Set([...templateContent.matchAll(/\{\{(\d+)\}\}/g)].map(m => m[1]))].sort((a, b) => Number(a) - Number(b))

  if (slots.length === 0) return null

  return (
    <div className="border rounded-xl p-4 space-y-3 bg-gray-50/70">
      <div className="flex items-center gap-2">
        <Variable className="w-4 h-4 text-purple-600" />
        <span className="text-sm font-semibold text-gray-700">{label} — Variable Mapping</span>
        <Badge variant="outline" className="text-xs ml-auto">{slots.length} variable{slots.length > 1 ? 's' : ''} detected</Badge>
      </div>
      <p className="text-xs text-muted-foreground">
        Map each <code className="bg-gray-200 px-1 rounded">{'{{N}}'}</code> placeholder in the template to a subscriber data field. 
        The real value will be injected when the message is sent.
      </p>
      <div className="space-y-2">
        {slots.map(slot => (
          <div key={slot} className="flex items-center gap-3">
            <code className="text-sm font-mono bg-purple-100 text-purple-700 px-2 py-1 rounded w-12 text-center shrink-0">
              {`{{${slot}}}`}
            </code>
            <span className="text-gray-400 text-sm">→</span>
            <Select
              value={mappings[slot] || ''}
              onValueChange={val => {
                const updated = { ...mappings }
                if (val) updated[slot] = val
                else delete updated[slot]
                onChange(updated)
              }}
            >
              <SelectTrigger className="flex-1 h-9 text-sm">
                <SelectValue placeholder="Select field..." />
              </SelectTrigger>
              <SelectContent>
                {AVAILABLE_FIELDS.map(f => (
                  <SelectItem key={f.key} value={f.key}>
                    <span className="font-medium">{f.label}</span>
                    <span className="text-muted-foreground ml-2 text-xs">e.g. &quot;{f.example}&quot;</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {mappings[slot] && (
              <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs shrink-0">
                {AVAILABLE_FIELDS.find(f => f.key === mappings[slot])?.example || mappings[slot]}
              </Badge>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

export function SubscriberEngagementSettings({ templates }: { templates: any[] }) {
  const [enabled, setEnabled] = useState(false)
  const [reminderTemplateId, setReminderTemplateId] = useState('')
  const [motivationTemplateId, setMotivationTemplateId] = useState('')
  const [inactivityDays, setInactivityDays] = useState(1)
  const [minDaysBetweenNudges, setMinDaysBetweenNudges] = useState(1)
  const [sendTime, setSendTime] = useState('09:00')
  const [variableMappings, setVariableMappings] = useState<MappingType>({ reminder: {}, motivation: {} })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showVariables, setShowVariables] = useState(false)

  useEffect(() => {
    getSubscriberEngagementSettings().then((data) => {
      setEnabled(data.enabled ?? false)
      setReminderTemplateId(data.reminder_template_id || '')
      setMotivationTemplateId(data.motivation_template_id || '')
      setInactivityDays(data.inactivity_days_threshold ?? 1)
      setMinDaysBetweenNudges(data.min_days_between_nudges ?? 1)
      setSendTime(data.send_time || '09:00')
      setVariableMappings(data.variable_mappings || { reminder: {}, motivation: {} })
      setLoading(false)
    })
  }, [])

  const reminderTemplate = templates.find(t => t.id === reminderTemplateId)
  const motivationTemplate = templates.find(t => t.id === motivationTemplateId)

  const handleSave = async () => {
    if (enabled && !reminderTemplateId) {
      toast.error('Please select a Reminder template')
      return
    }
    if (enabled && !motivationTemplateId) {
      toast.error('Please select a Motivation template')
      return
    }
    setSaving(true)
    try {
      await updateSubscriberEngagementSettings({
        enabled,
        reminder_template_id: reminderTemplateId,
        motivation_template_id: motivationTemplateId,
        inactivity_days_threshold: inactivityDays,
        min_days_between_nudges: minDaysBetweenNudges,
        send_time: sendTime,
        variable_mappings: variableMappings,
      })
      toast.success('Subscriber engagement settings saved')
    } catch (e) {
      toast.error('Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return null

  const hasVariables =
    (reminderTemplate?.content && /\{\{\d+\}\}/.test(reminderTemplate.content)) ||
    (motivationTemplate?.content && /\{\{\d+\}\}/.test(motivationTemplate.content))

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-blue-600" />
          <CardTitle>Subscriber Engagement Reminders</CardTitle>
        </div>
        <CardDescription>
          Automatically send a personalized WhatsApp message to subscribed users based on whether they
          logged their health data today. Uses two templates — one for inactive users, one for consistent users.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-center space-x-2">
          <Switch id="sub-engagement" checked={enabled} onCheckedChange={setEnabled} />
          <Label htmlFor="sub-engagement">Enable Daily Engagement Reminders</Label>
        </div>

        <div className={`space-y-6 mt-4 ${!enabled ? 'opacity-50 pointer-events-none' : ''}`}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* LEFT: Template Config */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="font-semibold text-orange-600">😴 Reminder Template</Label>
                <p className="text-xs text-muted-foreground">
                  Sent when a user hasn&apos;t logged data. (e.g. &quot;Hey {{1}}, you forgot to log today! 🏋️&quot;)
                </p>
                <Select value={reminderTemplateId} onValueChange={(val) => setReminderTemplateId(val || '')}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select reminder template" />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map(t => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {reminderTemplate?.content && (
                  <div className="text-xs bg-orange-50 border border-orange-100 rounded-lg p-3 text-gray-600 font-mono whitespace-pre-wrap">
                    {reminderTemplate.content}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label className="font-semibold text-green-600">💪 Motivation Template</Label>
                <p className="text-xs text-muted-foreground">
                  Sent when a user HAS logged data today. (e.g. &quot;{{1}}, you&apos;re crushing it! 🔥&quot;)
                </p>
                <Select value={motivationTemplateId} onValueChange={(val) => setMotivationTemplateId(val || '')}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select motivation template" />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map(t => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {motivationTemplate?.content && (
                  <div className="text-xs bg-green-50 border border-green-100 rounded-lg p-3 text-gray-600 font-mono whitespace-pre-wrap">
                    {motivationTemplate.content}
                  </div>
                )}
              </div>
            </div>

            {/* RIGHT: Timing Config */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Send Reminder After (days inactive)</Label>
                <p className="text-xs text-muted-foreground">
                  How many days without any log entry triggers the reminder. Set to 1 for daily nudges.
                </p>
                <Input
                  type="number"
                  min={1}
                  max={30}
                  value={inactivityDays}
                  onChange={(e) => setInactivityDays(parseInt(e.target.value) || 1)}
                  className="w-24"
                />
              </div>

              <div className="space-y-2">
                <Label>Min Days Between Nudges</Label>
                <p className="text-xs text-muted-foreground">
                  Prevents spamming the same user multiple days in a row if they remain inactive.
                </p>
                <Input
                  type="number"
                  min={1}
                  max={7}
                  value={minDaysBetweenNudges}
                  onChange={(e) => setMinDaysBetweenNudges(parseInt(e.target.value) || 1)}
                  className="w-24"
                />
              </div>

              <div className="space-y-2">
                <Label>Daily Send Time</Label>
                <p className="text-xs text-muted-foreground">
                  What time to run the daily engagement check (IST).
                </p>
                <Input
                  type="time"
                  value={sendTime}
                  onChange={(e) => setSendTime(e.target.value)}
                  className="w-32"
                />
              </div>
            </div>
          </div>

          {/* Personalization Section */}
          {(reminderTemplateId || motivationTemplateId) && (
            <div className="border-t pt-4">
              <button
                type="button"
                className="flex items-center gap-2 text-sm font-semibold text-purple-700 hover:text-purple-900 transition-colors w-full"
                onClick={() => setShowVariables(v => !v)}
              >
                <Variable className="w-4 h-4" />
                Personalize Messages
                {hasVariables && (
                  <Badge className="bg-purple-100 text-purple-700 border-purple-200 text-xs ml-1">Variables detected</Badge>
                )}
                <span className="ml-auto text-gray-400">
                  {showVariables ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </span>
              </button>

              {showVariables && (
                <div className="mt-4 space-y-4">
                  <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-100 rounded-lg text-xs text-blue-700">
                    <Info className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>
                      If your WhatsApp templates use <code className="bg-blue-100 px-1 rounded">{'{{1}}'}</code>, <code className="bg-blue-100 px-1 rounded">{'{{2}}'}</code> etc., 
                      map each slot below to a subscriber data field. The real value is injected automatically at send time.
                      <br/><br/>
                      <strong>Available fields:</strong> {AVAILABLE_FIELDS.map(f => f.label).join(', ')}
                    </span>
                  </div>

                  {reminderTemplate?.content && (
                    <VariableMappingEditor
                      label="😴 Reminder Template"
                      type="reminder"
                      templateContent={reminderTemplate.content}
                      mappings={variableMappings.reminder || {}}
                      onChange={m => setVariableMappings(prev => ({ ...prev, reminder: m }))}
                    />
                  )}

                  {!reminderTemplate?.content && reminderTemplateId && (
                    <p className="text-xs text-muted-foreground italic">Reminder template has no detectable variables ({{'{{}}'}} patterns).</p>
                  )}

                  {motivationTemplate?.content && (
                    <VariableMappingEditor
                      label="💪 Motivation Template"
                      type="motivation"
                      templateContent={motivationTemplate.content}
                      mappings={variableMappings.motivation || {}}
                      onChange={m => setVariableMappings(prev => ({ ...prev, motivation: m }))}
                    />
                  )}

                  {!motivationTemplate?.content && motivationTemplateId && (
                    <p className="text-xs text-muted-foreground italic">Motivation template has no detectable variables.</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <Button onClick={handleSave} disabled={saving} className="mt-2">
          {saving ? 'Saving...' : 'Save Settings'}
        </Button>
      </CardContent>
    </Card>
  )
}
