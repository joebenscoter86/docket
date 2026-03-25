import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getResend } from '@/lib/email/resend'
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

  // Render React email templates lazily to isolate rendering errors
  let welcomeReact: React.ReactElement | undefined
  let adminReact: React.ReactElement | undefined
  const errors: string[] = []

  try {
    const { WelcomeEmail } = await import('@/lib/email/templates/welcome')
    welcomeReact = WelcomeEmail({ email })
  } catch (err) {
    const msg = `Welcome template render failed: ${String(err)}`
    logger.error('signup_welcome_template_error', { error: msg })
    errors.push(msg)
  }

  try {
    const { AdminNewSignupEmail } = await import('@/lib/email/templates/admin-new-signup')
    adminReact = AdminNewSignupEmail({
      userEmail: email,
      signupDate: new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }),
    })
  } catch (err) {
    const msg = `Admin template render failed: ${String(err)}`
    logger.error('signup_admin_template_error', { error: msg })
    errors.push(msg)
  }

  const resend = getResend()

  // Send welcome email (fall back to plain text if React template failed)
  try {
    const welcomePayload = welcomeReact
      ? { from: DEFAULT_FROM, to: email, subject: 'Welcome to Docket', replyTo: 'support@dockett.app', react: welcomeReact }
      : { from: DEFAULT_FROM, to: email, subject: 'Welcome to Docket', replyTo: 'support@dockett.app', text: `Welcome to Docket, ${email}! Upload your first invoice at https://dockett.app/upload` }
    const { error: welcomeErr } = await resend.emails.send(welcomePayload)
    if (welcomeErr) {
      errors.push(`welcome send: ${welcomeErr.message}`)
      logger.error('signup_welcome_email_failed', { to: email, error: welcomeErr.message })
    }
  } catch (err) {
    errors.push(`welcome exception: ${String(err)}`)
    logger.error('signup_welcome_email_exception', { to: email, error: String(err) })
  }

  // Send admin notification (fall back to plain text if React template failed)
  try {
    const adminPayload = adminReact
      ? { from: DEFAULT_FROM, to: ADMIN_EMAIL, subject: `New signup: ${email}`, replyTo: 'support@dockett.app', react: adminReact }
      : { from: DEFAULT_FROM, to: ADMIN_EMAIL, subject: `New signup: ${email}`, replyTo: 'support@dockett.app', text: `New signup: ${email} at ${new Date().toISOString()}` }
    const { error: adminErr } = await resend.emails.send(adminPayload)
    if (adminErr) {
      errors.push(`admin send: ${adminErr.message}`)
      logger.error('signup_admin_email_failed', { to: ADMIN_EMAIL, error: adminErr.message })
    }
  } catch (err) {
    errors.push(`admin exception: ${String(err)}`)
    logger.error('signup_admin_email_exception', { to: ADMIN_EMAIL, error: String(err) })
  }

  if (errors.length > 0) {
    logger.error('signup_notify_partial_failure', { userId: user.id, email, errors })
    return NextResponse.json({ error: 'Email send failed', details: errors }, { status: 500 })
  }

  logger.info('signup_notify_sent', { userId: user.id, email })
  return NextResponse.json({ data: { sent: true } })
}
