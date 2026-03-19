# DOC-78: AI-Inferred GL Account Suggestions — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the extraction step to suggest GL accounts for each line item by passing the user's QBO chart of accounts to Claude, then display suggestions in the review UI as highlighted recommendations that the user must explicitly confirm.

**Architecture:** The extraction pipeline gains an optional `ExtractionContext` parameter carrying QBO expense accounts. Claude's prompt is extended to return a `suggested_gl_account_id` per line item. Suggestions are stored separately from the actual `gl_account_id` (which stays null until user confirms). The review UI shows an "AI suggests" label + highlighted first option in the dropdown. Selecting any account sets both `gl_account_id` and `is_user_confirmed = true` atomically via the existing PATCH endpoint.

**Tech Stack:** Next.js 14, Supabase Postgres, Claude Vision API, Tailwind CSS, Vitest

**Spec:** `docs/superpowers/specs/2026-03-18-gl-account-suggestions-design.md`

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `supabase/migrations/20260319100000_add_gl_suggestions.sql` | Add 3 columns to `extracted_line_items` |
| Modify | `lib/extraction/types.ts` | Add `ExtractionContext`, update `ExtractionProvider`, `ExtractedLineItem`, `ExtractedLineItemRow` |
| Modify | `lib/types/invoice.ts` | Add 3 fields to UI `ExtractedLineItemRow` |
| Modify | `lib/extraction/provider.ts` | Pass `context` through factory |
| Modify | `lib/extraction/claude.ts` | Extend prompt with account list, parse `suggested_gl_account_id` from response |
| Modify | `lib/extraction/mapper.ts` | Map suggestion fields in `mapToLineItemRows` |
| Modify | `lib/extraction/run.ts` | Fetch QBO accounts before extraction, validate suggestions, pass context |
| Modify | `lib/extraction/data.ts` | Update selects, inserts, `updateLineItemField` atomic confirmation |
| Modify | `app/api/invoices/[id]/line-items/[itemId]/route.ts` | Pass `is_user_confirmed` through on GL updates |
| Modify | `components/invoices/GlAccountSelect.tsx` | Add suggestion display (label + highlighted option + AI badge) |
| Modify | `components/invoices/line-items-reducer.ts` | Add suggestion fields to `LineItemValues`, `extractValues`, `ADD_ITEM` |
| Modify | `components/invoices/LineItemEditor.tsx` | Pass suggestion props, update missing GL count logic |
| Modify | `lib/extraction/claude.test.ts` | Test prompt with/without accounts, parse suggestions |
| Modify | `lib/extraction/mapper.test.ts` | Test suggestion field mapping |
| Modify | `lib/extraction/run.test.ts` | Test account fetch, validation, graceful degradation |
| Modify | `lib/extraction/data.test.ts` | Test atomic gl_account_id + is_user_confirmed update |
| Modify | `app/api/invoices/[id]/line-items/[itemId]/route.test.ts` | Test PATCH with GL confirmation behavior |
| Modify | `components/invoices/GlAccountSelect.test.tsx` | Test suggestion UI states |

---

## Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/20260319100000_add_gl_suggestions.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Add GL suggestion columns to extracted_line_items
ALTER TABLE extracted_line_items
  ADD COLUMN suggested_gl_account_id TEXT,
  ADD COLUMN gl_suggestion_source TEXT CHECK (gl_suggestion_source IN ('ai', 'history')),
  ADD COLUMN is_user_confirmed BOOLEAN DEFAULT false;

-- Comment for clarity
COMMENT ON COLUMN extracted_line_items.suggested_gl_account_id IS 'AI or history-suggested GL account ID. Stored separately from gl_account_id — never auto-copied.';
COMMENT ON COLUMN extracted_line_items.gl_suggestion_source IS 'Source of suggestion: ai (DOC-78) or history (DOC-79). Null if no suggestion.';
COMMENT ON COLUMN extracted_line_items.is_user_confirmed IS 'True when user has explicitly selected a GL account from dropdown.';
```

- [ ] **Step 2: Apply migration to Supabase**

Run: `npx supabase db push`
Expected: Migration applies successfully. Three new nullable columns on `extracted_line_items`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260319100000_add_gl_suggestions.sql
git commit -m "feat: add GL suggestion columns to extracted_line_items (DOC-78)"
```

---

## Task 2: Type Definitions

**Files:**
- Modify: `lib/extraction/types.ts`
- Modify: `lib/types/invoice.ts`

- [ ] **Step 1: Update `lib/extraction/types.ts` — add `ExtractionContext` and update interfaces**

Add `ExtractionContext` interface after the existing `ExtractionResult` interface (after line 29):

```typescript
export interface ExtractionContext {
  accounts?: Array<{ id: string; name: string }>;
}
```

Update `ExtractionProvider` interface (line 31-36) to add optional `context` parameter:

```typescript
export interface ExtractionProvider {
  extractInvoiceData(
    fileBuffer: Buffer,
    mimeType: string,
    context?: ExtractionContext
  ): Promise<ExtractionResult>;
}
```

Add `suggestedGlAccountId` to `ExtractedLineItem` (line 1-7):

