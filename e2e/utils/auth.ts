import { type Page } from '@playwright/test'
import { adminClient } from './db'

interface TestUser {
  id: string
  email: string
  password: string
  orgId: string
}

/**
 * Create a test user via Supabase Admin API.
 * The on_auth_user_created trigger auto-creates the users row, org, and membership.
 */
export async function createTestUser(
  emailPrefix: string = 'e2e'
): Promise<TestUser> {
  const timestamp = Date.now()
  const email = `${emailPrefix}+${timestamp}@test.dockett.app`
  const password = `test-password-${timestamp}`

  const { data, error } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })

  if (error || !data.user) {
    throw new Error(`Failed to create test user: ${error?.message}`)
  }

  // The trigger creates the org -- retry a few times in case it hasn't fired yet
  let membership: { org_id: string } | null = null
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data: m } = await adminClient
      .from('org_memberships')
      .select('org_id')
      .eq('user_id', data.user.id)
      .single()
    if (m) {
      membership = m
      break
    }
    await new Promise((r) => setTimeout(r, 500))
  }

  if (!membership) {
    throw new Error('Trigger did not create org membership for test user')
  }

  return {
    id: data.user.id,
    email,
    password,
    orgId: membership.org_id,
  }
}

/**
 * Log in as a test user via the browser.
 * Navigates to /login, fills the form, and waits for redirect to /invoices.
 */
export async function loginAsUser(page: Page, user: TestUser) {
  await page.goto('/login')
  await page.getByLabel('Email Address').fill(user.email)
  await page.getByLabel('Password').fill(user.password)
  await page.getByRole('button', { name: 'Log In' }).click()
  await page.waitForURL('**/invoices**', { timeout: 15_000 })
}
