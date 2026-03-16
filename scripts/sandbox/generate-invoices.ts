/**
 * Generate synthetic test invoices as PDFs for extraction validation.
 * Each invoice has a known "ground truth" so we can score accuracy.
 *
 * Usage: npx tsx scripts/sandbox/generate-invoices.ts
 */

import * as fs from "fs";
import * as path from "path";

const FIXTURES_DIR = path.resolve(__dirname, "fixtures");

// ── Ground Truth Data ─────────────────────────────────────────────────────────

export interface GroundTruth {
  filename: string;
  description: string;
  vendor_name: string;
  vendor_address: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string;
  payment_terms: string;
  currency: string;
  line_items: Array<{
    description: string;
    quantity: number;
    unit_price: number;
    amount: number;
  }>;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
}

export const GROUND_TRUTHS: GroundTruth[] = [
  {
    filename: "invoice-001-standard.pdf",
    description: "Standard typed invoice, clean layout, multiple line items",
    vendor_name: "Acme Office Supplies Inc.",
    vendor_address: "123 Business Park Drive, Suite 400, Austin, TX 78701",
    invoice_number: "INV-2026-0847",
    invoice_date: "2026-03-01",
    due_date: "2026-03-31",
    payment_terms: "Net 30",
    currency: "USD",
    line_items: [
      { description: "Premium Copy Paper (10 reams)", quantity: 10, unit_price: 45.99, amount: 459.90 },
      { description: "Ink Cartridges - Black HP 61XL", quantity: 4, unit_price: 32.50, amount: 130.00 },
      { description: "Desk Organizer Set", quantity: 2, unit_price: 28.75, amount: 57.50 },
    ],
    subtotal: 647.40,
    tax_amount: 53.41,
    total_amount: 700.81,
  },
  {
    filename: "invoice-002-simple.pdf",
    description: "Simple invoice, single line item, no tax",
    vendor_name: "CloudHost Pro LLC",
    vendor_address: "500 Tech Boulevard, San Francisco, CA 94105",
    invoice_number: "CH-10492",
    invoice_date: "2026-02-15",
    due_date: "2026-03-15",
    payment_terms: "Net 30",
    currency: "USD",
    line_items: [
      { description: "Monthly Cloud Hosting - Business Plan (March 2026)", quantity: 1, unit_price: 299.00, amount: 299.00 },
    ],
    subtotal: 299.00,
    tax_amount: 0,
    total_amount: 299.00,
  },
  {
    filename: "invoice-003-detailed.pdf",
    description: "Detailed invoice with many line items and tax breakdown",
    vendor_name: "Martinez Plumbing & HVAC Services",
    vendor_address: "2847 Industrial Way, Denver, CO 80204",
    invoice_number: "MP-2026-0156",
    invoice_date: "2026-03-10",
    due_date: "2026-04-09",
    payment_terms: "Net 30",
    currency: "USD",
    line_items: [
      { description: "Emergency pipe repair - labor (3 hrs)", quantity: 3, unit_price: 125.00, amount: 375.00 },
      { description: "PVC Pipe 2-inch (10 ft)", quantity: 2, unit_price: 18.50, amount: 37.00 },
      { description: "Pipe fittings and connectors", quantity: 8, unit_price: 4.75, amount: 38.00 },
      { description: "Plumber's putty and sealant", quantity: 1, unit_price: 12.99, amount: 12.99 },
      { description: "Service call fee", quantity: 1, unit_price: 75.00, amount: 75.00 },
    ],
    subtotal: 537.99,
    tax_amount: 44.38,
    total_amount: 582.37,
  },
  {
    filename: "invoice-004-international.pdf",
    description: "International invoice in GBP with VAT",
    vendor_name: "Brighton Digital Agency Ltd",
    vendor_address: "14 Queen's Road, Brighton, East Sussex, BN1 3WA, United Kingdom",
    invoice_number: "BDA/2026/0089",
    invoice_date: "2026-03-05",
    due_date: "2026-04-04",
    payment_terms: "Net 30",
    currency: "GBP",
    line_items: [
      { description: "Website redesign - Discovery phase", quantity: 1, unit_price: 2500.00, amount: 2500.00 },
      { description: "UI/UX wireframes (15 pages)", quantity: 15, unit_price: 150.00, amount: 2250.00 },
      { description: "Brand guidelines document", quantity: 1, unit_price: 800.00, amount: 800.00 },
    ],
    subtotal: 5550.00,
    tax_amount: 1110.00,
    total_amount: 6660.00,
  },
  {
    filename: "invoice-005-minimal.pdf",
    description: "Minimal invoice with sparse formatting, missing some fields",
    vendor_name: "Joe's Landscaping",
    vendor_address: "PO Box 442, Bend, OR 97701",
    invoice_number: "1087",
    invoice_date: "2026-03-12",
    due_date: "2026-03-26",
    payment_terms: "Due in 14 days",
    currency: "USD",
    line_items: [
      { description: "Lawn mowing and edging", quantity: 1, unit_price: 85.00, amount: 85.00 },
      { description: "Hedge trimming", quantity: 1, unit_price: 120.00, amount: 120.00 },
    ],
    subtotal: 205.00,
    tax_amount: 0,
    total_amount: 205.00,
  },
];

// ── PDF Generation ────────────────────────────────────────────────────────────

/**
 * Build a proper text-based PDF with invoice content.
 * Uses raw PDF operators for text layout.
 */
