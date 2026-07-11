import { getWhatsAppCampaigns, getWhatsAppTemplates } from '../whatsapp-actions'
import { WhatsAppDashboardClient } from './WhatsAppDashboardClient'
import { PlusCircle, MessageCircle } from 'lucide-react'
import { fetchAPI } from '@/utils/api'
import { cookies } from 'next/headers'

export default async function WhatsAppCampaignsPage() {
  const campaigns = await getWhatsAppCampaigns()
  const templates = await getWhatsAppTemplates()
  
  const cookieStr = (await cookies()).toString()
  const { data: sourcesData } = await fetchAPI('/api/admin/crm-settings/sources', {
    headers: { 'Cookie': cookieStr }
  })
  
  const { data: globalSettings } = await fetchAPI('/api/admin/crm-settings/global', {
    headers: { 'Cookie': cookieStr }
  })
  
  const leadStatuses = globalSettings?.lead_statuses || []
  const sources = sourcesData || []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 flex items-center gap-3">
            <MessageCircle className="w-8 h-8 text-green-500" />
            WhatsApp Campaigns
          </h1>
          <p className="text-muted-foreground mt-2">
            Manage your bulk messaging campaigns and templates.
          </p>
        </div>
      </div>

      <WhatsAppDashboardClient 
        initialCampaigns={campaigns} 
        templates={templates} 
        leadStatuses={leadStatuses}
        sources={sources}
      />
    </div>
  )
}
