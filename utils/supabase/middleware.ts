import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // IMPORTANT: Avoid writing any logic between createServerClient and
  // supabase.auth.getUser(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.

  const {
    data: { user },
  } = await supabase.auth.getUser()
  
  const pathname = request.nextUrl.pathname

  if (
    !user &&
    !pathname.startsWith('/auth') &&
    pathname !== '/'
  ) {
    // no user, potentially respond by redirecting the user to the login page
    const url = request.nextUrl.clone()
    url.pathname = '/auth'
    return NextResponse.redirect(url)
  }

  // Handle role-based routing if user is logged in
  if (user) {
    // Fetch profile and join with roles table
    const { data: profile, error: profileError } = await supabase
      .from('staffs')
      .select('roles(name)')
      .eq('id', user.id)
      .single()

    console.log("Middleware user id:", user.id);
    console.log("Middleware profile fetch result:", profile);
    console.log("Middleware profile fetch error:", profileError);

    // @ts-ignore - Supabase type resolution
    const role = profile?.roles?.name

    console.log("Middleware resolved role:", role);

    // Master admin can access everything, so we bypass strict checks for them
    const isMasterAdmin = role === 'master_admin'

    // Ensure users are confined to their specific sub-portals
    // Admin checking
    if (pathname.startsWith('/admin') && !isMasterAdmin && role !== 'admin') {
      return NextResponse.redirect(new URL('/auth?error=unauthorized', request.url))
    }
    
    // Sales portal checking
    if (pathname.startsWith('/sales') && !isMasterAdmin && role !== 'sales' && role !== 'admin' && role !== 'manager' && role !== 'support') {
      return NextResponse.redirect(new URL('/auth?error=unauthorized', request.url))
    }
    
    // Doctor checking
    if (pathname.startsWith('/doctor') && !isMasterAdmin && role !== 'doctor') {
      return NextResponse.redirect(new URL('/auth?error=unauthorized', request.url))
    }

    // Default redirection logic for authenticated users at root
    if (pathname === '/') {
      if (isMasterAdmin || role === 'admin') {
        return NextResponse.redirect(new URL('/admin', request.url))
      } else if (role === 'doctor') {
        return NextResponse.redirect(new URL('/doctor', request.url))
      } else if (role === 'sales' || role === 'manager' || role === 'support') {
        return NextResponse.redirect(new URL('/sales', request.url))
      } else {
        // Fallback for no specific role
        return NextResponse.redirect(new URL('/auth?error=norole', request.url))
      }
    }
    
    // Redirect away from login if already authenticated
    if (pathname.startsWith('/auth')) {
       if (isMasterAdmin || role === 'admin') {
         return NextResponse.redirect(new URL('/admin', request.url))
       } else if (role === 'doctor') {
         return NextResponse.redirect(new URL('/doctor', request.url))
       } else if (role === 'sales' || role === 'manager' || role === 'support') {
         return NextResponse.redirect(new URL('/sales', request.url))
       }
    }
  }

  return supabaseResponse
}
