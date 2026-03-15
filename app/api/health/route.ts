import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  const checks: Record<string, string> = {}

  // Check Supabase database connectivity
  try {
    const supabase = createAdminClient()
    const { error } = await supabase.from('_health_check_noop').select('*').limit(0)
    // These errors still prove the DB is reachable — the query ran, it just found no table
    const reachableErrors = ['does not exist', 'schema cache']
    if (error && !reachableErrors.some((msg) => error.message.includes(msg))) {
      checks.database = `error: ${error.message}`
    } else {
      checks.database = 'ok'
    }
  } catch (e) {
    checks.database = `error: ${e instanceof Error ? e.message : 'unknown'}`
  }

  // Check Supabase Auth service
  try {
    const supabase = createAdminClient()
    const { error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1 })
    checks.auth = error ? `error: ${error.message}` : 'ok'
  } catch (e) {
    checks.auth = `error: ${e instanceof Error ? e.message : 'unknown'}`
  }

  // Check Supabase Storage service
  try {
    const supabase = createAdminClient()
    const { error } = await supabase.storage.listBuckets()
    checks.storage = error ? `error: ${error.message}` : 'ok'
  } catch (e) {
    checks.storage = `error: ${e instanceof Error ? e.message : 'unknown'}`
  }

  const allHealthy = Object.values(checks).every((v) => v === 'ok')

  return NextResponse.json(
    {
      status: allHealthy ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      checks,
    },
    { status: allHealthy ? 200 : 503 }
  )
}
