import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getActiveOrgId } from '@/lib/supabase/helpers'
import AppShell from '@/components/layout/AppShell'
import PostHogIdentify from '@/components/providers/PostHogIdentify'
import OnboardingBanner from '@/components/onboarding/OnboardingBanner'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Get active org
  const orgId = await getActiveOrgId(supabase, user.id)

  let orgName = ''
  if (orgId) {
    const { data: org } = await supabase
      .from('organizations')
      .select('name')
      .eq('id', orgId)
      .single()
    orgName = org?.name ?? ''
  }

  // Fetch onboarding state for banner
  const { data: userData } = await supabase
    .from('users')
    .select('onboarding_completed, is_design_partner')
    .eq('id', user.id)
    .single()

  const onboardingCompleted = userData?.onboarding_completed ?? false
  const isDesignPartner = userData?.is_design_partner ?? false

  let hasConnection = false
  let hasInvoices = false

  if (!onboardingCompleted && orgId) {
    const [{ count: connCount }, { count: invCount }] = await Promise.all([
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
    hasConnection = (connCount ?? 0) > 0
    hasInvoices = (invCount ?? 0) > 0
  }

  return (
    <AppShell userEmail={user.email ?? ''} orgName={orgName} isDesignPartner={isDesignPartner}>
      <PostHogIdentify userId={user.id} email={user.email ?? ""} />
      {!onboardingCompleted && (
        <OnboardingBanner hasConnection={hasConnection} hasInvoices={hasInvoices} />
      )}
      {children}
    </AppShell>
  )
}
