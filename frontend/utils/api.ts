import { cookies } from 'next/headers'

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:8000'

export async function fetchAPI(endpoint: string, options: RequestInit = {}) {
  const cookieStore = await cookies()
  const token = cookieStore.get('access_token')?.value
  
  const headers = new Headers(options.headers || {})
  
  if (token) {
    // Send token via Cookie AND Authorization headers (Original Way)
    headers.set('Cookie', `access_token=${token}`)
    headers.set('Authorization', `Bearer ${token}`)
  }
  
  console.log(`[fetchAPI] Fetching: ${API_BASE_URL}${endpoint}`)
  const res = await fetch(`${API_BASE_URL}${endpoint}`, {
    cache: 'no-store', // Prevent Next.js from caching authenticated API responses
    ...options,
    headers
  })
  
  if (!res.ok) {
    let errorStatus = res.status
    let errorText = await res.text().catch(() => 'No response body')
    const error: any = new Error(`${errorText} (Failed URL: ${API_BASE_URL}${endpoint})`)
    error.status = errorStatus
    throw error
  }
  
  return res.json()
}
