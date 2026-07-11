import { getWhatsAppTemplates } from '../../whatsapp-actions'
import { fetchAPI } from '@/utils/api'
import { cookies } from 'next/headers'
import { CreateCampaignClient } from './CreateCampaignClient'
import { MessageCircle, ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default async function CreateCampaignPage({ searchParams }: { searchParams: { edit?: string, retrigger?: string } }) {
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
  
  // If edit or retrigger, fetch the campaign to prefill the form
  let initialCampaign = null
  const campaignId = searchParams?.edit || searchParams?.retrigger
  if (campaignId) {
    // We can fetch the campaigns list and find it, or write a getCampaign function.
    // Let's just fetch all and find it for simplicity, since campaigns are already paginated/fetched.
    const { data: campaigns } = await fetchAPI('/api/admin/whatsapp/campaigns', {
      headers: { 'Cookie': cookieStr }
    })
    initialCampaign = campaigns?.find((c: any) => c.id === campaignId)
  }


  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-4">
        <Link href="/admin/whatsapp">
          <Button variant="outline" size="icon">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 flex items-center gap-3">
            <MessageCircle className="w-8 h-8 text-green-500" />
            Create Smart Campaign
          </h1>
          <p className="text-muted-foreground mt-1">
            Define your audience using smart filters and intelligent exclusions.
          </p>
        </div>
      </div>

      <CreateCampaignClient 
        templates={templates} 
        leadStatuses={leadStatuses}
        sources={sources}
        initialCampaign={initialCampaign}
        mode={searchParams?.edit ? 'edit' : (searchParams?.retrigger ? 'retrigger' : 'create')}
      />
    </div>
  )
}
