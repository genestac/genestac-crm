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
