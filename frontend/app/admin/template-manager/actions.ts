'use server'

import { fetchAPI } from '@/utils/api'

export async function getTemplateTriggers() {
  const data = await fetchAPI('/api/admin/whatsapp/template-triggers')
  return data
}

export async function updateTemplateTrigger(
  triggerKey: string,
  templateId: string | null,
  variableMap: Array<{ position: number; field: string; label: string }>,
  isActive: boolean
) {
  const data = await fetchAPI(`/api/admin/whatsapp/template-triggers/${triggerKey}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      template_id: templateId,
      variable_map: variableMap,
      is_active: isActive,
    }),
  })
  return data
}

export async function syncMetaTemplates() {
  const data = await fetchAPI('/api/admin/whatsapp/template-triggers/sync-meta', {
    method: 'POST',
  })
  return data
}
