import { type NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { sendEmail } from '@/lib/email/send'
import { WelcomeEmail } from '@/lib/email/templates/welcome'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type')
  const next = searchParams.get('next') ?? '/invoices'

  if (!token_hash || !type) {
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

  const { error } = await supabase.auth.verifyOtp({
    token_hash,
    type: type as 'signup' | 'email' | 'recovery',
  })

  if (error) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Send welcome email on signup confirmation only (not recovery or email change)
  if (type === 'signup') {
    const { data: { user } } = await supabase.auth.getUser()
    if (user?.email) {
      // Fire-and-forget: don't await, don't block redirect
      sendEmail({
        to: user.email,
        subject: 'Welcome to Docket',
        react: WelcomeEmail({ email: user.email }),
      })
    }
  }

  return supabaseResponse
}
