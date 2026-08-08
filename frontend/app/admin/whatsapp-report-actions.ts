'use server'

import { fetchAPI } from '@/utils/api'

export async function getWhatsappConfig() {
  const data = await fetchAPI('/api/admin/metrics/whatsapp-config')
  return data
}

export async function saveWhatsappConfig(numbers: string[], time: string) {
  const data = await fetchAPI('/api/admin/metrics/whatsapp-config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ numbers, time }),
  })
  return data
}

export async function triggerWhatsappReport() {
  const data = await fetchAPI('/api/admin/metrics/send-whatsapp-report', {
    method: 'POST',
  })
  return data
}