```typescript
export interface ExtractedLineItem {
  description: string | null;
  quantity: number | null;
  unitPrice: number | null;
  amount: number | null;
  sortOrder: number;
  suggestedGlAccountId: string | null;
}
```

Add 3 columns to `ExtractedLineItemRow` (line 58-66):

```typescript
export interface ExtractedLineItemRow {
  extracted_data_id: string;
  description: string | null;
  quantity: number | null;
  unit_price: number | null;
  amount: number | null;
  gl_account_id: string | null;
  sort_order: number;
  suggested_gl_account_id: string | null;
  gl_suggestion_source: string | null;
  is_user_confirmed: boolean;
}
```

- [ ] **Step 2: Update `lib/types/invoice.ts` — add 3 fields to UI `ExtractedLineItemRow`**

Update the `ExtractedLineItemRow` interface (lines 9-17):

```typescript
export interface ExtractedLineItemRow {
  id: string;
  description: string | null;
  quantity: number | null;
  unit_price: number | null;
  amount: number | null;
  gl_account_id: string | null;
  sort_order: number;
  suggested_gl_account_id: string | null;
  gl_suggestion_source: string | null;
  is_user_confirmed: boolean;
}
```

- [ ] **Step 3: Verify types compile**

Run: `npx tsc --noEmit`
Expected: Type errors in `claude.ts` (signature mismatch) and possibly `mapper.ts` (missing fields). These are expected — we fix them in subsequent tasks.

- [ ] **Step 4: Commit**

```bash
git add lib/extraction/types.ts lib/types/invoice.ts
git commit -m "feat: add GL suggestion types and ExtractionContext interface (DOC-78)"
```

---

## Task 3: Claude Provider — Prompt Extension & Response Parsing

**Files:**
- Modify: `lib/extraction/claude.ts`
- Modify: `lib/extraction/claude.test.ts`

- [ ] **Step 1: Write the failing tests in `lib/extraction/claude.test.ts`**

Add these tests to the existing test file:

```typescript
describe("GL account suggestions", () => {
  it("includes account list in prompt when context has accounts", async () => {
    // Mock Anthropic to capture the sent messages
    const createSpy = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: JSON.stringify({
        vendor_name: "Acme Corp",
        vendor_address: null,
        invoice_number: "INV-001",
        invoice_date: "2026-03-01",
        due_date: "2026-04-01",
        payment_terms: "Net 30",
        currency: "USD",
        line_items: [{
          description: "Office supplies",
          quantity: 1,
          unit_price: 50.00,
          amount: 50.00,
          suggested_gl_account_id: "84"
        }],
        subtotal: 50.00,
        tax_amount: 0,
        total_amount: 50.00,
        confidence: "high"
      }) }],
    });

    // Replace the mock to capture args
    const provider = new ClaudeExtractionProvider();
    (provider as any).client = { messages: { create: createSpy } };

    const context = {
      accounts: [
        { id: "84", name: "Office Expenses" },
        { id: "85", name: "Shipping & Delivery" },
      ],
    };

    await provider.extractInvoiceData(
      Buffer.from("fake-pdf"),
      "application/pdf",
      context
    );

    const sentMessages = createSpy.mock.calls[0][0].messages[0].content;
    const textBlock = sentMessages.find((b: any) => b.type === "text");
    expect(textBlock.text).toContain("Available expense accounts");
    expect(textBlock.text).toContain('"84"');
    expect(textBlock.text).toContain("Office Expenses");
  });

  it("does not include account section when context is undefined", async () => {
    const createSpy = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: JSON.stringify({
        vendor_name: "Acme Corp",
        vendor_address: null,
        invoice_number: "INV-001",
        invoice_date: "2026-03-01",
        due_date: null,
        payment_terms: null,
        currency: "USD",
        line_items: [{
          description: "Widgets",
          quantity: 10,
          unit_price: 5.00,
          amount: 50.00,
        }],
        subtotal: 50.00,
        tax_amount: 0,
        total_amount: 50.00,
        confidence: "high"
      }) }],
    });

    const provider = new ClaudeExtractionProvider();
    (provider as any).client = { messages: { create: createSpy } };

    await provider.extractInvoiceData(
      Buffer.from("fake-pdf"),
      "application/pdf"
    );

    const sentMessages = createSpy.mock.calls[0][0].messages[0].content;
    const textBlock = sentMessages.find((b: any) => b.type === "text");
    expect(textBlock.text).not.toContain("Available expense accounts");
  });

  it("parses suggested_gl_account_id from AI response into suggestedGlAccountId", async () => {
    const createSpy = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: JSON.stringify({
        vendor_name: "Acme Corp",
        vendor_address: null,
        invoice_number: "INV-001",
        invoice_date: "2026-03-01",
        due_date: null,
        payment_terms: null,
        currency: "USD",
        line_items: [
          { description: "Printer paper", quantity: 2, unit_price: 25.00, amount: 50.00, suggested_gl_account_id: "84" },
          { description: "Custom work", quantity: 1, unit_price: 100.00, amount: 100.00, suggested_gl_account_id: null },
        ],
        subtotal: 150.00,
        tax_amount: 0,
        total_amount: 150.00,
        confidence: "high"
      }) }],
    });

    const provider = new ClaudeExtractionProvider();
    (provider as any).client = { messages: { create: createSpy } };

    const result = await provider.extractInvoiceData(
      Buffer.from("fake-pdf"),
      "application/pdf",
      { accounts: [{ id: "84", name: "Office Expenses" }] }
    );

    expect(result.data.lineItems[0].suggestedGlAccountId).toBe("84");
    expect(result.data.lineItems[1].suggestedGlAccountId).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- lib/extraction/claude.test.ts`
