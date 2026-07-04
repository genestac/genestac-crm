import { NextResponse, type NextRequest } from 'next/server'
import { getAuthToken } from './utils/cookie-helper'

export async function proxy(request: NextRequest) {
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
  const isAuthPage = request.nextUrl.pathname.startsWith('/auth')
  const isSetupPage = request.nextUrl.pathname.startsWith('/setup')

  if (!token && !isAuthPage && !isSetupPage) {
    // Redirect to login if trying to access protected route without token
    return NextResponse.redirect(new URL('/auth', request.url))
  }

  if (token && isAuthPage) {
    // Redirect to dashboard if trying to access login while already logged in
    return NextResponse.redirect(new URL('/', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
