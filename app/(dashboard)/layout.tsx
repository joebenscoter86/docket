import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
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

  // Fetch org name via org_memberships → organizations
  const { data: membership } = await supabase
    .from('org_memberships')
    .select('org_id, organizations(name)')
    .eq('user_id', user.id)
    .limit(1)
    .single()

  const orgs = membership?.organizations as { name: string }[] | { name: string } | null
  const orgName = Array.isArray(orgs) ? orgs[0]?.name ?? '' : orgs?.name ?? ''

  // Fetch onboarding state for banner
  const { data: userData } = await supabase
    .from('users')
    .select('onboarding_completed')
    .eq('id', user.id)
    .single()

  const onboardingCompleted = userData?.onboarding_completed ?? false

  let hasConnection = false
  let hasInvoices = false

  const orgId = (membership as { org_id?: string } | null)?.org_id

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
    <AppShell userEmail={user.email ?? ''} orgName={orgName}>
      <PostHogIdentify userId={user.id} email={user.email ?? ""} />
      {!onboardingCompleted && (
        <OnboardingBanner hasConnection={hasConnection} hasInvoices={hasInvoices} />
      )}
      {children}
    </AppShell>
  )
}
