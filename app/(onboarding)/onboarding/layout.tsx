import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getActiveOrgId } from '@/lib/supabase/helpers'
import OnboardingShell from './OnboardingShell'

export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Fetch org
  const orgId = await getActiveOrgId(supabase, user.id)

  // Derive step completion from existing data
  let connectComplete = false
  let uploadComplete = false

  if (orgId) {
    const [{ count: connectionCount }, { count: invoiceCount }] = await Promise.all([
      supabase
        .from('accounting_connections')
        .select('*', { count: 'exact', head: true })
        .eq('org_id', orgId)
        .eq('provider', 'quickbooks'),
      supabase
        .from('invoices')
        .select('*', { count: 'exact', head: true })
        .eq('org_id', orgId),
    ])

    connectComplete = (connectionCount ?? 0) > 0
    uploadComplete = (invoiceCount ?? 0) > 0
  }

  return (
    <OnboardingShell completedSteps={{ connect: connectComplete, upload: uploadComplete }}>
      {children}
    </OnboardingShell>
  )
}
