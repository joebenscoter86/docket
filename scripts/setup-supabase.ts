/**
 * One-time setup script for Supabase project.
 * Verifies connectivity and creates the invoices storage bucket.
 *
 * Usage: npx tsx scripts/setup-supabase.ts
 * Requires .env.local to be configured with Supabase credentials.
 */
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

config({ path: '.env.local' })

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function main() {
  // Test DB connectivity
  const { error: dbErr } = await supabase.from('_noop').select('*').limit(0)
  const dbOk = !dbErr || dbErr.message.includes('does not exist') || dbErr.message.includes('schema cache')
  console.log('DB:', dbOk ? 'connected' : dbErr?.message)

  // Test Auth service
  const { error: authErr } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1 })
  console.log('Auth:', authErr ? authErr.message : 'connected')

  // Test Storage service
  const { data: buckets, error: storageErr } = await supabase.storage.listBuckets()
  console.log('Storage:', storageErr ? storageErr.message : `connected (${buckets?.length ?? 0} buckets)`)

  // Create invoices bucket if missing
  if (buckets) {
    const existing = buckets.find((b) => b.name === 'invoices')
    if (existing) {
      console.log('Bucket "invoices": already exists')
    } else {
      const { error } = await supabase.storage.createBucket('invoices', {
        public: false,
        fileSizeLimit: 10 * 1024 * 1024, // 10MB
        allowedMimeTypes: ['application/pdf', 'image/jpeg', 'image/png'],
      })
      console.log('Bucket "invoices":', error ? error.message : 'created')
    }
  }
}

main()