function generateInvoicePdf(gt: GroundTruth): Buffer {
  const currencySymbol = gt.currency === "GBP" ? "\xa3" : "$";
  const taxLabel = gt.currency === "GBP" ? "VAT (20%)" : "Sales Tax";

  // Build page content stream
  const lines: string[] = [];
  let y = 750;

  function addText(x: number, yPos: number, size: number, text: string, bold = false) {
    const font = bold ? "/F2" : "/F1";
    lines.push(`BT ${font} ${size} Tf ${x} ${yPos} Td (${escapePdf(text)}) Tj ET`);
  }

  function escapePdf(str: string): string {
    return str.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  }

  // Header
  addText(50, y, 20, "INVOICE", true);
  y -= 30;

  // Vendor info
  addText(50, y, 12, gt.vendor_name, true);
  y -= 18;
  // Split address at commas for multi-line
  const addrParts = gt.vendor_address.split(", ");
  for (const part of addrParts) {
    addText(50, y, 10, part.trim());
    y -= 14;
  }
  y -= 10;

  // Invoice details (right-aligned area)
  const detailsStartY = 720;
  addText(350, detailsStartY, 10, `Invoice Number: ${gt.invoice_number}`);
  addText(350, detailsStartY - 16, 10, `Invoice Date: ${gt.invoice_date}`);
  addText(350, detailsStartY - 32, 10, `Due Date: ${gt.due_date}`);
  addText(350, detailsStartY - 48, 10, `Payment Terms: ${gt.payment_terms}`);
  addText(350, detailsStartY - 64, 10, `Currency: ${gt.currency}`);

  // Separator line
  y -= 5;
  lines.push(`${50} ${y} m ${560} ${y} l S`);
  y -= 20;

  // Column headers
  addText(50, y, 10, "Description", true);
  addText(330, y, 10, "Qty", true);
  addText(390, y, 10, "Unit Price", true);
  addText(490, y, 10, "Amount", true);
  y -= 5;
  lines.push(`${50} ${y} m ${560} ${y} l S`);
  y -= 18;

  // Line items
  for (const item of gt.line_items) {
    addText(50, y, 10, item.description);
    addText(330, y, 10, item.quantity.toString());
    addText(390, y, 10, `${currencySymbol}${item.unit_price.toFixed(2)}`);
    addText(490, y, 10, `${currencySymbol}${item.amount.toFixed(2)}`);
    y -= 18;
  }

  // Separator
  y -= 5;
  lines.push(`${350} ${y} m ${560} ${y} l S`);
  y -= 20;

  // Totals
  addText(390, y, 10, "Subtotal:");
  addText(490, y, 10, `${currencySymbol}${gt.subtotal.toFixed(2)}`);
  y -= 18;

  if (gt.tax_amount > 0) {
    addText(390, y, 10, `${taxLabel}:`);
    addText(490, y, 10, `${currencySymbol}${gt.tax_amount.toFixed(2)}`);
    y -= 18;
  }

  // Total line
  lines.push(`${380} ${y + 12} m ${560} ${y + 12} l S`);
  addText(390, y, 12, "TOTAL:", true);
  addText(490, y, 12, `${currencySymbol}${gt.total_amount.toFixed(2)}`, true);

  // Build PDF structure
  const contentStream = lines.join("\n");
  const streamBytes = Buffer.from(contentStream, "latin1");

  const pdf = buildPdf(streamBytes);
  return pdf;
}

function buildPdf(contentStream: Buffer): Buffer {
  const objects: string[] = [];

  // Object 1: Catalog
  objects.push("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj");

  // Object 2: Pages
  objects.push("2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj");

  // Object 3: Page
  objects.push(
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] " +
      "/Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>\nendobj"
  );

  // Object 4: Content stream
  objects.push(
    `4 0 obj\n<< /Length ${contentStream.length} >>\nstream\n` +
      contentStream.toString("latin1") +
      "\nendstream\nendobj"
  );

  // Object 5: Font (Helvetica)
  objects.push(
    "5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj"
  );

  // Object 6: Font (Helvetica-Bold)
  objects.push(
    "6 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\nendobj"
  );

  // Build the file
  const header = "%PDF-1.4\n";
  let body = "";
  const offsets: number[] = [];

  let currentOffset = header.length;
  for (const obj of objects) {
    offsets.push(currentOffset);
    body += obj + "\n";
    currentOffset = header.length + body.length;
  }

  // Cross-reference table
  const xrefOffset = currentOffset;
  let xref = `xref\n0 ${objects.length + 1}\n`;
  xref += "0000000000 65535 f \n";
  for (const offset of offsets) {
    xref += `${offset.toString().padStart(10, "0")} 00000 n \n`;
  }

  // Trailer
  const trailer =
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n` +
    `startxref\n${xrefOffset}\n%%EOF`;

  return Buffer.from(header + body + xref + trailer, "latin1");
}

// ── Main ──────────────────────────────────────────────────────────────────────

function main() {
  if (!fs.existsSync(FIXTURES_DIR)) {
    fs.mkdirSync(FIXTURES_DIR, { recursive: true });
  }

  // Write ground truth JSON for the test script
  fs.writeFileSync(
    path.join(FIXTURES_DIR, "ground-truth.json"),
    JSON.stringify(GROUND_TRUTHS, null, 2)
  );
  console.log("Wrote ground-truth.json");

  for (const gt of GROUND_TRUTHS) {
    const pdf = generateInvoicePdf(gt);
    const outPath = path.join(FIXTURES_DIR, gt.filename);
    fs.writeFileSync(outPath, pdf);
    console.log(`Generated ${gt.filename} (${pdf.length} bytes) — ${gt.description}`);
  }

  console.log(`\n✅ Generated ${GROUND_TRUTHS.length} test invoices in ${FIXTURES_DIR}`);
}

main();
