import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Routes that require authentication — everything under (dashboard)
const PROTECTED_PATHS = ['/invoices', '/upload', '/settings']

// Routes only accessible when NOT authenticated
const AUTH_PATHS = ['/login', '/signup', '/forgot-password']

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
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
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

  // Refresh the auth token — this is required for Server Components
  // to read the session. Do not remove this line.
  const { data: { user } } = await supabase.auth.getUser()

  const pathname = request.nextUrl.pathname

  // Redirect unauthenticated users away from protected routes
  if (!user && PROTECTED_PATHS.some((path) => pathname.startsWith(path))) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/login'
    return NextResponse.redirect(loginUrl)
  }

  // Redirect authenticated users away from auth pages
  if (user && AUTH_PATHS.some((path) => pathname.startsWith(path))) {
    const redirectTo = request.nextUrl.searchParams.get('redirect')
    const dashboardUrl = request.nextUrl.clone()
    // Preserve redirect param for invite flow (validate it starts with /invite/)
    dashboardUrl.pathname = redirectTo?.startsWith('/invite/') ? redirectTo : '/invoices'
    dashboardUrl.search = ''
    return NextResponse.redirect(dashboardUrl)
  }

  return supabaseResponse
}
