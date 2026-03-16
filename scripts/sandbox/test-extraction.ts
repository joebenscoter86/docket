/**
 * AI Extraction Validation Script (DOC-11 / FND-11)
 *
 * Tests Claude Vision API's ability to extract structured invoice data.
 * Sends synthetic test invoices, compares output to known ground truth,
 * and reports per-field accuracy.
 *
 * Usage:
 *   npx tsx scripts/sandbox/generate-invoices.ts   # Generate test PDFs first
 *   npx tsx scripts/sandbox/test-extraction.ts      # Run extraction tests
 */

import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../.env.local") });

// ── Config ────────────────────────────────────────────────────────────────────

const API_KEY = process.env.ANTHROPIC_API_KEY!;
const MODEL = "claude-sonnet-4-20250514";
const FIXTURES_DIR = path.resolve(__dirname, "fixtures");

if (!API_KEY) {
  console.error("❌ Missing ANTHROPIC_API_KEY in .env.local");
  process.exit(1);
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface ExtractedInvoice {
  vendor_name: string | null;
  vendor_address: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  due_date: string | null;
  payment_terms: string | null;
  currency: string | null;
  line_items: Array<{
    description: string | null;
    quantity: number | null;
    unit_price: number | null;
    amount: number | null;
  }>;
  subtotal: number | null;
  tax_amount: number | null;
  total_amount: number | null;
  confidence: "high" | "medium" | "low";
}

interface GroundTruth {
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

interface FieldResult {
  field: string;
  expected: string;
  extracted: string;
  match: boolean;
}

interface InvoiceResult {
  filename: string;
  description: string;
  fields: FieldResult[];
  lineItemAccuracy: number;
  overallAccuracy: number;
  confidence: string;
  durationMs: number;
  inputTokens: number;
  outputTokens: number;
}

// ── Extraction Prompt ─────────────────────────────────────────────────────────

const EXTRACTION_PROMPT = `You are an invoice data extraction system. Extract structured data from the provided invoice document.

Return ONLY valid JSON matching this exact schema — no markdown, no explanation, no code fences:

{
  "vendor_name": "string or null",
  "vendor_address": "string or null — full address as a single string",
  "invoice_number": "string or null",
  "invoice_date": "YYYY-MM-DD or null",
  "due_date": "YYYY-MM-DD or null",
  "payment_terms": "string or null (e.g., 'Net 30', 'Due on receipt')",
  "currency": "ISO 4217 code (e.g., 'USD', 'GBP') or null",
  "line_items": [
    {
      "description": "string or null",
      "quantity": number or null,
      "unit_price": number or null,
      "amount": number or null
    }
  ],
  "subtotal": number or null,
  "tax_amount": number or null — use 0 if no tax shown,
  "total_amount": number or null,
  "confidence": "high | medium | low — your confidence in the overall extraction accuracy"
}

Rules:
- Dates must be ISO format YYYY-MM-DD
- Numbers must be plain numbers (no currency symbols, no commas)
- If a field is not visible or cannot be determined, use null
- For line items, extract every line item visible in the invoice
- The confidence field reflects your overall confidence: "high" if the document is clear and all fields are readable, "medium" if some fields are ambiguous, "low" if the document is poor quality or heavily obscured
- Do not infer or calculate values — extract only what is explicitly shown
- Return raw JSON only — no wrapping, no explanation`;

// ── API Call ──────────────────────────────────────────────────────────────────

async function extractInvoice(pdfPath: string): Promise<{
  result: ExtractedInvoice;
  durationMs: number;
  inputTokens: number;
  outputTokens: number;
}> {
  const pdfBuffer = fs.readFileSync(pdfPath);
  const base64Pdf = pdfBuffer.toString("base64");

  const startTime = Date.now();

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2048,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: base64Pdf,
              },
            },
            {
              type: "text",
              text: EXTRACTION_PROMPT,
            },
          ],
        },
      ],
    }),
  });

  const durationMs = Date.now() - startTime;

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API error ${response.status}: ${errorText}`);
  }

  const data = (await response.json()) as {
    content: Array<{ type: string; text?: string }>;
    usage: { input_tokens: number; output_tokens: number };
  };

  const textContent = data.content.find((c) => c.type === "text");
  if (!textContent?.text) {
    throw new Error("No text content in response");
  }

  // Parse JSON — handle potential markdown code fences
  let jsonStr = textContent.text.trim();
  if (jsonStr.startsWith("```")) {
    jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }

  const result = JSON.parse(jsonStr) as ExtractedInvoice;

  return {
    result,
    durationMs,
    inputTokens: data.usage.input_tokens,
    outputTokens: data.usage.output_tokens,
  };
}

