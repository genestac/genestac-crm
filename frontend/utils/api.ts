import { cookies } from 'next/headers'

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:8000'

export async function fetchAPI(endpoint: string, options: RequestInit = {}) {
  const cookieStore = await cookies()
  const token = cookieStore.get('access_token')?.value
  
  const headers = new Headers(options.headers || {})
  
  if (token) {
    // We can still pass it as Bearer token if we want, OR we can pass it as a Cookie header
    // The Python backend is looking for `request.cookies.get("access_token")`.
    // Since fetch from Node to Python doesn't auto-send cookies, we MUST manually add the Cookie header.
    headers.set('Cookie', `access_token=${token}`)
    // Just in case we also pass the bearer token so the backend fallback works
    headers.set('Authorization', `Bearer ${token}`)
  }
  
  console.log(`[fetchAPI] Fetching: ${API_BASE_URL}${endpoint}`)
  const res = await fetch(`${API_BASE_URL}${endpoint}`, {
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
