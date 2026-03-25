import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getResend } from '@/lib/email/resend'
import { WelcomeEmail } from '@/lib/email/templates/welcome'
import { AdminNewSignupEmail } from '@/lib/email/templates/admin-new-signup'
import { logger } from '@/lib/utils/logger'

const ADMIN_EMAIL = 'joebenscoter@gmail.com'
const DEFAULT_FROM = 'Docket <no-reply@dockett.app>'

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const email = body.email

  if (!email || typeof email !== 'string') {
    return NextResponse.json({ error: 'Email required' }, { status: 400 })
  }

  // Verify the user actually exists in Supabase Auth (prevents abuse).
  // IMPORTANT: Must query auth.users via the admin API, NOT the public.users
  // table. The on_auth_user_created trigger that populates public.users may
  // not have completed yet when this route is called immediately after signUp().
  const admin = createAdminClient()
  const { data: { users } } = await admin.auth.admin.listUsers()
  const user = users?.find((u) => u.email === email)

  if (!user) {
    logger.warn('signup_notify_user_not_found', { email })
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  const resend = getResend()
  const errors: string[] = []

  // Send welcome email
  const { error: welcomeErr } = await resend.emails.send({
    from: DEFAULT_FROM,
    to: email,
    subject: 'Welcome to Docket',
    replyTo: 'support@dockett.app',
    react: WelcomeEmail({ email }),
  })
  if (welcomeErr) {
    logger.error('signup_welcome_email_failed', { to: email, error: welcomeErr.message })
    errors.push(`welcome: ${welcomeErr.message}`)
  }

  // Send admin notification
  const { error: adminErr } = await resend.emails.send({
    from: DEFAULT_FROM,
    to: ADMIN_EMAIL,
    subject: `New signup: ${email}`,
    replyTo: 'support@dockett.app',
    react: AdminNewSignupEmail({
      userEmail: email,
      signupDate: new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }),
    }),
  })
  if (adminErr) {
    logger.error('signup_admin_email_failed', { to: ADMIN_EMAIL, error: adminErr.message })
    errors.push(`admin: ${adminErr.message}`)
  }

  if (errors.length > 0) {
    logger.error('signup_notify_partial_failure', { userId: user.id, email, errors })
    return NextResponse.json({ error: 'Email send failed', details: errors }, { status: 500 })
  }

  logger.info('signup_notify_sent', { userId: user.id, email })
  return NextResponse.json({ data: { sent: true } })
}
