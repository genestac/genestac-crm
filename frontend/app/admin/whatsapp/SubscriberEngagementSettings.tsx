'use client'

import { useState, useEffect } from 'react'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getSubscriberEngagementSettings, updateSubscriberEngagementSettings } from '../whatsapp-actions'
import { toast } from 'sonner'
import { Activity } from 'lucide-react'

export function SubscriberEngagementSettings({ templates }: { templates: any[] }) {
  const [enabled, setEnabled] = useState(false)
  const [reminderTemplateId, setReminderTemplateId] = useState('')   // "Hey you forgot to log!"
  const [motivationTemplateId, setMotivationTemplateId] = useState('') // "Great job, keep going!"
  const [inactivityDays, setInactivityDays] = useState(1)
  const [minDaysBetweenNudges, setMinDaysBetweenNudges] = useState(1)
  const [sendTime, setSendTime] = useState('09:00')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    getSubscriberEngagementSettings().then((data) => {
      setEnabled(data.enabled ?? false)
      setReminderTemplateId(data.reminder_template_id || '')
      setMotivationTemplateId(data.motivation_template_id || '')
      setInactivityDays(data.inactivity_days_threshold ?? 1)
      setMinDaysBetweenNudges(data.min_days_between_nudges ?? 1)
      setSendTime(data.send_time || '09:00')
      setLoading(false)
    })
  }, [])

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
      })
      toast.success('Subscriber engagement settings saved')
    } catch (e) {
      toast.error('Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return null

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-blue-600" />
          <CardTitle>Subscriber Engagement Reminders</CardTitle>
        </div>
        <CardDescription>
          Automatically send a WhatsApp message to subscribed users based on whether they
          logged their health data (weight, water, sleep, steps) today. Uses two separate
          templates — one for inactive users and one to motivate consistent users.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-center space-x-2">
          <Switch id="sub-engagement" checked={enabled} onCheckedChange={setEnabled} />
          <Label htmlFor="sub-engagement">Enable Daily Engagement Reminders</Label>
        </div>

        <div className={`grid grid-cols-1 md:grid-cols-2 gap-6 mt-4 ${!enabled ? 'opacity-50 pointer-events-none' : ''}`}>
          {/* LEFT: Template Config */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="font-semibold text-orange-600">😴 Reminder Template</Label>
              <p className="text-xs text-muted-foreground">
                Sent when a user hasn&apos;t logged any data today. (e.g. &quot;Hey! You forgot to log your weight today 🏋️&quot;)
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
            </div>

            <div className="space-y-2">
              <Label className="font-semibold text-green-600">💪 Motivation Template</Label>
              <p className="text-xs text-muted-foreground">
                Sent when a user HAS logged data today — celebrate their consistency! (e.g. &quot;You're crushing it! Keep going 🔥&quot;)
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
                What time to run the daily engagement check (server time, IST).
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

        <Button onClick={handleSave} disabled={saving} className="mt-2">
          {saving ? 'Saving...' : 'Save Settings'}
        </Button>
      </CardContent>
    </Card>
  )
}
