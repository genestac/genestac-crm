import { cookies } from 'next/headers'
import { getAuthToken } from './cookie-helper'

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:8000'
const REQUEST_TIMEOUT_MS = Number(process.env.API_REQUEST_TIMEOUT_MS || 30000)

export async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = REQUEST_TIMEOUT_MS, retries = 1) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

    try {
      return await fetch(url, {
        ...options,
        signal: controller.signal,
      })
    } catch (error: any) {
      if (error?.name === 'AbortError') {
        throw new Error(`Request timed out after ${timeoutMs}ms`)
      }
      const isSocketError = 
        error?.code === 'UND_ERR_SOCKET' ||
        error?.cause?.code === 'UND_ERR_SOCKET' ||
        error?.message?.includes('fetch failed')

      if (attempt < retries && isSocketError) {
        console.warn(`[fetchWithTimeout] Socket connection dropped on ${url}, retrying... (${attempt + 1}/${retries})`)
        await new Promise((resolve) => setTimeout(resolve, 300))
        continue
      }
      throw error
    } finally {
      clearTimeout(timeoutId)
    }
  }
  throw new Error(`Request to ${url} failed`)
}

export async function fetchAPI(endpoint: string, options: RequestInit = {}, timeoutMs?: number) {
  const cookieStore = await cookies()
  const token = getAuthToken(cookieStore.getAll())
  
  const headers = new Headers(options.headers || {})
  
  if (token) {
    // Send token via Cookie AND Authorization headers (Original Way)
    headers.set('Cookie', `access_token=${token}`)
    headers.set('Authorization', `Bearer ${token}`)
  }
  
  const url = `${API_BASE_URL}${endpoint}`
  console.log(`[fetchAPI] Fetching: ${url}`)

  const res = await fetchWithTimeout(url, {
    cache: 'no-store', // Prevent Next.js from caching authenticated API responses
    ...options,
    headers
  }, timeoutMs ?? REQUEST_TIMEOUT_MS)
  
  if (!res.ok) {
    let errorStatus = res.status
    let errorText = await res.text().catch(() => 'No response body')
    
    try {
      const parsed = JSON.parse(errorText)
      if (parsed.detail) {
        errorText = typeof parsed.detail === 'string' ? parsed.detail : JSON.stringify(parsed.detail)
      }
    } catch (e) {}
    
    console.error(`[fetchAPI] Error ${errorStatus} for ${url}:`, errorText)
    
    const error: any = new Error(errorText)
    error.status = errorStatus
    throw error
  }
  
  return res.json()
}
