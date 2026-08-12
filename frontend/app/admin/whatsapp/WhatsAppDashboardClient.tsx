'use client'

import { useState } from 'react'
import { PlusCircle, FileText, Send, Clock, CheckCircle2, XCircle, MessageCircle, Trash2, Edit, Repeat, Play, Pause } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ManageTemplatesModal } from './ManageTemplatesModal'
import { AutoResponderSettings } from './AutoResponderSettings'
import { SubscriberEngagementSettings } from './SubscriberEngagementSettings'
import { CampaignStatsModal } from './CampaignStatsModal'
import Link from 'next/link'
import { deleteWhatsAppCampaign, startWhatsAppCampaignNow, pauseWhatsAppCampaign, continueWhatsAppCampaign } from '../whatsapp-actions'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'

export function WhatsAppDashboardClient({ initialCampaigns, templates, leadStatuses, sources }: { initialCampaigns: any[], templates: any[], leadStatuses: any[], sources: any[] }) {
  const [campaigns, setCampaigns] = useState(initialCampaigns)
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false)
  const [selectedStatsCampaign, setSelectedStatsCampaign] = useState<any>(null)
  const router = useRouter()

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this campaign?")) return
    try {
      await deleteWhatsAppCampaign(id)
      setCampaigns(campaigns.filter(c => c.id !== id))
      toast.success("Campaign deleted")
    } catch (e) {
      toast.error("Failed to delete campaign")
    }
  }

  const handleStartNow = async (id: string) => {
    try {
      await startWhatsAppCampaignNow(id)
      setCampaigns(campaigns.map(c => c.id === id ? { ...c, status: 'RUNNING' } : c))
      toast.success("Campaign is starting in the background!")
    } catch (e) {
      toast.error("Failed to start campaign")
    }
  }

  const handlePause = async (id: string) => {
    try {
      await pauseWhatsAppCampaign(id)
      setCampaigns(campaigns.map(c => c.id === id ? { ...c, status: 'PAUSED' } : c))
      toast.success("Campaign paused")
    } catch (e) {
      toast.error("Failed to pause campaign")
    }
  }

  const handleContinue = async (id: string) => {
    try {
      await continueWhatsAppCampaign(id)
      setCampaigns(campaigns.map(c => c.id === id ? { ...c, status: 'RUNNING' } : c))
      toast.success("Campaign is continuing in the background!")
    } catch (e) {
      toast.error("Failed to continue campaign")
    }
  }

  const getStatusIcon = (status: string) => {
    switch(status) {
      case 'COMPLETED': return <CheckCircle2 className="w-4 h-4 text-green-500" />
      case 'PENDING': return <Clock className="w-4 h-4 text-orange-500" />
      case 'RUNNING': return <Send className="w-4 h-4 text-blue-500" />
      default: return <XCircle className="w-4 h-4 text-red-500" />
    }
  }

  const getStatusBadge = (status: string) => {
    switch(status) {
      case 'COMPLETED': return <Badge variant="secondary" className="bg-green-100 text-green-700">Completed</Badge>
      case 'PENDING': return <Badge variant="secondary" className="bg-orange-100 text-orange-700">Scheduled</Badge>
      case 'RUNNING': return <Badge variant="secondary" className="bg-blue-100 text-blue-700">Running</Badge>
      case 'PAUSED': return <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">Paused</Badge>
      default: return <Badge variant="secondary" className="bg-red-100 text-red-700">Failed/Cancelled</Badge>
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex gap-4">
        <Link href="/admin/whatsapp/create">
          <Button>
            <PlusCircle className="w-4 h-4 mr-2" />
            Create Campaign
          </Button>
        </Link>
        <Button variant="outline" onClick={() => setIsTemplateModalOpen(true)}>
          <MessageCircle className="w-4 h-4 mr-2" />
          Manage Templates
        </Button>
      </div>

      <AutoResponderSettings templates={templates} />

      <SubscriberEngagementSettings templates={templates} />

      <Card>
        <CardHeader>
          <CardTitle>Recent Campaigns</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {campaigns.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground">
                No campaigns found. Create your first bulk messaging blast!
              </div>
            ) : (
              <div className="divide-y">
                {campaigns.map((camp) => (
                  <div key={camp.id} className="flex items-center justify-between py-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900">{camp.name}</span>
                        {getStatusBadge(camp.status)}
                      </div>
                      <div className="text-sm text-muted-foreground mt-1 flex flex-wrap items-center gap-4">
                        <span className="flex items-center gap-1">
                          <FileText className="w-3 h-3" />
                          Template: {camp.whatsapp_templates?.name || 'Unknown'}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          Scheduled: {new Date(camp.scheduled_time).toLocaleString()}
                        </span>
                        {camp.stats && camp.stats.total > 0 && (
                          <div className="flex items-center gap-3 ml-2">
                            <div className="w-24 h-2 bg-gray-100 rounded-full overflow-hidden border">
                              <div 
                                className="h-full bg-emerald-500" 
                                style={{ width: `${camp.stats.percentage}%` }}
                              />
                            </div>
                            <span className="text-xs font-medium">
                              {camp.stats.percentage}% ({camp.stats.sent} / {camp.stats.total})
                            </span>
                            {camp.stats.failed > 0 && (
                              <span className="text-xs text-red-500 font-medium ml-1">
                                {camp.stats.failed} failed
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="ghost" size="sm" onClick={() => setSelectedStatsCampaign(camp)}>View Stats</Button>
                      
                      {camp.status === 'RUNNING' && (
                        <Button variant="ghost" size="icon" title="Pause" onClick={() => handlePause(camp.id)}>
                          <Pause className="w-4 h-4 text-yellow-600" />
                        </Button>
                      )}

                      {camp.status === 'PAUSED' && (
                        <Button variant="ghost" size="icon" title="Continue" onClick={() => handleContinue(camp.id)}>
                          <Play className="w-4 h-4 text-blue-600" />
                        </Button>
                      )}

                      {camp.status === 'PENDING' && (
                        <>
                          <Button variant="ghost" size="icon" title="Start Now" onClick={() => handleStartNow(camp.id)}>
                            <Play className="w-4 h-4 text-emerald-600" />
                          </Button>
                          <Link href={`/admin/whatsapp/create?edit=${camp.id}`}>
                            <Button variant="ghost" size="icon" title="Edit Campaign">
                              <Edit className="w-4 h-4 text-blue-600" />
                            </Button>
                          </Link>
                        </>
                      )}
                      
                      <Link href={`/admin/whatsapp/create?retrigger=${camp.id}`}>
                        <Button variant="ghost" size="icon" title="Retrigger / Copy">
                          <Repeat className="w-4 h-4 text-green-600" />
                        </Button>
                      </Link>
                      
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(camp.id)} title="Delete Campaign">
                        <Trash2 className="w-4 h-4 text-red-600" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <CampaignStatsModal 
        campaign={selectedStatsCampaign}
        open={!!selectedStatsCampaign}
        onOpenChange={(open) => !open && setSelectedStatsCampaign(null)}
      />

      <ManageTemplatesModal 
        isOpen={isTemplateModalOpen} 
        onClose={() => setIsTemplateModalOpen(false)} 
        initialTemplates={templates}
      />
    </div>
  )
}