Expected: FAIL — `extractInvoiceData` doesn't accept `context` param yet; `suggestedGlAccountId` not returned.

- [ ] **Step 3: Build the account prompt section in `claude.ts`**

Add a helper function after the existing `EXTRACTION_PROMPT` constant (after line 79):

```typescript
function buildAccountPromptSection(
  accounts: Array<{ id: string; name: string }>
): string {
  const accountList = JSON.stringify(
    accounts.map((a) => ({ id: a.id, name: a.name }))
  );
  return `

Available expense accounts (use ONLY these IDs):
${accountList}

For each line item, also return:
  "suggested_gl_account_id": "string or null — the ID of the most likely expense account from the list above"

Rules for GL account suggestions:
- Match based on the semantic meaning of the line item description to the account name
- Only suggest an account if you are reasonably confident in the match
- Use null if no account is a clear match
- Use the exact ID string from the provided account list`;
}
```

- [ ] **Step 4: Update `extractInvoiceData` to accept context and build prompt**

In `ClaudeExtractionProvider.extractInvoiceData` (line 189), add the `context` parameter:

```typescript
async extractInvoiceData(
  fileBuffer: Buffer,
  mimeType: string,
  context?: ExtractionContext
): Promise<ExtractionResult> {
```

Add the import for `ExtractionContext` at the top of the file.

In the message construction (around line 209), build the prompt text dynamically:

```typescript
let promptText = EXTRACTION_PROMPT;
if (context?.accounts && context.accounts.length > 0) {
  promptText += buildAccountPromptSection(context.accounts);
}
```

Use `promptText` instead of `EXTRACTION_PROMPT` in the messages array text block.

- [ ] **Step 5: Update `AIResponse` interface to include `suggested_gl_account_id`**

In `claude.ts` (lines 81-99), add the new field to the `line_items` array element type:

```typescript
interface AIResponse {
  // ...existing fields...
  line_items: Array<{
    description: string | null;
    quantity: number | null;
    unit_price: number | null;
    amount: number | null;
    suggested_gl_account_id?: string | null;  // NEW — optional since not always present
  }>;
  // ...existing fields...
}
```

- [ ] **Step 6: Update `mapToExtractedInvoice` to parse `suggested_gl_account_id`**

In the `mapToExtractedInvoice` function (line 145-170), update the line item mapping to read from the now-typed `AIResponse`:

```typescript
lineItems: (ai.line_items || []).map((item, index) => ({
  description: item.description || null,
  quantity: item.quantity != null ? Number(item.quantity) : null,
  unitPrice: item.unit_price != null ? Number(item.unit_price) : null,
  amount: item.amount != null ? Number(item.amount) : null,
  sortOrder: index,
  suggestedGlAccountId:
    typeof item.suggested_gl_account_id === "string"
      ? item.suggested_gl_account_id
      : null,
})),
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npm run test -- lib/extraction/claude.test.ts`
Expected: All tests PASS, including the 3 new GL suggestion tests.

- [ ] **Step 8: Commit**

```bash
git add lib/extraction/claude.ts lib/extraction/claude.test.ts
git commit -m "feat: extend Claude prompt with GL account suggestions (DOC-78)"
```

---

## Task 4: Mapper — Map Suggestion Fields

**Files:**
- Modify: `lib/extraction/mapper.ts`
- Modify: `lib/extraction/mapper.test.ts`

- [ ] **Step 1: Write failing tests in `mapper.test.ts`**

Add to the `mapToLineItemRows` test suite:

```typescript
describe("GL suggestion fields", () => {
  it("maps suggestedGlAccountId to suggestion columns", () => {
    const lineItems: ExtractedLineItem[] = [
      {
        description: "Office supplies",
        quantity: 1,
        unitPrice: 50.0,
        amount: 50.0,
        sortOrder: 0,
        suggestedGlAccountId: "84",
      },
    ];

    const rows = mapToLineItemRows(lineItems, "extracted-data-id");

    expect(rows[0].suggested_gl_account_id).toBe("84");
    expect(rows[0].gl_suggestion_source).toBe("ai");
    expect(rows[0].gl_account_id).toBeNull();
    expect(rows[0].is_user_confirmed).toBe(false);
  });

  it("sets suggestion columns to null when no suggestion", () => {
    const lineItems: ExtractedLineItem[] = [
      {
        description: "Custom work",
        quantity: 1,
        unitPrice: 100.0,
        amount: 100.0,
        sortOrder: 0,
        suggestedGlAccountId: null,
      },
    ];

    const rows = mapToLineItemRows(lineItems, "extracted-data-id");

    expect(rows[0].suggested_gl_account_id).toBeNull();
    expect(rows[0].gl_suggestion_source).toBeNull();
    expect(rows[0].gl_account_id).toBeNull();
    expect(rows[0].is_user_confirmed).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- lib/extraction/mapper.test.ts`
