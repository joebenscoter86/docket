import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error(
    'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.test'
  )
}

export const adminClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

/**
 * Clean up all data created by a test user.
 * Deletes in dependency order to avoid FK violations.
 */
export async function cleanupTestUser(userId: string) {
  // Get org IDs for this user
  const { data: memberships } = await adminClient
    .from('org_memberships')
    .select('org_id')
    .eq('user_id', userId)

  const orgIds = memberships?.map((m) => m.org_id) ?? []

  if (orgIds.length > 0) {
    // Get invoice IDs for cleanup of dependent tables
    const { data: invoices } = await adminClient
      .from('invoices')
      .select('id')
      .in('org_id', orgIds)

    const invoiceIds = invoices?.map((i) => i.id) ?? []

    if (invoiceIds.length > 0) {
      // Delete in dependency order
      const { data: extractedData } = await adminClient
        .from('extracted_data')
        .select('id')
        .in('invoice_id', invoiceIds)

      const extractedDataIds = extractedData?.map((e) => e.id) ?? []

      if (extractedDataIds.length > 0) {
        await adminClient
          .from('extracted_line_items')
          .delete()
          .in('extracted_data_id', extractedDataIds)
      }

      await adminClient
        .from('extracted_data')
        .delete()
        .in('invoice_id', invoiceIds)
      await adminClient
        .from('sync_log')
        .delete()
        .in('invoice_id', invoiceIds)
      await adminClient
        .from('corrections')
        .delete()
        .in('invoice_id', invoiceIds)
    }

    // Clean up storage files for test invoices
    const { data: invoiceFiles } = await adminClient
      .from('invoices')
      .select('file_path')
      .in('org_id', orgIds)
    const filePaths = invoiceFiles?.map((i) => i.file_path).filter(Boolean) ?? []
    if (filePaths.length > 0) {
      await adminClient.storage.from('invoices').remove(filePaths)
    }

    await adminClient.from('invoices').delete().in('org_id', orgIds)
    await adminClient
      .from('accounting_connections')
      .delete()
      .in('org_id', orgIds)
    await adminClient
      .from('gl_account_mappings')
      .delete()
      .in('org_id', orgIds)
    await adminClient.from('org_memberships').delete().eq('user_id', userId)
    await adminClient.from('organizations').delete().in('id', orgIds)
  }

  // Delete user-level data
  await adminClient.from('email_preferences').delete().eq('user_id', userId)
  await adminClient.from('email_log').delete().eq('user_id', userId)
  await adminClient.from('users').delete().eq('id', userId)

  // Delete auth user
  await adminClient.auth.admin.deleteUser(userId)
}
