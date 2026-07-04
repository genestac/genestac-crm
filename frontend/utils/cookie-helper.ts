export function decodeBase64(str: string): string {
  try {
    return atob(str)
  } catch (e) {
    // Fallback if atob is not available
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(str, 'base64').toString('utf8')
    }
    throw e
  }
}

export function getAuthToken(cookiesList: { name: string; value: string }[]): string | undefined {
  // First, check if there's a direct 'access_token' cookie
  const directToken = cookiesList.find(c => c.name === 'access_token')?.value
  if (directToken) {
    return directToken
  }

  // Otherwise, look for a Supabase auth token cookie (starts with 'sb-' and ends with '-auth-token')
  const sbCookie = cookiesList.find(c => c.name.startsWith('sb-') && c.name.endsWith('-auth-token'))
  if (sbCookie) {
    try {
      let val = sbCookie.value
      if (val.startsWith('base64-')) {
        val = val.substring(7)
        const decoded = decodeBase64(val)
        const parsed = JSON.parse(decoded)
        if (parsed && typeof parsed === 'object' && parsed.access_token) {
          return parsed.access_token
        }
      }
    } catch (e) {
      console.error('Failed to parse Supabase cookie:', e)
    }
  }

  return undefined
}

export function clearAuthCookies(cookieStore: any): void {
  // Function works with both Next.js request.cookies and next/headers cookies()
  cookieStore.delete('access_token')
  const allCookies = cookieStore.getAll()
  for (const cookie of allCookies) {
    if (cookie.name.startsWith('sb-') && cookie.name.endsWith('-auth-token')) {
      cookieStore.delete(cookie.name)
    }
  }
}
