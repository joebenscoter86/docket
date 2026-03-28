import { type NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { sendEmail } from '@/lib/email/send'
import { WelcomeEmail } from '@/lib/email/templates/welcome'
import { AdminNewSignupEmail } from '@/lib/email/templates/admin-new-signup'

const ADMIN_EMAIL = 'joebenscoter@gmail.com'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type')
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/invoices'

  // Need either a PKCE code or a token_hash+type pair
  if (!code && (!token_hash || !type)) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  const supabaseResponse = NextResponse.redirect(new URL(next, request.url))

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  let error: Error | null = null

  if (code) {
    // PKCE flow (used by resetPasswordForEmail and magic links)
    const result = await supabase.auth.exchangeCodeForSession(code)
    error = result.error
  } else if (token_hash && type) {
    // Token hash flow (used by email confirmation)
    const result = await supabase.auth.verifyOtp({
      token_hash,
      type: type as 'signup' | 'email' | 'recovery',
    })
    error = result.error
  }

  if (error) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Send welcome email on signup confirmation only (not recovery or email change)
  // Note: with email confirmation disabled, this path is unused --
  // signup-notify route handles it instead. Kept for future use.
  if (type === 'signup') {
    const { data: { user } } = await supabase.auth.getUser()
    if (user?.email) {
      await Promise.all([
        sendEmail({
          to: user.email,
          subject: 'Welcome to Dockett',
          react: WelcomeEmail({ email: user.email }),
        }),
        sendEmail({
          to: ADMIN_EMAIL,
          subject: `New signup: ${user.email}`,
          react: AdminNewSignupEmail({
            userEmail: user.email,
            signupDate: new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }),
          }),
        }),
      ])
    }
  }

  return supabaseResponse
}
