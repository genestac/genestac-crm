import { NextResponse, type NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  const token = request.cookies.get('access_token')?.value
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
