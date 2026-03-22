import { adminClient } from './db'

interface CreateInvoiceOptions {
  orgId: string
  status?: string
  fileName?: string
  outputType?: string
}

interface TestInvoice {
  id: string
  orgId: string
  status: string
}

/**
 * Create a test invoice row directly in the database.
 * Does NOT upload a file -- just creates the metadata row.
 */
export async function createTestInvoice(
  options: CreateInvoiceOptions
): Promise<TestInvoice> {
  const {
    orgId,
    status = 'pending_review',
    fileName = 'test-invoice.pdf',
    outputType = 'bill',
  } = options

  const { data, error } = await adminClient
    .from('invoices')
    .insert({
      org_id: orgId,
      status,
      file_path: `test/${orgId}/${Date.now()}.pdf`,
      file_name: fileName,
      file_type: 'application/pdf',
      file_size_bytes: 12345,
      output_type: outputType,
    })
    .select('id, org_id, status')
    .single()

  if (error || !data) {
    throw new Error(`Failed to create test invoice: ${error?.message}`)
  }

  return { id: data.id, orgId: data.org_id, status: data.status }
}

interface CreateExtractedDataOptions {
  invoiceId: string
  vendorName?: string
  totalAmount?: number
  invoiceNumber?: string
}

/**
 * Create extracted data for a test invoice.
 */
export async function createTestExtractedData(
  options: CreateExtractedDataOptions
) {
  const {
    invoiceId,
    vendorName = 'Test Vendor Inc',
    totalAmount = 1500.0,
    invoiceNumber = 'INV-TEST-001',
  } = options

  const { data, error } = await adminClient
    .from('extracted_data')
    .insert({
      invoice_id: invoiceId,
      vendor_name: vendorName,
      total_amount: totalAmount,
      invoice_number: invoiceNumber,
      invoice_date: '2026-03-01',
      due_date: '2026-04-01',
      subtotal: totalAmount,
      tax_amount: 0,
      currency: 'USD',
      confidence_score: 'high',
      model_version: 'test',
    })
    .select('id')
    .single()

  if (error || !data) {
    throw new Error(`Failed to create test extracted data: ${error?.message}`)
  }

  return data
}

/**
 * Create a line item for extracted data.
 */
export async function createTestLineItem(
  extractedDataId: string,
  options: {
    description?: string
    quantity?: number
    unitPrice?: number
    amount?: number
  } = {}
) {
  const {
    description = 'Test Service',
    quantity = 1,
    unitPrice = 1500.0,
    amount = 1500.0,
  } = options

  const { data, error } = await adminClient
    .from('extracted_line_items')
    .insert({
      extracted_data_id: extractedDataId,
      description,
      quantity,
      unit_price: unitPrice,
      amount,
      sort_order: 0,
    })
    .select('id')
    .single()

  if (error || !data) {
    throw new Error(`Failed to create test line item: ${error?.message}`)
  }

  return data
}
