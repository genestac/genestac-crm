import { NextResponse, type NextRequest } from 'next/server'
import { getAuthToken } from './utils/cookie-helper'

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:8000'

export async function proxy(request: NextRequest) {
  // Handle ?clear=1 query param (used for manual cookie clearing)
  if (request.nextUrl.searchParams.get('clear') === '1') {
    const url = request.nextUrl.clone()
    url.searchParams.delete('clear')
    const response = NextResponse.redirect(url)
    response.cookies.delete('access_token')
    const allCookies = request.cookies.getAll()
    for (const cookie of allCookies) {
      if (cookie.name.startsWith('sb-') && cookie.name.endsWith('-auth-token')) {
        response.cookies.delete(cookie.name)
      }
    }
    return response
  }

  const token = getAuthToken(request.cookies.getAll())
  const { pathname } = request.nextUrl
  const isAuthPage = pathname.startsWith('/auth')
  const isSetupPage = pathname.startsWith('/setup')
  const isPublicAsset = pathname.startsWith('/api/') || pathname.startsWith('/icon')

  // No token — redirect to login
  if (!token && !isAuthPage && !isSetupPage && !isPublicAsset) {
    const loginUrl = new URL('/auth', request.url)
    loginUrl.searchParams.set('error', 'Please log in to continue.')
    return NextResponse.redirect(loginUrl)
  }

  // Already logged in — redirect away from auth page
  if (token && isAuthPage) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  // Token exists — verify it's not expired by calling /api/auth/me
  if (token && !isAuthPage && !isSetupPage && !isPublicAsset) {
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/me`, {
        headers: {
          Cookie: `access_token=${token}`,
          Authorization: `Bearer ${token}`,
        },
        signal: AbortSignal.timeout(3000),
      })

      if (res.status === 401) {
        // Token expired — clear cookie and redirect to login with a friendly message
        const loginUrl = new URL('/auth', request.url)
        loginUrl.searchParams.set('message', 'Your session has expired. Please log in again.')
        const response = NextResponse.redirect(loginUrl)
        response.cookies.delete('access_token')
        // Also clear any Supabase cookies
        for (const cookie of request.cookies.getAll()) {
          if (cookie.name.startsWith('sb-') && cookie.name.endsWith('-auth-token')) {
            response.cookies.delete(cookie.name)
          }
        }
        return response
      }
    } catch {
      // Backend unreachable — allow through, pages handle errors gracefully
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}

