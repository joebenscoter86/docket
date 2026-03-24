import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail } from '@/lib/email/send'
import { WelcomeEmail } from '@/lib/email/templates/welcome'
import { AdminNewSignupEmail } from '@/lib/email/templates/admin-new-signup'
import { logger } from '@/lib/utils/logger'

const ADMIN_EMAIL = 'joebenscoter@gmail.com'

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const email = body.email

  if (!email || typeof email !== 'string') {
    return NextResponse.json({ error: 'Email required' }, { status: 400 })
  }

  // Verify the user actually exists in auth (prevents abuse)
  const admin = createAdminClient()
  const { data: { users } } = await admin.auth.admin.listUsers()
  const user = users?.find((u) => u.email === email)

  if (!user) {
    logger.warn('signup_notify_user_not_found', { email })
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  // Send both emails (fire-and-forget within the route)
  sendEmail({
    to: email,
    subject: 'Welcome to Docket',
    react: WelcomeEmail({ email }),
  })

  sendEmail({
    to: ADMIN_EMAIL,
    subject: `New signup: ${email}`,
    react: AdminNewSignupEmail({
      userEmail: email,
      signupDate: new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }),
    }),
  })

  logger.info('signup_notify_sent', { userId: user.id, email })

  return NextResponse.json({ data: { sent: true } })
}