Expected: FAIL — `suggestedGlAccountId` not in `ExtractedLineItem` fixtures or mapped.

- [ ] **Step 3: Update `mapToLineItemRows` in `mapper.ts`**

Update the return object in `mapToLineItemRows` (lines 125-150). Add the three new fields:

```typescript
export function mapToLineItemRows(
  lineItems: ExtractedLineItem[],
  extractedDataId: string
): ExtractedLineItemRow[] {
  return lineItems.map((item) => {
    // ... existing quantity normalization logic ...

    return {
      extracted_data_id: extractedDataId,
      description: item.description,
      quantity: normalizedQuantity,
      unit_price:
        item.unitPrice != null ? normalizeMonetary(item.unitPrice) : null,
      amount: item.amount != null ? normalizeMonetary(item.amount) : null,
      gl_account_id: null,
      sort_order: item.sortOrder,
      suggested_gl_account_id: item.suggestedGlAccountId ?? null,
      gl_suggestion_source: item.suggestedGlAccountId ? "ai" : null,
      is_user_confirmed: false,
    };
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- lib/extraction/mapper.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Fix any existing mapper tests that break due to new required fields**

Existing test fixtures for `mapToLineItemRows` may need `suggestedGlAccountId: null` added to input objects. Update as needed.

- [ ] **Step 6: Commit**

```bash
git add lib/extraction/mapper.ts lib/extraction/mapper.test.ts
git commit -m "feat: map GL suggestion fields in line item mapper (DOC-78)"
```

---

## Task 5: Orchestration — Fetch QBO Accounts Before Extraction

**Files:**
- Modify: `lib/extraction/run.ts`
- Modify: `lib/extraction/run.test.ts`

- [ ] **Step 1: Write failing tests in `run.test.ts`**

Add tests for the account-fetching behavior:

```typescript
describe("GL account suggestions in extraction", () => {
  it("fetches QBO accounts and passes them as context to provider", async () => {
    // Mock queryAccounts to return test accounts
    vi.mock("@/lib/quickbooks/api", () => ({
      queryAccounts: vi.fn().mockResolvedValue([
        { Id: "84", Name: "Office Expenses", SubAccount: false, FullyQualifiedName: "Office Expenses" },
        { Id: "85", Name: "Shipping", SubAccount: true, FullyQualifiedName: "Expenses:Shipping" },
      ]),
    }));

    // Mock provider to capture context
    const extractSpy = vi.fn().mockResolvedValue(mockExtractionResult);
    vi.mocked(getExtractionProvider).mockReturnValue({
      extractInvoiceData: extractSpy,
    });

    await runExtraction({
      invoiceId: "inv-1",
      orgId: "org-1",
      userId: "user-1",
      filePath: "invoices/test.pdf",
      fileType: "application/pdf",
    });

    // Verify context was passed with mapped accounts
    const context = extractSpy.mock.calls[0][2];
    expect(context).toBeDefined();
    expect(context.accounts).toEqual([
      { id: "84", name: "Office Expenses" },
      { id: "85", name: "Expenses:Shipping" },
    ]);
  });

  it("proceeds without suggestions when QBO account fetch fails", async () => {
    vi.mock("@/lib/quickbooks/api", () => ({
      queryAccounts: vi.fn().mockRejectedValue(new Error("Token expired")),
    }));

    const extractSpy = vi.fn().mockResolvedValue(mockExtractionResult);
    vi.mocked(getExtractionProvider).mockReturnValue({
      extractInvoiceData: extractSpy,
    });

    await runExtraction({
      invoiceId: "inv-1",
      orgId: "org-1",
      userId: "user-1",
      filePath: "invoices/test.pdf",
      fileType: "application/pdf",
    });

    // Provider called without context
    const context = extractSpy.mock.calls[0][2];
    expect(context).toBeUndefined();
  });

  it("validates suggested account IDs against real account list", async () => {
    vi.mock("@/lib/quickbooks/api", () => ({
      queryAccounts: vi.fn().mockResolvedValue([
        { Id: "84", Name: "Office Expenses", SubAccount: false, FullyQualifiedName: "Office Expenses" },
      ]),
    }));

    // AI returns a hallucinated ID "999" that's not in the account list
    const resultWithBadId = {
      ...mockExtractionResult,
      data: {
        ...mockExtractionResult.data,
        lineItems: [
          { description: "Supplies", quantity: 1, unitPrice: 50, amount: 50, sortOrder: 0, suggestedGlAccountId: "84" },
          { description: "Other", quantity: 1, unitPrice: 25, amount: 25, sortOrder: 1, suggestedGlAccountId: "999" },
        ],
      },
    };

    const extractSpy = vi.fn().mockResolvedValue(resultWithBadId);
    vi.mocked(getExtractionProvider).mockReturnValue({
      extractInvoiceData: extractSpy,
    });

    await runExtraction({
      invoiceId: "inv-1",
      orgId: "org-1",
      userId: "user-1",
      filePath: "invoices/test.pdf",
      fileType: "application/pdf",
    });

    // The validation mutates result.data.lineItems in place before storage.
    // Verify by checking what was passed to mapToLineItemRows (or the Supabase insert).
    // The hallucinated "999" should be nullified in the line items that get stored.
    // Assert on the mock Supabase insert call for extracted_line_items:
    const insertCalls = vi.mocked(admin.from("extracted_line_items").insert);
    const insertedRows = insertCalls.mock.calls[0][0];
    expect(insertedRows[0].suggested_gl_account_id).toBe("84");  // valid
    expect(insertedRows[1].suggested_gl_account_id).toBeNull();   // hallucinated "999" discarded
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- lib/extraction/run.test.ts`
Expected: FAIL — `runExtraction` doesn't fetch accounts or pass context yet.

- [ ] **Step 3: Update `run.ts` — fetch accounts and pass context**

Add imports at the top of `run.ts`:

```typescript
import { queryAccounts } from "@/lib/quickbooks/api";
import type { ExtractionContext } from "./types";
```

After fetching file bytes (around line 32) and before calling the provider (line 35), add:

```typescript
// Fetch QBO accounts for GL suggestions (non-fatal)
// queryAccounts() internally handles connection lookup and token decryption.
// If no QBO connection exists, it throws — the catch block handles it gracefully.
let accountContext: ExtractionContext | undefined;
let validAccountIds: Set<string> | undefined;
try {
  const accounts = await queryAccounts(admin, orgId);
  if (accounts.length > 0) {
    const mappedAccounts = accounts.map((a) => ({
      id: a.Id,
      name: a.SubAccount ? a.FullyQualifiedName : a.Name,
    }));
    accountContext = { accounts: mappedAccounts };
    validAccountIds = new Set(mappedAccounts.map((a) => a.id));
  }
} catch (err) {
  // Non-fatal: no QBO connection, expired token, API error — all handled here.
  // Extraction proceeds without GL suggestions.
  logger.warn("gl_suggestion_accounts_fetch_failed", {
    action: "run_extraction",
    invoiceId,
    orgId,
    error: err instanceof Error ? err.message : String(err),
  });
}
```

Update the provider call to pass context:

```typescript
const result = await provider.extractInvoiceData(fileBuffer, fileType, accountContext);
```

- [ ] **Step 4: Add suggestion validation after extraction, before storage**

After the provider call and before inserting line items, validate suggested IDs:

```typescript
// Validate AI-suggested GL account IDs against real account list
if (validAccountIds && result.data.lineItems.length > 0) {
  for (const item of result.data.lineItems) {
    if (
      item.suggestedGlAccountId &&
      !validAccountIds.has(item.suggestedGlAccountId)
    ) {
      logger.warn("gl_suggestion_invalid_id_discarded", {
        action: "run_extraction",
        invoiceId,
        orgId,
        suggestedId: item.suggestedGlAccountId,
      });
      item.suggestedGlAccountId = null;
    }
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run test -- lib/extraction/run.test.ts`
Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/extraction/run.ts lib/extraction/run.test.ts
git commit -m "feat: fetch QBO accounts and validate GL suggestions in extraction (DOC-78)"
```

---

## Task 6: Data Layer — Update Queries and Atomic Confirmation

**Files:**
- Modify: `lib/extraction/data.ts`
- Modify: `lib/extraction/data.test.ts`

- [ ] **Step 1: Write failing tests for atomic GL confirmation**

Add to `data.test.ts`:

```typescript
describe("updateLineItemField GL confirmation", () => {
  it("sets is_user_confirmed=true when gl_account_id is set to non-null", async () => {
    const mockUpdate = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: {
              id: "item-1",
              gl_account_id: "84",
              is_user_confirmed: true,
              // ...other fields
            },
            error: null,
          }),
        }),
      }),
    });

    vi.mocked(createServerClient).mockReturnValue({
      from: vi.fn().mockReturnValue({ update: mockUpdate }),
    } as any);

    await updateLineItemField("item-1", "gl_account_id", "84");

    // Verify update was called with both fields
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        gl_account_id: "84",
        is_user_confirmed: true,
      })
    );
  });

  it("sets is_user_confirmed=false when gl_account_id is cleared", async () => {
    const mockUpdate = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: {
              id: "item-1",
              gl_account_id: null,
              is_user_confirmed: false,
            },
            error: null,
          }),
        }),
      }),
    });

    vi.mocked(createServerClient).mockReturnValue({
      from: vi.fn().mockReturnValue({ update: mockUpdate }),
    } as any);

    await updateLineItemField("item-1", "gl_account_id", null);

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        gl_account_id: null,
        is_user_confirmed: false,
      })
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- lib/extraction/data.test.ts`
Expected: FAIL — `updateLineItemField` currently updates a single field, not atomically.

- [ ] **Step 3: Update `getExtractedData` select to include new columns**

In `getExtractedData` (lines 24-53), update the select for `extracted_line_items`:

```typescript
.select(`
  *,
  extracted_line_items (
    id, description, quantity, unit_price, amount,
    gl_account_id, sort_order,
    suggested_gl_account_id, gl_suggestion_source, is_user_confirmed
  )
`)
```

- [ ] **Step 4: Update `createLineItem` to include new columns**

In `createLineItem` (lines 134-171), update the insert object to include defaults:

```typescript
.insert({
  extracted_data_id: extractedDataId,
  sort_order: nextSortOrder,
  description: null,
  quantity: null,
  unit_price: null,
  amount: null,
  gl_account_id: null,
  suggested_gl_account_id: null,
  gl_suggestion_source: null,
  is_user_confirmed: false,
})
```

Update the `.select()` to return all columns:

```typescript
.select(
  "id, description, quantity, unit_price, amount, gl_account_id, sort_order, suggested_gl_account_id, gl_suggestion_source, is_user_confirmed"
)
```

- [ ] **Step 5: Update `updateLineItemField` for atomic GL confirmation**

Modify `updateLineItemField` (lines 173-202) to atomically set `is_user_confirmed` when `gl_account_id` changes. **Preserve the existing return signature** (`data | null`) to avoid breaking the PATCH route and frontend callers:

```typescript
export async function updateLineItemField(
  itemId: string,
  field: string,
  value: string | number | null
) {
  if (!LINE_ITEM_EDITABLE_FIELDS.has(field)) {
    throw new Error(`Field '${field}' is not editable on line items`);
  }

  const supabase = createClient();

  // Atomic GL confirmation: setting gl_account_id also sets is_user_confirmed
  // is_user_confirmed is NOT in LINE_ITEM_EDITABLE_FIELDS — it can only be set
  // as a side effect of gl_account_id changes, never independently by the client.
  const updateObj: Record<string, unknown> =
    field === "gl_account_id"
      ? { gl_account_id: value, is_user_confirmed: value != null }
      : { [field]: value };

  const { data, error } = await supabase
    .from("extracted_line_items")
    .update(updateObj)
    .eq("id", itemId)
    .select(
      "id, description, quantity, unit_price, amount, gl_account_id, sort_order, suggested_gl_account_id, gl_suggestion_source, is_user_confirmed"
    )
    .single();

  if (error || !data) {
    logger.error("update_line_item_field_failed", {
      itemId,
      field,
      error: error?.message ?? "unknown",
      status: "error",
    });
    return null;
  }

  return data;
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm run test -- lib/extraction/data.test.ts`
Expected: All tests PASS.

- [ ] **Step 7: Run full test suite to check for regressions**

Run: `npm run test`
Expected: All existing tests still pass. Any failures from new required fields in fixtures should be fixed.

- [ ] **Step 8: Commit**

```bash
git add lib/extraction/data.ts lib/extraction/data.test.ts
git commit -m "feat: atomic GL confirmation and updated queries (DOC-78)"
```

---

## Task 7: Provider Factory — Pass Context Through

**Files:**
- Modify: `lib/extraction/provider.ts`

- [ ] **Step 1: Verify `provider.ts` needs no changes**

The factory function `getExtractionProvider()` returns a `ClaudeExtractionProvider` instance. The `context` parameter is passed at call time to `extractInvoiceData()`, not at construction time. The factory signature does not change. Verify by reading `provider.ts` — if it only constructs and returns the provider, no changes needed.

- [ ] **Step 2: Run type check to confirm**

Run: `npx tsc --noEmit`
Expected: No type errors related to `provider.ts`.

---

## Task 8: Frontend — GlAccountSelect Suggestion Display

**Files:**
- Modify: `components/invoices/GlAccountSelect.tsx`
- Create or modify: `components/invoices/GlAccountSelect.test.tsx`

- [ ] **Step 1: Write failing component tests**

Create or update `components/invoices/GlAccountSelect.test.tsx`:

```typescript
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import GlAccountSelect from "./GlAccountSelect";

const mockAccounts = [
  { value: "84", label: "Office Expenses", accountType: "Expense" },
  { value: "85", label: "Shipping & Delivery", accountType: "Expense" },
  { value: "86", label: "Utilities", accountType: "Expense" },
];

describe("GlAccountSelect suggestion display", () => {
  it("shows AI suggestion label when suggestedAccountId is provided and no current selection", () => {
    render(
      <GlAccountSelect
        accounts={mockAccounts}
        loading={false}
        connected={true}
        currentAccountId={null}
        onSelect={vi.fn().mockResolvedValue(true)}
        suggestedAccountId="84"
        suggestionSource="ai"
      />
    );

    expect(screen.getByText(/AI suggests/i)).toBeInTheDocument();
    expect(screen.getByText(/Office Expenses/i)).toBeInTheDocument();
  });

  it("does not show suggestion label when no suggestion", () => {
    render(
      <GlAccountSelect
        accounts={mockAccounts}
        loading={false}
        connected={true}
        currentAccountId={null}
        onSelect={vi.fn().mockResolvedValue(true)}
      />
    );

    expect(screen.queryByText(/AI suggests/i)).not.toBeInTheDocument();
  });

  it("hides suggestion label after user selects an account", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn().mockResolvedValue(true);

    render(
      <GlAccountSelect
        accounts={mockAccounts}
        loading={false}
        connected={true}
        currentAccountId={null}
        onSelect={onSelect}
        suggestedAccountId="84"
        suggestionSource="ai"
      />
    );

    // Select an account
    const select = screen.getByRole("combobox");
    await user.selectOptions(select, "84");

    expect(onSelect).toHaveBeenCalledWith("84");
  });

  it("does not show suggestion label when account is already confirmed", () => {
    render(
      <GlAccountSelect
        accounts={mockAccounts}
        loading={false}
        connected={true}
        currentAccountId="84"
        onSelect={vi.fn().mockResolvedValue(true)}
        suggestedAccountId="84"
        suggestionSource="ai"
      />
    );

    // Suggestion label should not show when already confirmed (currentAccountId is set)
    expect(screen.queryByText(/AI suggests/i)).not.toBeInTheDocument();
  });

  it("shows suggested account as first option in dropdown with AI tag", () => {
    render(
      <GlAccountSelect
        accounts={mockAccounts}
        loading={false}
        connected={true}
        currentAccountId={null}
        onSelect={vi.fn().mockResolvedValue(true)}
        suggestedAccountId="84"
        suggestionSource="ai"
      />
    );

    const options = screen.getAllByRole("option");
    // First option is placeholder, second should be the suggested one
    expect(options[1].textContent).toContain("Office Expenses");
    expect(options[1].textContent).toContain("AI");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- components/invoices/GlAccountSelect.test.tsx`
Expected: FAIL — component doesn't accept or render suggestion props yet.

- [ ] **Step 3: Update `GlAccountSelect.tsx` with suggestion support (incremental modification)**

**Preserve existing patterns:** Keep `useRef` for timer, `useCallback` for `handleChange`, `STATUS_BORDER` record with design token classes, and all existing Tailwind classes. Only add the new suggestion props and rendering.

Add new props to the interface (lines 6-13):

```typescript
interface GlAccountSelectProps {
  accounts: AccountOption[];
  loading: boolean;
  connected: boolean;
  currentAccountId: string | null;
  onSelect: (accountId: string | null) => Promise<boolean>;
  disabled?: boolean;
  suggestedAccountId?: string | null;
  suggestionSource?: "ai" | "history" | null;
}
```

Add destructured props (line 22-29):

```typescript
  suggestedAccountId,
  suggestionSource,
```

Add suggestion logic before the `return` block (before line 69):

```typescript
  // Determine if we should show the suggestion
  const showSuggestion =
    suggestedAccountId && !currentAccountId && suggestionSource;
  const suggestedAccount = showSuggestion
    ? accounts.find((a) => a.value === suggestedAccountId)
    : null;

  // Build ordered account list: suggested first (if applicable), then rest alphabetically
  const orderedAccounts = suggestedAccount
    ? [suggestedAccount, ...accounts.filter((a) => a.value !== suggestedAccountId)]
    : accounts;
```

Wrap the existing `<div className={STATUS_BORDER[saveStatus]}>` in an outer flex container and update the account list rendering:

```typescript
  return (
    <div className="flex flex-col gap-1">
      <div className={STATUS_BORDER[saveStatus]}>
        <select
          className="w-full border border-border rounded-md px-2 py-1.5 text-sm focus:outline-none focus-visible:ring-[3px] focus-visible:ring-[#BFDBFE] focus:border-primary bg-white"
          value={currentAccountId ?? ""}
          onChange={handleChange}
          disabled={disabled || accounts.length === 0}
          title={accounts.length === 0 ? "No expense accounts found in QuickBooks" : undefined}
        >
          <option value="">Select account...</option>
          {orderedAccounts.map((a) => (
            <option key={a.value} value={a.value}>
              {a.value === suggestedAccountId && showSuggestion
                ? `AI · ${a.label}`
                : a.label}
            </option>
          ))}
        </select>
      </div>
      {suggestedAccount && showSuggestion && (
        <span className="text-xs text-blue-600 flex items-center gap-1">
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-700">
            AI
          </span>
          suggests: {suggestedAccount.label}
        </span>
      )}
    </div>
  );
```

**Note:** No emoji characters in `<option>` text — use text "AI" prefix only per CLAUDE.md guidelines.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- components/invoices/GlAccountSelect.test.tsx`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add components/invoices/GlAccountSelect.tsx components/invoices/GlAccountSelect.test.tsx
git commit -m "feat: add AI suggestion display to GlAccountSelect (DOC-78)"
```

---

## Task 9: Frontend — Line Items Reducer Update

**Files:**
- Modify: `components/invoices/line-items-reducer.ts`

The `LineItemValues` interface and `extractValues()` function currently only include 5 editable fields. The suggestion fields must flow through the reducer so `LineItemEditor` can access them via `item.values`.

- [ ] **Step 1: Add suggestion fields to `LineItemValues` interface (line 5-11)**

```typescript
export interface LineItemValues {
  description: string | null;
  quantity: number | null;
  unit_price: number | null;
  amount: number | null;
  gl_account_id: string | null;
  suggested_gl_account_id: string | null;
  gl_suggestion_source: string | null;
  is_user_confirmed: boolean;
}
```

- [ ] **Step 2: Update `extractValues` to copy the new fields (line 33-41)**

```typescript
function extractValues(item: ExtractedLineItemRow): LineItemValues {
  return {
    description: item.description,
    quantity: item.quantity,
    unit_price: item.unit_price,
    amount: item.amount,
    gl_account_id: item.gl_account_id,
    suggested_gl_account_id: item.suggested_gl_account_id,
    gl_suggestion_source: item.gl_suggestion_source,
    is_user_confirmed: item.is_user_confirmed,
  };
}
```

- [ ] **Step 3: Update `ADD_ITEM` empty values (line 127-133)**

```typescript
const emptyValues: LineItemValues = {
  description: null,
  quantity: null,
  unit_price: null,
  amount: null,
  gl_account_id: null,
  suggested_gl_account_id: null,
  gl_suggestion_source: null,
  is_user_confirmed: false,
};
```

Note: `LINE_ITEM_FIELDS` (line 28) drives field status tracking for the 5 editable fields. The suggestion fields are read-only in the UI and do NOT need to be added to `LINE_ITEM_FIELDS` — they don't have save status or validation.

- [ ] **Step 4: Verify types compile**

Run: `npx tsc --noEmit`
Expected: No type errors. `item.values.suggested_gl_account_id` now resolves correctly.

- [ ] **Step 5: Commit**

```bash
git add components/invoices/line-items-reducer.ts
git commit -m "feat: add GL suggestion fields to line items reducer (DOC-78)"
```

---

## Task 10: Frontend — LineItemEditor Wiring

**Files:**
- Modify: `components/invoices/LineItemEditor.tsx`

- [ ] **Step 1: Update `LineItemEditor` to pass suggestion props to `GlAccountSelect`**

In the rendering section (around lines 412-419), update the `GlAccountSelect` usage to pass suggestion props:

```typescript
<GlAccountSelect
  accounts={accounts}
  loading={accountsLoading}
  connected={qboConnected}
  currentAccountId={item.values.gl_account_id}
  onSelect={(accountId) =>
    handleGlAccountSelect(item.id, accountId)
  }
  disabled={disabled}
  suggestedAccountId={item.values.suggested_gl_account_id}
  suggestionSource={item.values.gl_suggestion_source as "ai" | "history" | null}
/>
```

- [ ] **Step 2: Verify the line item state includes the new fields**

Check that the `lineItemsReducer` and initial state setup in `LineItemEditor` carry through the new fields from `ExtractedLineItemRow`. The reducer uses `item.values` which should include all fields from the DB row. If the reducer initializes `values` from the prop `lineItems`, and `lineItems` now has the new fields, they should flow through automatically.

If the reducer strips fields, update the initialization to include `suggested_gl_account_id`, `gl_suggestion_source`, and `is_user_confirmed`.

- [ ] **Step 3: Update missing GL count calculation**

The current missing GL count (in `handleGlAccountSelect` and `handleAdd`) counts items where `gl_account_id` is null. This already works correctly for the confirmation-required model — unconfirmed suggestions have `gl_account_id = null`, so they're counted as "missing." No change needed here.

Verify by reading the existing count logic and confirming it checks `gl_account_id`, not `suggested_gl_account_id`.

- [ ] **Step 4: Run the full test suite**

Run: `npm run test`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add components/invoices/LineItemEditor.tsx
git commit -m "feat: wire GL suggestion props through LineItemEditor (DOC-78)"
```

---

## Task 11: Integration Verification

- [ ] **Step 1: Run full test suite**

Run: `npm run test`
Expected: All tests PASS with no failures.

- [ ] **Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: Zero type errors.

- [ ] **Step 3: Run linter**

Run: `npm run lint`
Expected: Zero warnings, zero errors.

- [ ] **Step 4: Run production build**

Run: `npm run build`
Expected: Build succeeds with no errors.

- [ ] **Step 5: Commit any remaining fixes**

If any of the above checks revealed issues, fix and commit:

```bash
git add -A
git commit -m "fix: address lint/type/build issues for GL suggestions (DOC-78)"
```

---

## Task 12: Status Report & PR

- [ ] **Step 1: Write status report**

Deliver the status report in the required format per CLAUDE.md.

- [ ] **Step 2: Push branch and create PR**

```bash
git push -u origin feature/DOC-78-gl-account-suggestions
gh pr create --title "feat: AI-inferred GL account suggestions (DOC-78)" --body "$(cat <<'EOF'
## Summary
- Extends extraction to suggest GL accounts by passing QBO chart of accounts to Claude
- Suggestions stored separately (suggested_gl_account_id) — require explicit user confirmation
- Review UI shows "AI suggests" label with highlighted first option in dropdown
- Atomic confirmation: selecting any account sets gl_account_id + is_user_confirmed together

## Test plan
- [ ] Upload invoice with QBO connected → extraction returns GL suggestions
- [ ] Upload invoice without QBO connected → extraction succeeds normally, no suggestions
- [ ] Review page shows "AI suggests: [Account]" label for unconfirmed line items
- [ ] Selecting the AI suggestion confirms it (badge disappears, gl_account_id set)
- [ ] Selecting a different account overrides suggestion (badge disappears)
- [ ] Unconfirmed suggestions count as "missing GL" for sync gating
- [ ] All existing tests pass

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Wait for Joe's review before merge**
