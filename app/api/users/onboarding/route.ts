import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/utils/logger'
import { authError, internalError } from '@/lib/utils/errors'

export async function PATCH() {
  const startTime = Date.now()

  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return authError('You must be logged in.')
    }

    const adminSupabase = createAdminClient()
    const { error } = await adminSupabase
      .from('users')
      .update({ onboarding_completed: true })
      .eq('id', user.id)

    if (error) {
      logger.error('users.onboarding_update_failed', {
        userId: user.id,
        error: error.message,
        durationMs: Date.now() - startTime,
      })
      return internalError('Failed to update onboarding status.')
    }

    logger.info('users.onboarding_completed', {
      userId: user.id,
      durationMs: Date.now() - startTime,
    })

    return NextResponse.json({ data: { onboarding_completed: true } })
  } catch (err) {
    logger.error('users.onboarding_unexpected_error', {
      error: err instanceof Error ? err.message : 'Unknown error',
      durationMs: Date.now() - startTime,
    })
    return internalError('Failed to update onboarding status.')
  }
}