// ── Scoring ───────────────────────────────────────────────────────────────────

function normalizeString(s: string | null | undefined): string {
  if (!s) return "";
  return s.toLowerCase().trim().replace(/\s+/g, " ");
}

function fuzzyMatch(expected: string, extracted: string): boolean {
  const e = normalizeString(expected);
  const x = normalizeString(extracted);
  if (e === x) return true;
  // Check if one contains the other (handles partial address matches, etc.)
  if (e.includes(x) || x.includes(e)) return true;
  return false;
}

function numberMatch(expected: number, extracted: number | null): boolean {
  if (extracted === null || extracted === undefined) return false;
  return Math.abs(expected - extracted) < 0.02; // Allow 1 cent rounding
}

function scoreExtraction(gt: GroundTruth, extracted: ExtractedInvoice): {
  fields: FieldResult[];
  lineItemAccuracy: number;
} {
  const fields: FieldResult[] = [];

  // String fields
  const stringFields: Array<{ key: keyof GroundTruth; label: string }> = [
    { key: "vendor_name", label: "Vendor Name" },
    { key: "vendor_address", label: "Vendor Address" },
    { key: "invoice_number", label: "Invoice Number" },
    { key: "invoice_date", label: "Invoice Date" },
    { key: "due_date", label: "Due Date" },
    { key: "payment_terms", label: "Payment Terms" },
    { key: "currency", label: "Currency" },
  ];

  for (const { key, label } of stringFields) {
    const expected = String(gt[key]);
    const extractedVal = String((extracted as unknown as Record<string, unknown>)[key] ?? "");
    fields.push({
      field: label,
      expected,
      extracted: extractedVal,
      match: fuzzyMatch(expected, extractedVal),
    });
  }

  // Numeric fields
  const numericFields: Array<{ key: string; label: string; gtKey: keyof GroundTruth }> = [
    { key: "subtotal", label: "Subtotal", gtKey: "subtotal" },
    { key: "tax_amount", label: "Tax Amount", gtKey: "tax_amount" },
    { key: "total_amount", label: "Total Amount", gtKey: "total_amount" },
  ];

  for (const { key, label, gtKey } of numericFields) {
    const expected = gt[gtKey] as number;
    const extractedVal = (extracted as unknown as Record<string, unknown>)[key] as number | null;
    fields.push({
      field: label,
      expected: expected.toFixed(2),
      extracted: extractedVal?.toFixed(2) ?? "null",
      match: numberMatch(expected, extractedVal),
    });
  }

  // Line items
  let lineItemMatches = 0;
  let lineItemTotal = 0;
  const minLen = Math.min(gt.line_items.length, extracted.line_items?.length ?? 0);

  for (let i = 0; i < minLen; i++) {
    const gtItem = gt.line_items[i];
    const exItem = extracted.line_items[i];

    // Score each field in the line item
    lineItemTotal += 4; // description, quantity, unit_price, amount
    if (fuzzyMatch(gtItem.description, exItem.description ?? "")) lineItemMatches++;
    if (numberMatch(gtItem.quantity, exItem.quantity)) lineItemMatches++;
    if (numberMatch(gtItem.unit_price, exItem.unit_price)) lineItemMatches++;
    if (numberMatch(gtItem.amount, exItem.amount)) lineItemMatches++;
  }

  // Penalize missing or extra line items
  const extraItems = Math.abs(gt.line_items.length - (extracted.line_items?.length ?? 0));
  lineItemTotal += extraItems * 4;

  const lineItemAccuracy = lineItemTotal > 0 ? lineItemMatches / lineItemTotal : 0;

  return { fields, lineItemAccuracy };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🧠 AI Extraction Validation — DOC-11");
  console.log(`   Model: ${MODEL}`);
  console.log(`   Fixtures: ${FIXTURES_DIR}`);
  console.log("");

  // Load ground truths
  const gtPath = path.join(FIXTURES_DIR, "ground-truth.json");
  if (!fs.existsSync(gtPath)) {
    console.error("❌ No ground-truth.json found. Run generate-invoices.ts first.");
    process.exit(1);
  }

  const groundTruths: GroundTruth[] = JSON.parse(fs.readFileSync(gtPath, "utf-8"));
  const results: InvoiceResult[] = [];

  // Also track per-field aggregate stats
  const fieldStats: Record<string, { correct: number; total: number }> = {};

  for (const gt of groundTruths) {
    const pdfPath = path.join(FIXTURES_DIR, gt.filename);
    if (!fs.existsSync(pdfPath)) {
      console.log(`⚠️  Skipping ${gt.filename} — PDF not found`);
      continue;
    }

    console.log(`\n${"─".repeat(60)}`);
    console.log(`📄 ${gt.filename}`);
    console.log(`   ${gt.description}`);

    try {
      const { result, durationMs, inputTokens, outputTokens } = await extractInvoice(pdfPath);

      const { fields, lineItemAccuracy } = scoreExtraction(gt, result);

      // Calculate overall accuracy
      const fieldMatches = fields.filter((f) => f.match).length;
      const headerAccuracy = fieldMatches / fields.length;
      const overallAccuracy = headerAccuracy * 0.6 + lineItemAccuracy * 0.4;

      // Print field-by-field results
      for (const f of fields) {
        const icon = f.match ? "✅" : "❌";
        console.log(`   ${icon} ${f.field}: "${f.extracted}" (expected: "${f.expected}")`);

        // Aggregate stats
        if (!fieldStats[f.field]) fieldStats[f.field] = { correct: 0, total: 0 };
        fieldStats[f.field].total++;
        if (f.match) fieldStats[f.field].correct++;
      }

      console.log(
        `   📊 Line items: ${(lineItemAccuracy * 100).toFixed(0)}% ` +
          `(${gt.line_items.length} expected, ${result.line_items?.length ?? 0} extracted)`
      );
      console.log(`   📊 Overall: ${(overallAccuracy * 100).toFixed(0)}%`);
      console.log(`   🎯 Confidence: ${result.confidence}`);
      console.log(`   ⏱️  ${durationMs}ms | ${inputTokens} in / ${outputTokens} out tokens`);

      results.push({
        filename: gt.filename,
        description: gt.description,
        fields,
        lineItemAccuracy,
        overallAccuracy,
        confidence: result.confidence,
        durationMs,
        inputTokens,
        outputTokens,
      });
    } catch (err) {
      console.error(`   ❌ FAILED:`, err);
      results.push({
        filename: gt.filename,
        description: gt.description,
        fields: [],
        lineItemAccuracy: 0,
        overallAccuracy: 0,
        confidence: "error",
        durationMs: 0,
        inputTokens: 0,
        outputTokens: 0,
      });
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────

  console.log(`\n\n${"█".repeat(60)}`);
  console.log("  EXTRACTION ACCURACY SUMMARY");
  console.log(`${"█".repeat(60)}\n`);

  // Per-invoice table
  console.log("Invoice Results:");
  console.log("─".repeat(90));
  console.log(
    "File".padEnd(35) +
      "Overall".padEnd(10) +
      "Headers".padEnd(10) +
      "Lines".padEnd(10) +
      "Conf".padEnd(8) +
      "Time".padEnd(8) +
      "Tokens"
  );
  console.log("─".repeat(90));

  let totalAccuracy = 0;
  let totalDuration = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  for (const r of results) {
    const headerAcc =
      r.fields.length > 0
        ? ((r.fields.filter((f) => f.match).length / r.fields.length) * 100).toFixed(0) + "%"
        : "ERR";
    const lineAcc = (r.lineItemAccuracy * 100).toFixed(0) + "%";
    const overall = (r.overallAccuracy * 100).toFixed(0) + "%";
    const tokens = `${r.inputTokens}/${r.outputTokens}`;

    console.log(
      r.filename.padEnd(35) +
        overall.padEnd(10) +
        headerAcc.padEnd(10) +
        lineAcc.padEnd(10) +
        r.confidence.padEnd(8) +
        `${r.durationMs}ms`.padEnd(8) +
        tokens
    );

    totalAccuracy += r.overallAccuracy;
    totalDuration += r.durationMs;
    totalInputTokens += r.inputTokens;
    totalOutputTokens += r.outputTokens;
  }

  console.log("─".repeat(90));
  const avgAccuracy = results.length > 0 ? totalAccuracy / results.length : 0;
  const avgDuration = results.length > 0 ? totalDuration / results.length : 0;
  console.log(
    `AVERAGE`.padEnd(35) +
      `${(avgAccuracy * 100).toFixed(0)}%`.padEnd(10) +
      "".padEnd(10) +
      "".padEnd(10) +
      "".padEnd(8) +
      `${Math.round(avgDuration)}ms`
  );

  // Per-field accuracy
  console.log(`\n\nPer-Field Accuracy:`);
  console.log("─".repeat(50));
  for (const [field, stats] of Object.entries(fieldStats)) {
    const pct = ((stats.correct / stats.total) * 100).toFixed(0);
    const bar = "█".repeat(Math.round(stats.correct / stats.total * 20));
    console.log(`  ${field.padEnd(20)} ${pct}% ${bar} (${stats.correct}/${stats.total})`);
  }

  // Cost estimate
  console.log(`\n\nCost Estimate:`);
  console.log("─".repeat(50));
  // Claude Sonnet pricing: $3/M input, $15/M output (approximate)
  const inputCost = (totalInputTokens / 1_000_000) * 3;
  const outputCost = (totalOutputTokens / 1_000_000) * 15;
  const totalCost = inputCost + outputCost;
  const perInvoiceCost = results.length > 0 ? totalCost / results.length : 0;
  console.log(`  Total tokens:     ${totalInputTokens} input / ${totalOutputTokens} output`);
  console.log(`  Total cost:       $${totalCost.toFixed(4)}`);
  console.log(`  Per invoice:      $${perInvoiceCost.toFixed(4)}`);
  console.log(`  At 100 inv/mo:    $${(perInvoiceCost * 100).toFixed(2)}/month`);
  console.log(`  Avg response:     ${Math.round(avgDuration)}ms`);

  // Write results JSON for future reference
  const resultsPath = path.join(FIXTURES_DIR, "extraction-results.json");
  fs.writeFileSync(
    resultsPath,
    JSON.stringify(
      {
        model: MODEL,
        timestamp: new Date().toISOString(),
        prompt: EXTRACTION_PROMPT,
        results,
        summary: {
          averageAccuracy: avgAccuracy,
          averageDurationMs: avgDuration,
          totalInputTokens,
          totalOutputTokens,
          estimatedCostPerInvoice: perInvoiceCost,
          fieldStats,
        },
      },
      null,
      2
    )
  );
  console.log(`\n📁 Full results saved to ${resultsPath}`);

  // Pass/fail gate
  const TARGET = 0.8;
  if (avgAccuracy >= TARGET) {
    console.log(`\n✅ PASS — Average accuracy ${(avgAccuracy * 100).toFixed(0)}% >= ${TARGET * 100}% target`);
  } else {
    console.log(`\n⚠️  BELOW TARGET — Average accuracy ${(avgAccuracy * 100).toFixed(0)}% < ${TARGET * 100}% target`);
    console.log("   Prompt iteration needed. Review per-field failures above.");
  }
}

main();
