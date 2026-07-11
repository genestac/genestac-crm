'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { createWhatsAppCampaign, estimateCampaignAudience, updateWhatsAppCampaign } from '../../whatsapp-actions'
import { toast } from 'sonner'
import { Checkbox } from '@/components/ui/checkbox'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Users, Loader2 } from 'lucide-react'

export function CreateCampaignClient({ templates, leadStatuses, sources, initialCampaign, mode }: { templates: any[], leadStatuses: any[], sources: any[], initialCampaign?: any, mode: 'create' | 'edit' | 'retrigger' }) {
  const router = useRouter()
  
  const [name, setName] = useState(initialCampaign?.name || '')
  const [templateId, setTemplateId] = useState(initialCampaign?.template_id || '')
  
  const initFilter = initialCampaign?.audience_filter || {}
  
  // Smart Filters
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>(initFilter.statuses || [])
  const [selectedSources, setSelectedSources] = useState<string[]>(initFilter.source_ids || [])
  
  const [excludeRecent, setExcludeRecent] = useState(initFilter.exclude_recently_contacted_days !== undefined && initFilter.exclude_recently_contacted_days !== null)
  const [excludeRecentDays, setExcludeRecentDays] = useState(initFilter.exclude_recently_contacted_days || 7)
  
  const [excludeSameTemplate, setExcludeSameTemplate] = useState(initFilter.exclude_previous_campaigns_with_same_template ?? true)

  const hasSchedule = initialCampaign?.scheduled_time && initialCampaign.status === 'PENDING'
  const [isScheduled, setIsScheduled] = useState(mode === 'edit' ? hasSchedule : false)
  const [scheduledTime, setScheduledTime] = useState(mode === 'edit' && hasSchedule ? new Date(initialCampaign.scheduled_time).toISOString().slice(0, 16) : '')
  
  const [loading, setLoading] = useState(false)
  const [estimating, setEstimating] = useState(false)
  
  const [audienceEstimate, setAudienceEstimate] = useState<{count: number, preview: any[]}>({ count: 0, preview: [] })

  // When edit or retrigger is active, we might want to append " (Copy)" if retrigger
  useEffect(() => {
    if (mode === 'retrigger' && name && !name.endsWith('(Copy)')) {
      setName(name + ' (Copy)')
    }
  }, [mode])

  // Debounced estimation
  useEffect(() => {
    const timer = setTimeout(async () => {
      setEstimating(true)
      try {
        const filter = {
          statuses: selectedStatuses.length > 0 ? selectedStatuses : null,
          source_ids: selectedSources.length > 0 ? selectedSources : null,
          exclude_recently_contacted_days: excludeRecent ? excludeRecentDays : null,
          exclude_previous_campaigns_with_same_template: excludeSameTemplate
        }
        const res = await estimateCampaignAudience(templateId, filter)
        if (res) setAudienceEstimate(res)
      } catch (e) {
        console.error("Estimation failed", e)
      } finally {
        setEstimating(false)
      }
    }, 500)
    
    return () => clearTimeout(timer)
  }, [selectedStatuses, selectedSources, excludeRecent, excludeRecentDays, excludeSameTemplate, templateId])

  const toggleStatus = (val: string) => {
    setSelectedStatuses(prev => prev.includes(val) ? prev.filter(s => s !== val) : [...prev, val])
  }

  const toggleSource = (val: string) => {
    setSelectedSources(prev => prev.includes(val) ? prev.filter(s => s !== val) : [...prev, val])
  }

  const handleSave = async () => {
    if (!name || !templateId) {
      toast.error("Please provide a name and select a template.")
      return
    }
    
    setLoading(true)
    try {
      const time = isScheduled && scheduledTime ? new Date(scheduledTime).toISOString() : undefined
      
      const audienceFilter = {
        statuses: selectedStatuses.length > 0 ? selectedStatuses : null,
        source_ids: selectedSources.length > 0 ? selectedSources : null,
        exclude_recently_contacted_days: excludeRecent ? excludeRecentDays : null,
        exclude_previous_campaigns_with_same_template: excludeSameTemplate
      }

      let res;
      if (mode === 'edit') {
        res = await updateWhatsAppCampaign(initialCampaign.id, name, templateId, audienceFilter, time)
        toast.success(`Campaign updated successfully!`)
      } else {
        res = await createWhatsAppCampaign(name, templateId, audienceFilter, time)
        toast.success(`Campaign created successfully! Audience size: ${res?.audience_size || audienceEstimate.count}`)
      }
      
      router.push('/admin/whatsapp')
      
    } catch (err) {
      toast.error(`Failed to ${mode} campaign.`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="grid grid-cols-3 gap-6">
      <div className="col-span-2">
        <Card>
          <CardContent className="space-y-6 pt-6">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Campaign Name</Label>
                <Input value={name} onChange={e => setName(e.target.value)} placeholder="Summer Promo 2026" className="mt-1" />
              </div>
              <div>
                <Label>Message Template</Label>
                <Select value={templateId} onValueChange={setTemplateId}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select a template" />
                  </SelectTrigger>
                  <SelectContent>
                    {templates?.map(t => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="border rounded-md p-6 bg-gray-50/50">
              <h4 className="font-semibold mb-4 text-gray-700">1. Define Target Audience</h4>
              
              <div className="grid grid-cols-2 gap-8">
                {/* Status Filter */}
                <div>
                  <Label className="mb-2 block text-sm">Target by Status <span className="text-gray-500 font-normal">(Leave empty for all)</span></Label>
                  <div className="max-h-52 overflow-y-auto border bg-white rounded-md p-3 space-y-3">
                    {leadStatuses?.map(status => (
                      <div key={status.value} className="flex items-center space-x-2">
                        <Checkbox 
                          id={`status-${status.value}`}
                          checked={selectedStatuses.includes(status.value)}
                          onCheckedChange={() => toggleStatus(status.value)}
                        />
                        <label htmlFor={`status-${status.value}`} className="text-sm cursor-pointer">{status.label}</label>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Source Filter */}
                <div>
                  <Label className="mb-2 block text-sm">Target by Source <span className="text-gray-500 font-normal">(Leave empty for all)</span></Label>
                  <div className="max-h-52 overflow-y-auto border bg-white rounded-md p-3 space-y-3">
                    {sources?.map(source => (
                      <div key={source.id} className="flex items-center space-x-2">
                        <Checkbox 
                          id={`source-${source.id}`}
                          checked={selectedSources.includes(source.id)}
                          onCheckedChange={() => toggleSource(source.id)}
                        />
                        <label htmlFor={`source-${source.id}`} className="text-sm cursor-pointer">{source.name}</label>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="border rounded-md p-6 bg-blue-50/30">
              <h4 className="font-semibold mb-4 text-gray-700">2. Intelligent Exclusions</h4>
              
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="flex flex-col">
                    <Label className="text-sm">Don't spam recent contacts</Label>
                    <span className="text-sm text-gray-500 mt-1">Exclude leads who already received any WhatsApp message recently.</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox checked={excludeRecent} onCheckedChange={(c) => setExcludeRecent(c as boolean)} />
                    {excludeRecent && (
                      <div className="flex items-center gap-1">
                        <Input type="number" value={excludeRecentDays} onChange={e => setExcludeRecentDays(Number(e.target.value))} className="w-16 h-8 text-center" />
                        <span className="text-sm text-gray-600">days</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex flex-col">
                    <Label className="text-sm">Prevent duplicate templates</Label>
                    <span className="text-sm text-gray-500 mt-1">Exclude leads who have already received this specific template before.</span>
                  </div>
                  <Checkbox checked={excludeSameTemplate} onCheckedChange={(c) => setExcludeSameTemplate(c as boolean)} />
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-2 pt-4 border-t">
              <Checkbox checked={isScheduled} onCheckedChange={(c) => setIsScheduled(c as boolean)} />
              <Label>Schedule for later?</Label>
            </div>
            
            {isScheduled && (
              <div className="pt-2">
                <Label>Scheduled Time</Label>
                <Input type="datetime-local" value={scheduledTime} onChange={e => setScheduledTime(e.target.value)} className="mt-1 w-64" />
              </div>
            )}

            <div className="flex justify-end gap-4 pt-4 border-t mt-8">
              <Button variant="outline" onClick={() => router.push('/admin/whatsapp')} disabled={loading}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={loading} size="lg">
                {loading ? 'Processing...' : (mode === 'edit' ? 'Save Changes' : (isScheduled ? 'Schedule Campaign' : 'Create & Send'))}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="col-span-1">
        <Card className="sticky top-6">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-blue-100 text-blue-600 rounded-lg">
                <Users className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-lg">Audience Preview</h3>
                <p className="text-sm text-gray-500">Live estimate</p>
              </div>
            </div>

            <div className="text-center py-6 border-y my-4">
              {estimating ? (
                <div className="flex flex-col items-center justify-center text-gray-400">
                  <Loader2 className="w-8 h-8 animate-spin mb-2" />
                  <p>Calculating...</p>
                </div>
              ) : (
                <div>
                  <span className="text-5xl font-black text-gray-900">{audienceEstimate.count}</span>
                  <p className="text-gray-500 mt-2 font-medium uppercase tracking-wide text-xs">Leads Targeted</p>
                </div>
              )}
            </div>

            {!estimating && audienceEstimate.count > 0 && (
              <div>
                <Label className="text-xs text-gray-500 uppercase tracking-wider mb-3 block">Preview ({Math.min(5, audienceEstimate.count)})</Label>
                <div className="space-y-3">
                  {audienceEstimate.preview.map(lead => (
                    <div key={lead.id} className="flex flex-col text-sm border-b pb-2 last:border-0">
                      <span className="font-medium text-gray-900">{lead.name || 'Unknown'}</span>
                      <span className="text-gray-500">{lead.phone_number}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
