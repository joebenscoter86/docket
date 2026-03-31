import type { ExtractionProvider, ExtractionResult } from "./types";

/**
 * Mock extraction provider for E2E tests.
 * Returns deterministic data instantly without calling any external API.
 * Activated by setting EXTRACTION_PROVIDER=mock in .env.test.
 */
export class MockExtractionProvider implements ExtractionProvider {
  extractInvoiceData(): Promise<ExtractionResult> {
    return Promise.resolve({
      data: {
        vendorName: "Acme Office Supplies",
        vendorAddress: "456 Commerce St, Austin, TX 78701",
        invoiceNumber: "INV-2026-0042",
        invoiceDate: "2026-03-15",
        dueDate: "2026-04-14",
        subtotal: 450.0,
        taxAmount: 36.0,
        totalAmount: 486.0,
        currency: "USD",
        paymentTerms: "Net 30",
        confidenceScore: "high",
        lineItems: [
          {
            description: "Premium copy paper (10 reams)",
            quantity: 10,
            unitPrice: 25.0,
            amount: 250.0,
            sortOrder: 0,
            suggestedGlAccountId: null,
          },
          {
            description: "Ink cartridges - Black",
            quantity: 4,
            unitPrice: 50.0,
            amount: 200.0,
            sortOrder: 1,
            suggestedGlAccountId: null,
          },
        ],
      },
      rawResponse: { mock: true },
      modelVersion: "mock-provider",
      durationMs: 50,
    });
  }
}
