'use server'

import { fetchAPI } from '@/utils/api'
import { cookies } from 'next/headers'

export async function getAdminMetrics() {
  try {
    const response = await fetchAPI('/api/admin/metrics', {
      headers: { 'Cookie': (await cookies()).toString() }
    })
    return response.data || null
  } catch (error) {
    console.error('Failed to fetch admin metrics:', error)
    return null
  }
}

export async function getAISettings() {
  try {
    const response = await fetchAPI('/api/admin/ai-settings/', {
      headers: { 'Cookie': (await cookies()).toString() }
    })
    return response.data || null
  } catch (error) {
    console.error('Failed to fetch AI settings:', error)
    return null
  }
}

export async function getGlobalSettings() {
  try {
    const response = await fetchAPI('/api/admin/crm-settings/global', {
      headers: { 'Cookie': (await cookies()).toString() }
    })
    return response.data || null
  } catch (error) {
    console.error('Failed to fetch global settings:', error)
    return null
  }
}

export async function updateAISettings(data: any) {
  try {
    const response = await fetchAPI('/api/admin/ai-settings/', {
      method: 'PUT',
      headers: { 'Cookie': (await cookies()).toString(), 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    return response
  } catch (error) {
    console.error('Failed to update AI settings:', error)
    throw error
  }
}

export async function getKnowledgeBase() {
  try {
    const response = await fetchAPI('/api/admin/ai-settings/knowledge-base', {
      headers: { 'Cookie': (await cookies()).toString() }
    })
    return response.data || []
  } catch (error) {
    console.error('Failed to fetch knowledge base:', error)
    return []
  }
}

export async function addKnowledgeBaseItem(data: any) {
  try {
    const response = await fetchAPI('/api/admin/ai-settings/knowledge-base', {
      method: 'POST',
      headers: { 'Cookie': (await cookies()).toString(), 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    return response
  } catch (error) {
    console.error('Failed to add knowledge base item:', error)
    throw error
  }
}

export async function deleteKnowledgeBaseItem(id: string) {
  try {
    const response = await fetchAPI(`/api/admin/ai-settings/knowledge-base/${id}`, {
      method: 'DELETE',
      headers: { 'Cookie': (await cookies()).toString() }
    })
    return response
  } catch (error) {
    console.error('Failed to delete knowledge base item:', error)
    throw error
  }
}

export async function getCallLogs(page = 1, limit = 50, filters: Record<string, string> = {}) {
  try {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) })
    Object.entries(filters).forEach(([k, v]) => { if (v) params.set(k, v) })
    const response = await fetchAPI(`/api/admin/ai-settings/call-logs?${params.toString()}`, {
      headers: { 'Cookie': (await cookies()).toString() }
    })
    return response || { data: [], total: 0 }
  } catch (error) {
    console.error('Failed to fetch call logs:', error)
    return { data: [], total: 0 }
  }
}

export async function getCallStats() {
  try {
    const response = await fetchAPI('/api/admin/ai-settings/stats', {
      headers: { 'Cookie': (await cookies()).toString() }
    })
    return response || {
      total_calls: 0,
      monthly_calls: 0,
      todays_calls: 0,
      todays_picked_up: 0
    }
  } catch (error) {
    console.error('Failed to fetch call stats:', error)
    return {
      total_calls: 0,
      monthly_calls: 0,
      todays_calls: 0,
      todays_picked_up: 0
    }
  }
}

export async function getCallQueue() {
  try {
    const response = await fetchAPI('/api/admin/ai-settings/queue', {
      headers: { 'Cookie': (await cookies()).toString() }
    })
    return response.data || []
  } catch (error) {
    console.error('Failed to fetch call queue:', error)
    return []
  }
}

export async function updateCallQueue(data: any) {
  try {
    const response = await fetchAPI('/api/admin/ai-settings/queue', {
      method: 'PUT',
      headers: { 'Cookie': (await cookies()).toString(), 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    return response
  } catch (error) {
    console.error('Failed to update call queue:', error)
    throw error
  }
}

export async function processNextCall() {
  try {
    const response = await fetchAPI('/api/admin/ai-settings/queue/process-next', {
      method: 'POST',
      headers: { 'Cookie': (await cookies()).toString() }
    })
    return response
  } catch (error) {
    console.error('Failed to process next call:', error)
    throw error
  }
}

export async function getEligibleLeadsPreview() {
  try {
    const response = await fetchAPI('/api/admin/ai-settings/eligible-leads-preview', {
      headers: { 'Cookie': (await cookies()).toString() }
    })
    return response
  } catch (error) {
    console.error('Failed to fetch eligible leads preview:', error)
    return null
  }
}

export async function clearCallQueue() {
  try {
    const response = await fetchAPI('/api/admin/ai-settings/queue', {
      method: 'DELETE',
      headers: { 'Cookie': (await cookies()).toString() }
    })
    return response
  } catch (error) {
    console.error('Failed to clear call queue:', error)
    throw error
  }
}

export async function buildQueueFromFilters() {
  try {
    const response = await fetchAPI('/api/admin/ai-settings/queue/build-from-filters', {
      method: 'POST',
      headers: { 'Cookie': (await cookies()).toString() }
    })
    return response
  } catch (error) {
    console.error('Failed to build queue from filters:', error)
    throw error
  }
}

export async function getContainerLogs(lines = 200) {
  try {
    const response = await fetchAPI(`/api/admin/ai-settings/logs?lines=${lines}`, {
      headers: { 'Cookie': (await cookies()).toString() }
    })
    return response
  } catch (error) {
    console.error('Failed to fetch container logs:', error)
    return { logs: [], total: 0 }
  }
}

export async function getQueueStatusCounts() {
  try {
    const response = await fetchAPI('/api/admin/ai-settings/queue/status-counts', {
      headers: { 'Cookie': (await cookies()).toString() }
    })
    return response
  } catch (error) {
    console.error('Failed to fetch queue status counts:', error)
    return { counts: {}, total: 0 }
  }
}
