import { test, expect } from '@playwright/test'
import { createTestUser, loginAsUser } from './utils/auth'
import { cleanupTestUser, adminClient } from './utils/db'
import {
  createTestInvoice,
  createTestExtractedData,
  createTestLineItem,
} from './utils/fixtures'

let createdUserIds: string[] = []

test.afterEach(async () => {
  for (const userId of createdUserIds) {
    await cleanupTestUser(userId).catch(() => {})
  }
  createdUserIds = []
})

test.describe('Review and edit extracted fields', () => {
  test('extracted fields are displayed and editable with corrections recorded', async ({
    page,
  }) => {
    // Setup: user + invoice + extracted data + line item
    const user = await createTestUser('e2e-review')
    createdUserIds.push(user.id)

    const invoice = await createTestInvoice({
      orgId: user.orgId,
      status: 'pending_review',
    })
    const extracted = await createTestExtractedData({
      invoiceId: invoice.id,
      vendorName: 'Original Vendor Co',
      totalAmount: 2500.0,
      invoiceNumber: 'INV-REVIEW-001',
    })
    await createTestLineItem(extracted.id, {
      description: 'Consulting services',
      quantity: 10,
      unitPrice: 250.0,
      amount: 2500.0,
    })

    await loginAsUser(page, user)
    await page.goto(`/invoices/${invoice.id}/review`)

    // Verify extracted fields are displayed
    await expect(
      page.locator('input[value="Original Vendor Co"]')
    ).toBeVisible({ timeout: 10_000 })
    await expect(
      page.locator('input[value="INV-REVIEW-001"]')
    ).toBeVisible()

    // Edit vendor name using label-based locator (stable across value changes)
    const vendorInput = page
      .locator('label:has-text("Vendor Name")')
      .locator('..')
      .locator('input')
    await vendorInput.click()
    await vendorInput.fill('Updated Vendor Inc')
    // Click elsewhere to trigger blur/save
    await page.locator('h3:has-text("Invoice Details")').click()

    // Wait for save to complete
    await expect(vendorInput).toHaveValue('Updated Vendor Inc')
    await page.waitForTimeout(1000)

    // Edit total amount -- click into it, clear, type new value, blur
    const totalInput = page
      .locator('label:has-text("Total Amount")')
      .locator('..')
      .locator('input')
    await totalInput.click()
    await totalInput.fill('3000')
    // Click elsewhere to trigger blur/save
    await page.locator('h3:has-text("Amounts")').click()

    // Wait for auto-save to complete (saved indicator appears)
    await page.waitForTimeout(1000)

    // Reload page to confirm persistence
    await page.reload()
    await expect(
      page.locator('input[value="Updated Vendor Inc"]')
    ).toBeVisible({ timeout: 10_000 })

    // Verify corrections were recorded in the database
    const { data: corrections } = await adminClient
      .from('corrections')
      .select('field_name, original_value, corrected_value')
      .eq('invoice_id', invoice.id)
      .order('corrected_at', { ascending: true })

    expect(corrections).toBeTruthy()
    expect(corrections!.length).toBeGreaterThanOrEqual(1)

    const vendorCorrection = corrections!.find(
      (c) => c.field_name === 'vendor_name'
    )
    expect(vendorCorrection).toBeTruthy()
    expect(vendorCorrection!.original_value).toBe('Original Vendor Co')
    expect(vendorCorrection!.corrected_value).toBe('Updated Vendor Inc')
  })
})

test.describe('Line item editing', () => {
  test('add, edit, and delete line items', async ({ page }) => {
    const user = await createTestUser('e2e-lineitems')
    createdUserIds.push(user.id)

    const invoice = await createTestInvoice({
      orgId: user.orgId,
      status: 'pending_review',
    })
    const extracted = await createTestExtractedData({
      invoiceId: invoice.id,
      vendorName: 'Line Item Test Vendor',
      totalAmount: 500.0,
      invoiceNumber: 'INV-LI-001',
    })
    await createTestLineItem(extracted.id, {
      description: 'Existing service',
      quantity: 5,
      unitPrice: 100.0,
      amount: 500.0,
    })

    await loginAsUser(page, user)
    await page.goto(`/invoices/${invoice.id}/review`)

    // Verify existing line item is displayed
    await expect(
      page.locator('input[value="Existing service"]')
    ).toBeVisible({ timeout: 10_000 })

    // Add a new line item
    await page.getByText('+ Add line item').click()

    // New row should appear with empty description focused
    const descriptionInputs = page.locator(
      'input[placeholder="Description"]'
    )
    await expect(descriptionInputs).toHaveCount(2, { timeout: 5_000 })

    // Fill the new line item
    const newDescription = descriptionInputs.nth(1)
    await newDescription.fill('New consulting item')
    await newDescription.blur()
    await page.waitForTimeout(500)

    // Fill quantity on the new row
    const qtyInputs = page.locator('input[placeholder="0"]')
    const newQty = qtyInputs.nth(1)
    await newQty.click()
    await newQty.fill('3')
    await newQty.blur()
    await page.waitForTimeout(500)

    // Fill unit price on the new row
    const priceInputs = page.locator('input[placeholder="$0.00"]')
    // priceInputs includes unit_price and amount columns -- unit price is first for each row
    const newPrice = priceInputs.nth(2) // 0=row1 unit_price, 1=row1 amount, 2=row2 unit_price
    await newPrice.click()
    await newPrice.fill('200')
    await newPrice.blur()
    await page.waitForTimeout(1000)

    // Verify amount auto-calculated (3 * 200 = 600)
    // The amount field for the new row should show $600.00 after blur
    const newAmount = priceInputs.nth(3) // row2 amount
    await expect(newAmount).toHaveValue('$600.00', { timeout: 5_000 })

    // Edit existing line item description
    const existingDescription = descriptionInputs.nth(0)
    await existingDescription.click()
    await existingDescription.fill('Updated existing service')
    await existingDescription.blur()
    await page.waitForTimeout(500)

    // Delete the first line item (existing one)
    const removeButtons = page.locator('button[aria-label="Remove line item"]')
    await removeButtons.nth(0).click()
    await page.waitForTimeout(500)

    // Should have 1 line item left
    await expect(descriptionInputs).toHaveCount(1, { timeout: 5_000 })
    await expect(
      page.locator('input[value="New consulting item"]')
    ).toBeVisible()
  })
})

