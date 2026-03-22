import { test, expect } from '@playwright/test'
import path from 'path'
import { createTestUser, loginAsUser } from './utils/auth'
import { cleanupTestUser } from './utils/db'
import { adminClient } from './utils/db'

let createdUserIds: string[] = []

test.afterEach(async () => {
  for (const userId of createdUserIds) {
    await cleanupTestUser(userId).catch(() => {})
  }
  createdUserIds = []
})

/**
 * Poll the database until the invoice reaches the expected status.
 * Returns the invoice ID once the status matches.
 */
async function waitForInvoiceStatus(
  orgId: string,
  expectedStatus: string,
  timeoutMs = 30_000
): Promise<string> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const { data } = await adminClient
      .from('invoices')
      .select('id, status')
      .eq('org_id', orgId)
      .order('uploaded_at', { ascending: false })
      .limit(1)
      .single()

    if (data?.status === expectedStatus) {
      return data.id
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(
    `Invoice did not reach status "${expectedStatus}" within ${timeoutMs}ms`
  )
}

test.describe('Upload, Extract, Review flow', () => {
  test('upload PDF, extraction completes, review page shows extracted data', async ({
    page,
  }) => {
    // 1. Create user and log in
    const user = await createTestUser('e2e-upload')
    createdUserIds.push(user.id)
    await loginAsUser(page, user)

    // 2. Navigate to upload page
    await page.goto('/upload')
    await expect(page.getByText('Upload Invoices')).toBeVisible()

    // 3. Upload a fixture PDF via the hidden file input
    const fixtureFile = path.resolve(
      __dirname,
      '../fixtures/invoice-016-photography.pdf'
    )
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles(fixtureFile)

    // After selecting a file, the file list appears with an upload button
    await expect(
      page.getByRole('button', { name: /Upload 1 File/i })
    ).toBeVisible()
    await page.getByRole('button', { name: /Upload 1 File/i }).click()

    // 4. Wait for extraction to complete by polling the database
    //    The mock provider returns instantly, but the async pipeline
    //    (waitUntil + DB writes) takes a moment. Polling the DB is more
    //    reliable than depending on Supabase Realtime in the test env.
    const invoiceId = await waitForInvoiceStatus(
      user.orgId,
      'pending_review',
      30_000
    )

    // 5. Navigate directly to the review page
    await page.goto(`/invoices/${invoiceId}/review`)

    // 6. Assert extracted data from the mock provider is visible
    //    Mock returns: vendor "Acme Office Supplies", total $486.00, INV-2026-0042
    await expect(
      page.locator('input[value="Acme Office Supplies"]')
    ).toBeVisible({ timeout: 10_000 })
    await expect(
      page.locator('input[value="INV-2026-0042"]')
    ).toBeVisible()

    // Verify line items are rendered (descriptions are in input fields, may need scroll)
    const lineItem1 = page.locator(
      'input[value="Premium copy paper (10 reams)"]'
    )
    await lineItem1.scrollIntoViewIfNeeded()
    await expect(lineItem1).toBeVisible({ timeout: 10_000 })
    await expect(
      page.locator('input[value="Ink cartridges - Black"]')
    ).toBeVisible()
  })
})
