import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AppShell from '@/components/layout/AppShell'

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
    .select('organizations(name)')
    .eq('user_id', user.id)
    .limit(1)
    .single()

  const orgs = membership?.organizations as { name: string }[] | { name: string } | null
  const orgName = Array.isArray(orgs) ? orgs[0]?.name ?? '' : orgs?.name ?? ''

  return (
    <AppShell userEmail={user.email ?? ''} orgName={orgName}>
      {children}
    </AppShell>
  )
}
