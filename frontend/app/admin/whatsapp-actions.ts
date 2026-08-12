'use server'

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { fetchAPI } from '@/utils/api'

export async function getWhatsAppTemplates() {
  const response = await fetchAPI('/api/admin/whatsapp/templates', {
    headers: { 'Cookie': (await cookies()).toString() }
  })
  return response.data || []
}

export async function createWhatsAppTemplate(name: string, content: string) {
  const response = await fetchAPI('/api/admin/whatsapp/templates', {
    method: 'POST',
    headers: { 'Cookie': (await cookies()).toString(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, content })
  })
  revalidatePath('/admin/whatsapp')
  return response.data
}

export async function getWhatsAppCampaigns() {
  const response = await fetchAPI('/api/admin/whatsapp/campaigns', {
    headers: { 'Cookie': (await cookies()).toString() }
  })
  return response.data || []
}

export async function getCampaignLogs(campaignId: string) {
  const response = await fetchAPI(`/api/admin/whatsapp/campaigns/${campaignId}/logs`, {
    headers: { 'Cookie': (await cookies()).toString() }
  })
  return response.data || []
}



export async function createWhatsAppCampaign(name: string, templateId: string, audienceFilter: any, scheduledTime?: string) {
  const response = await fetchAPI('/api/admin/whatsapp/campaigns', {
    method: 'POST',
    headers: { 'Cookie': (await cookies()).toString(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, template_id: templateId, audience_filter: audienceFilter, scheduled_time: scheduledTime })
  })
  revalidatePath('/admin/whatsapp')
  return response.data
}

export async function estimateCampaignAudience(templateId: string, audienceFilter: any) {
  const response = await fetchAPI('/api/admin/whatsapp/campaigns/estimate', {
    method: 'POST',
    headers: { 'Cookie': (await cookies()).toString(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ template_id: templateId, audience_filter: audienceFilter })
  })
  return response.data
}

export async function updateWhatsAppCampaign(campaignId: string, name: string, templateId: string, audienceFilter: any, scheduledTime?: string) {
  const response = await fetchAPI(`/api/admin/whatsapp/campaigns/${campaignId}`, {
    method: 'PUT',
    headers: { 'Cookie': (await cookies()).toString(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, template_id: templateId, audience_filter: audienceFilter, scheduled_time: scheduledTime })
  })
  revalidatePath('/admin/whatsapp')
  return response.data
}

export async function startWhatsAppCampaignNow(campaignId: string) {
  const response = await fetchAPI(`/api/admin/whatsapp/campaigns/${campaignId}/start-now`, {
    method: 'POST',
    headers: { 'Cookie': (await cookies()).toString() }
  })
  revalidatePath('/admin/whatsapp')
  return response.data
}

export async function pauseWhatsAppCampaign(campaignId: string) {
  const response = await fetchAPI(`/api/admin/whatsapp/campaigns/${campaignId}/pause`, {
    method: 'POST',
    headers: { 'Cookie': (await cookies()).toString() }
  })
  revalidatePath('/admin/whatsapp')
  return response.data
}

export async function continueWhatsAppCampaign(campaignId: string) {
  const response = await fetchAPI(`/api/admin/whatsapp/campaigns/${campaignId}/continue`, {
    method: 'POST',
    headers: { 'Cookie': (await cookies()).toString() }
  })
  revalidatePath('/admin/whatsapp')
  return response.data
}

export async function deleteWhatsAppCampaign(campaignId: string) {
  const response = await fetchAPI(`/api/admin/whatsapp/campaigns/${campaignId}`, {
    method: 'DELETE',
    headers: { 'Cookie': (await cookies()).toString() }
  })
  revalidatePath('/admin/whatsapp')
  return response.data
}

export async function getAutoResponderSettings() {
  const response = await fetchAPI('/api/admin/whatsapp/settings/autoresponder', {
    headers: { 'Cookie': (await cookies()).toString() }
  })
  return response.data || { enabled: false, template_id: null }
}

export async function updateAutoResponderSettings(enabled: boolean, templateId: string | null) {
  const response = await fetchAPI('/api/admin/whatsapp/settings/autoresponder', {
    method: 'PUT',
    headers: { 'Cookie': (await cookies()).toString(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled, template_id: templateId })
  })
  revalidatePath('/admin/whatsapp')
  return response.data
}

export async function syncWhatsAppTemplates() {
  const response = await fetchAPI('/api/admin/whatsapp/templates/sync', {
    method: 'POST',
    headers: { 'Cookie': (await cookies()).toString() }
  })
  revalidatePath('/admin/whatsapp')
  return response
}

export async function setTemplateHeaderUrl(templateId: string, headerMediaUrl: string) {
  const response = await fetchAPI(`/api/admin/whatsapp/templates/${templateId}/header-url`, {
    method: 'PATCH',
    headers: { 'Cookie': (await cookies()).toString(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ header_media_url: headerMediaUrl })
  })
  revalidatePath('/admin/whatsapp')
  return response
}