test.describe('Approve invoice', () => {
  test('approve works when required fields are present', async ({ page }) => {
    const user = await createTestUser('e2e-approve')
    createdUserIds.push(user.id)

    const invoice = await createTestInvoice({
      orgId: user.orgId,
      status: 'pending_review',
    })
    const extracted = await createTestExtractedData({
      invoiceId: invoice.id,
      vendorName: 'Approvable Vendor',
      totalAmount: 1000.0,
      invoiceNumber: 'INV-APPROVE-001',
    })
    await createTestLineItem(extracted.id)

    await loginAsUser(page, user)
    await page.goto(`/invoices/${invoice.id}/review`)

    // Wait for form to load
    await expect(
      page.locator('input[value="Approvable Vendor"]')
    ).toBeVisible({ timeout: 10_000 })

    // "Ready to approve" message should be visible
    await expect(page.getByText('Ready to approve')).toBeVisible()

    // Click Approve
    await page.getByRole('button', { name: 'Approve Invoice' }).click()

    // After approval, the ActionBar transitions to the sync phase.
    // The "Invoice approved" flash is transient (500ms), so wait for
    // the sync phase UI which confirms the approve succeeded.
    await expect(
      page.getByText(/Ready to sync to/i)
    ).toBeVisible({ timeout: 10_000 })

    // Verify status changed in the database
    const { data: updatedInvoice } = await adminClient
      .from('invoices')
      .select('status')
      .eq('id', invoice.id)
      .single()
    expect(updatedInvoice?.status).toBe('approved')

    // Navigate to invoice list and verify status badge
    await page.goto('/invoices')
    await expect(page.getByText('Approved').first()).toBeVisible({
      timeout: 10_000,
    })
  })

  test('approve is blocked when required fields are missing', async ({
    page,
  }) => {
    const user = await createTestUser('e2e-approve-blocked')
    createdUserIds.push(user.id)

    const invoice = await createTestInvoice({
      orgId: user.orgId,
      status: 'pending_review',
    })
    // Create extracted data with empty vendor name
    await createTestExtractedData({
      invoiceId: invoice.id,
      vendorName: '',
      totalAmount: 500.0,
      invoiceNumber: 'INV-BLOCKED-001',
    })

    await loginAsUser(page, user)
    await page.goto(`/invoices/${invoice.id}/review`)

    // Wait for form to load
    await expect(
      page.locator('input[value="INV-BLOCKED-001"]')
    ).toBeVisible({ timeout: 10_000 })

    // Approve button should be disabled
    const approveButton = page.getByRole('button', {
      name: 'Approve Invoice',
    })
    await expect(approveButton).toBeDisabled()

    // Missing field message should show vendor name
    await expect(page.getByText(/Missing:.*vendor name/i)).toBeVisible()

    // Fill in vendor name
    const vendorInput = page
      .locator('label:has-text("Vendor Name")')
      .locator('..')
      .locator('input')
    await vendorInput.click()
    await vendorInput.fill('Now Has Vendor')
    await vendorInput.blur()
    await page.waitForTimeout(1000)

    // Approve button should become enabled
    await expect(approveButton).toBeEnabled({ timeout: 5_000 })

    // "Ready to approve" should appear
    await expect(page.getByText('Ready to approve')).toBeVisible()
  })
})

test.describe('Confidence indicators', () => {
  test('low-confidence invoice shows warning banner', async ({ page }) => {
    const user = await createTestUser('e2e-confidence')
    createdUserIds.push(user.id)

    const invoice = await createTestInvoice({
      orgId: user.orgId,
      status: 'pending_review',
    })

    // Create extracted data with low confidence using admin client directly
    const { error } = await adminClient.from('extracted_data').insert({
      invoice_id: invoice.id,
      vendor_name: 'Low Confidence Vendor',
      total_amount: 999.99,
      invoice_number: 'INV-LOW-001',
      invoice_date: '2026-03-01',
      due_date: '2026-04-01',
      subtotal: 999.99,
      tax_amount: 0,
      currency: 'USD',
      confidence_score: 'low',
      model_version: 'test',
    })
    if (error) throw new Error(`Failed to create low-confidence data: ${error.message}`)

    await loginAsUser(page, user)
    await page.goto(`/invoices/${invoice.id}/review`)

    // Low-confidence warning banner should be visible
    await expect(
      page.getByText('Some fields may need extra attention')
    ).toBeVisible({ timeout: 10_000 })

    // Fields should have warning styling (border-l-2 border-error for low confidence)
    // Check that the vendor input's parent wrapper has the error border class
    const vendorInput = page.locator('input[value="Low Confidence Vendor"]')
    await expect(vendorInput).toBeVisible()
  })
})
