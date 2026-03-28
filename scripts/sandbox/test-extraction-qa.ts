/**
 * DOC-113 QA Script: Re-extract real customer invoices with improved prompt
 *
 * Downloads problem invoices from Supabase Storage, runs them through the
 * updated ClaudeExtractionProvider, and prints before/after comparison.
 *
 * Usage:
 *   npx tsx scripts/sandbox/test-extraction-qa.ts
 */

import * as dotenv from "dotenv";
import * as path from "path";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: path.resolve(__dirname, "../../.env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Test invoices from levolorman's feedback
const TEST_INVOICES = [
  {
    label: "Harbor Freight (store address issue)",
    invoiceId: "6025b1ff-7e9a-4d30-a8ff-70520a14c9dd",
    filePath: "3f10cbac-77ec-40fb-bf3a-275839e50d38/6025b1ff-7e9a-4d30-a8ff-70520a14c9dd/AutoEntry invoice 220008913.pdf",
    fileType: "application/pdf",
    previousResult: {
      vendorAddress: "40 N. White Horse Pike, Hammonton, NJ 8037",
      lineItemCount: 9,
    },
    checks: [
      {
        field: "vendor_address",
        description: "Should NOT be a store location (Hammonton NJ)",
        validate: (result: Record<string, unknown>) => {
          const addr = String(result.vendor_address ?? "").toLowerCase();
          return !addr.includes("hammonton") && !addr.includes("white horse");
        },
      },
    ],
  },
  {
    label: "Birttani (missing shipping charge)",
    invoiceId: "df262eeb-813b-4e00-a2ba-6bda6d1b986c",
    filePath: "3f10cbac-77ec-40fb-bf3a-275839e50d38/df262eeb-813b-4e00-a2ba-6bda6d1b986c/AutoEntry invoice 220368665.pdf",
    fileType: "application/pdf",
    previousResult: {
      lineItemCount: 2,
      subtotal: 253.0,
      totalAmount: 299.48,
      gap: 46.48,
    },
    checks: [
      {
        field: "line_items",
        description: "Should have more than 2 line items (shipping was missing)",
        validate: (result: Record<string, unknown>) => {
          const items = result.line_items as Array<unknown>;
          return items && items.length > 2;
        },
      },
      {
        field: "shipping",
        description: "Should include a shipping/freight line item",
        validate: (result: Record<string, unknown>) => {
          const items = result.line_items as Array<{ description?: string }>;
          return items?.some((item) => {
            const desc = (item.description ?? "").toLowerCase();
            return desc.includes("ship") || desc.includes("freight") || desc.includes("delivery") || desc.includes("handling");
          });
        },
      },
    ],
  },
];

async function downloadFile(filePath: string): Promise<Buffer> {
  const { data, error } = await supabase.storage
    .from("invoices")
    .createSignedUrl(filePath, 3600);

  if (error || !data?.signedUrl) {
    throw new Error(`Failed to get signed URL for ${filePath}: ${error?.message}`);
  }

  const response = await fetch(data.signedUrl);
  if (!response.ok) {
    throw new Error(`Failed to download file: ${response.status}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

async function extractWithProvider(fileBuffer: Buffer, mimeType: string) {
  // Import dynamically to pick up the updated prompt
  const { ClaudeExtractionProvider } = await import("../../lib/extraction/claude");
  const provider = new ClaudeExtractionProvider();
  return provider.extractInvoiceData(fileBuffer, mimeType);
}

async function main() {
  console.log("=== DOC-113 QA: Extraction Accuracy Improvements ===\n");

  for (const invoice of TEST_INVOICES) {
    console.log(`--- ${invoice.label} ---`);
    console.log(`Invoice ID: ${invoice.invoiceId}`);

    try {
      // Download
      console.log("Downloading from Supabase Storage...");
      const fileBuffer = await downloadFile(invoice.filePath);
      console.log(`Downloaded ${fileBuffer.length} bytes`);

      // Extract
      console.log("Running extraction with improved prompt...");
      const result = await extractWithProvider(fileBuffer, invoice.fileType);

      // Print results
      console.log("\nExtraction Results:");
      console.log(`  Vendor:     ${result.data.vendorName}`);
      console.log(`  Address:    ${result.data.vendorAddress}`);
      console.log(`  Subtotal:   ${result.data.subtotal}`);
      console.log(`  Tax:        ${result.data.taxAmount}`);
      console.log(`  Total:      ${result.data.totalAmount}`);
      console.log(`  Confidence: ${result.data.confidenceScore}`);
      console.log(`  Line items: ${result.data.lineItems.length}`);
      for (const item of result.data.lineItems) {
        console.log(`    - ${item.description} | qty: ${item.quantity} | $${item.amount}`);
      }

      // Previous comparison
      console.log("\nPrevious Result:");
      console.log(`  ${JSON.stringify(invoice.previousResult)}`);

      // Run checks
      console.log("\nChecks:");
      const rawResponse = (result.rawResponse as { parsed?: Record<string, unknown> })?.parsed ?? {};
      for (const check of invoice.checks) {
        const passed = check.validate(rawResponse);
        console.log(`  ${passed ? "PASS" : "FAIL"} ${check.description}`);
      }
    } catch (err) {
      console.error(`  ERROR: ${err instanceof Error ? err.message : String(err)}`);
    }

    console.log("");
  }
}

main().catch(console.error);
