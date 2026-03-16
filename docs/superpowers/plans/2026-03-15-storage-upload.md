# DOC-13: Supabase Storage Upload — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the server-side upload pipeline connecting the UploadZone UI to Supabase Storage with server-side validation, invoice row creation, and signed URL generation.

**Architecture:** Single API route (`POST /api/invoices/upload`) handles auth, org lookup, magic-byte validation, storage upload, DB insert, and signed URL generation. Validation logic is extracted to `lib/upload/validate.ts` for testability. Admin client for storage ops, server client for auth.

**Tech Stack:** Next.js 14 API routes, Supabase Storage, Supabase Postgres, Vitest + MSW

**Spec:** `docs/superpowers/specs/2026-03-15-storage-upload-design.md`

---

## Chunk 1: Magic Byte Validation

### Task 1: File validation utility

**Files:**
- Create: `lib/upload/validate.ts`
- Create: `lib/upload/validate.test.ts`

- [ ] **Step 1: Write failing tests for magic byte validation**

Create `lib/upload/validate.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { validateFileMagicBytes, validateFileSize } from "./validate";

// Helper to create a Buffer with specific leading bytes
function makeBuffer(hexBytes: string, totalSize = 64): Buffer {
  const header = Buffer.from(hexBytes, "hex");
  const padding = Buffer.alloc(totalSize - header.length);
  return Buffer.concat([header, padding]);
}

describe("validateFileMagicBytes", () => {
  it("accepts valid PDF (starts with %PDF / 25504446)", () => {
    const buf = makeBuffer("255044462d312e34"); // %PDF-1.4
    expect(validateFileMagicBytes(buf, "application/pdf")).toEqual({
      valid: true,
      detectedType: "application/pdf",
    });
  });

  it("accepts valid JPEG (starts with FF D8 FF)", () => {
    const buf = makeBuffer("ffd8ffe0");
    expect(validateFileMagicBytes(buf, "image/jpeg")).toEqual({
      valid: true,
      detectedType: "image/jpeg",
    });
  });

  it("accepts valid PNG (starts with 89504E47)", () => {
    const buf = makeBuffer("89504e470d0a1a0a");
    expect(validateFileMagicBytes(buf, "image/png")).toEqual({
      valid: true,
      detectedType: "image/png",
    });
  });

  it("rejects PDF with wrong magic bytes", () => {
    const buf = makeBuffer("ffd8ffe0"); // JPEG bytes
    const result = validateFileMagicBytes(buf, "application/pdf");
    expect(result.valid).toBe(false);
  });

  it("rejects completely unknown magic bytes", () => {
    const buf = makeBuffer("0000000000");
    const result = validateFileMagicBytes(buf, "application/pdf");
    expect(result.valid).toBe(false);
  });

  it("rejects empty buffer", () => {
    const buf = Buffer.alloc(0);
    const result = validateFileMagicBytes(buf, "application/pdf");
    expect(result.valid).toBe(false);
  });

  it("rejects unsupported claimed type", () => {
    const buf = makeBuffer("255044462d312e34");
    const result = validateFileMagicBytes(buf, "application/zip");
    expect(result.valid).toBe(false);
  });
});

describe("validateFileSize", () => {
  it("accepts file under 10MB", () => {
    expect(validateFileSize(5 * 1024 * 1024)).toBe(true);
  });

  it("accepts file exactly 10MB", () => {
    expect(validateFileSize(10 * 1024 * 1024)).toBe(true);
  });

  it("rejects file over 10MB", () => {
    expect(validateFileSize(10 * 1024 * 1024 + 1)).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/upload/validate.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement validation utility**

Create `lib/upload/validate.ts`:

```typescript
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

type SupportedMimeType = "application/pdf" | "image/jpeg" | "image/png";

interface MagicByteSignature {
  bytes: number[];
  mimeType: SupportedMimeType;
}

const SIGNATURES: MagicByteSignature[] = [
  { bytes: [0x25, 0x50, 0x44, 0x46], mimeType: "application/pdf" },  // %PDF
  { bytes: [0xff, 0xd8, 0xff], mimeType: "image/jpeg" },             // JPEG
  { bytes: [0x89, 0x50, 0x4e, 0x47], mimeType: "image/png" },        // PNG
];

const SUPPORTED_TYPES = new Set<string>(
  SIGNATURES.map((s) => s.mimeType)
);

interface ValidationResult {
  valid: boolean;
  detectedType?: string;
  error?: string;
}

export function validateFileMagicBytes(
  buffer: Buffer,
  claimedType: string
): ValidationResult {
  if (!SUPPORTED_TYPES.has(claimedType)) {
    return { valid: false, error: "Unsupported file type." };
  }

  if (buffer.length === 0) {
    return { valid: false, error: "File is empty." };
  }

  for (const sig of SIGNATURES) {
    if (buffer.length < sig.bytes.length) continue;
    const match = sig.bytes.every((byte, i) => buffer[i] === byte);
    if (match) {
      if (sig.mimeType === claimedType) {
        return { valid: true, detectedType: sig.mimeType };
      }
      return {
        valid: false,
        error: `File content does not match claimed type. Detected: ${sig.mimeType}, claimed: ${claimedType}`,
      };
    }
  }

  return { valid: false, error: "File content does not match expected type." };
}

export function validateFileSize(sizeBytes: number): boolean {
  return sizeBytes <= MAX_FILE_SIZE;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/upload/validate.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add lib/upload/validate.ts lib/upload/validate.test.ts
git commit -m "feat: add magic byte file validation for uploads (DOC-13)"
```

---

## Chunk 2: Upload API Route

### Task 2a: Add `forbiddenError` helper

**Files:**
- Modify: `lib/utils/errors.ts`

- [ ] **Step 1: Add `forbiddenError` to errors.ts**

Add after the `authError` function in `lib/utils/errors.ts`:

```typescript
export function forbiddenError(message = "Forbidden") {
  return apiError({ error: message, code: "AUTH_ERROR", status: 403 });
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/utils/errors.ts
git commit -m "feat: add forbiddenError helper for 403 responses (DOC-13)"
```

### Task 2b: Upload API route implementation

**Files:**
- Modify: `app/api/invoices/upload/route.ts` (replace 501 stub)
- Create: `app/api/invoices/upload/route.test.ts`

- [ ] **Step 1: Write failing tests for the upload API route**

Create `app/api/invoices/upload/route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./route";

// --- Mocks ---

// Mock server client (for auth + org lookup)
const mockGetUser = vi.fn();
const mockFrom = vi.fn();
const mockServerClient = {
  auth: { getUser: mockGetUser },
  from: vi.fn(() => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        single: mockFrom,
      })),
    })),
  })),
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => mockServerClient,
}));

// Mock admin client (for storage + DB writes)
const mockStorageUpload = vi.fn();
const mockCreateSignedUrl = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockAdminClient = {
  storage: {
    from: vi.fn(() => ({
      upload: mockStorageUpload,
      createSignedUrl: mockCreateSignedUrl,
    })),
  },
  from: vi.fn((table: string) => {
    if (table === "invoices") {
      return {
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: mockInsert,
          })),
        })),
        update: vi.fn(() => ({
          eq: mockUpdate,
        })),
      };
    }
    return {};
  }),
};

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => mockAdminClient,
}));

vi.mock("@/lib/upload/validate", () => ({
  validateFileMagicBytes: vi.fn(() => ({
    valid: true,
    detectedType: "application/pdf",
  })),
  validateFileSize: vi.fn(() => true),
}));

// Helper: create a mock Request with FormData
function createUploadRequest(
  file?: { name: string; type: string; content: Buffer }
): Request {
  const formData = new FormData();
  if (file) {
    const blob = new Blob([file.content], { type: file.type });
    formData.append("file", blob, file.name);
  }
  return new Request("http://localhost/api/invoices/upload", {
    method: "POST",
    body: formData,
  });
}

describe("POST /api/invoices/upload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when user is not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
    const req = createUploadRequest({
      name: "invoice.pdf",
      type: "application/pdf",
      content: Buffer.from("%PDF-1.4"),
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.code).toBe("AUTH_ERROR");
  });

  it("returns 403 when user has no org membership", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    mockFrom.mockResolvedValue({ data: null, error: { message: "not found" } });

    const req = createUploadRequest({
      name: "invoice.pdf",
      type: "application/pdf",
      content: Buffer.from("%PDF-1.4"),
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error).toContain("No organization found");
  });

  it("returns 400 when no file is provided", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    mockFrom.mockResolvedValue({
      data: { org_id: "org-1" },
      error: null,
    });

    const req = createUploadRequest(); // no file

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 when file size validation fails", async () => {
    const { validateFileSize } = await import("@/lib/upload/validate");
    vi.mocked(validateFileSize).mockReturnValueOnce(false);

    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    mockFrom.mockResolvedValue({
      data: { org_id: "org-1" },
      error: null,
    });

    const req = createUploadRequest({
      name: "huge.pdf",
      type: "application/pdf",
      content: Buffer.from("%PDF-1.4"),
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toContain("10MB");
  });

  it("returns 400 when magic bytes validation fails", async () => {
    const { validateFileMagicBytes } = await import("@/lib/upload/validate");
    vi.mocked(validateFileMagicBytes).mockReturnValueOnce({
      valid: false,
      error: "File content does not match expected type.",
    });

    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    mockFrom.mockResolvedValue({
      data: { org_id: "org-1" },
      error: null,
    });

    const req = createUploadRequest({
      name: "fake.pdf",
      type: "application/pdf",
      content: Buffer.from("not-a-pdf"),
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.code).toBe("VALIDATION_ERROR");
  });

  it("returns 500 when storage upload fails", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    mockFrom.mockResolvedValue({
      data: { org_id: "org-1" },
      error: null,
    });
    mockStorageUpload.mockResolvedValue({
      data: null,
      error: { message: "Storage unavailable" },
    });

    const req = createUploadRequest({
      name: "invoice.pdf",
      type: "application/pdf",
      content: Buffer.from("%PDF-1.4"),
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.code).toBe("INTERNAL_ERROR");
  });

  it("returns 500 when DB insert fails", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    mockFrom.mockResolvedValue({
      data: { org_id: "org-1" },
      error: null,
    });
    mockStorageUpload.mockResolvedValue({
      data: { path: "org-1/inv-1/invoice.pdf" },
      error: null,
    });
    mockInsert.mockResolvedValue({
      data: null,
      error: { message: "DB insert failed" },
    });

    const req = createUploadRequest({
      name: "invoice.pdf",
      type: "application/pdf",
      content: Buffer.from("%PDF-1.4"),
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.code).toBe("INTERNAL_ERROR");
  });

  it("returns 200 with invoiceId and signedUrl on success", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    mockFrom.mockResolvedValue({
      data: { org_id: "org-1" },
      error: null,
    });
    mockStorageUpload.mockResolvedValue({ data: { path: "org-1/inv-1/invoice.pdf" }, error: null });
    mockInsert.mockResolvedValue({
      data: { id: "inv-1" },
      error: null,
    });
    mockUpdate.mockResolvedValue({ error: null });
    mockCreateSignedUrl.mockResolvedValue({
      data: { signedUrl: "https://example.com/signed" },
      error: null,
    });

    const req = createUploadRequest({
      name: "invoice.pdf",
      type: "application/pdf",
      content: Buffer.from("%PDF-1.4"),
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toHaveProperty("invoiceId");
    expect(body.data).toHaveProperty("signedUrl");
    expect(body.data).toHaveProperty("fileName", "invoice.pdf");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run app/api/invoices/upload/route.test.ts`
Expected: FAIL — route returns 501

- [ ] **Step 3: Implement the upload API route**

Replace `app/api/invoices/upload/route.ts`:

```typescript
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateFileMagicBytes, validateFileSize } from "@/lib/upload/validate";
import {
  authError,
  forbiddenError,
  validationError,
  internalError,
  apiSuccess,
} from "@/lib/utils/errors";
import { logger } from "@/lib/utils/logger";

export async function POST(request: Request) {
  const startTime = Date.now();
  let userId: string | undefined;
  let orgId: string | undefined;

  try {
    // 1. Auth check
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      logger.warn("invoice_upload_auth_failed", { status: "unauthorized" });
      return authError();
    }
    userId = user.id;

    // 2. Org lookup
    const { data: membership, error: membershipError } = await supabase
      .from("org_memberships")
      .select("org_id")
      .eq("user_id", user.id)
      .single();

    if (membershipError || !membership) {
      logger.warn("invoice_upload_no_org", { userId });
      return forbiddenError("No organization found. Please contact support.");
    }
    orgId = membership.org_id;

    // 3. Parse form data
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return validationError("No file provided.");
    }

    // 4. Server-side validation
    if (!validateFileSize(file.size)) {
      return validationError("File exceeds 10MB limit.");
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const magicResult = validateFileMagicBytes(buffer, file.type);

    if (!magicResult.valid) {
      logger.warn("invoice_upload_invalid_magic_bytes", {
        userId,
        orgId,
        fileName: file.name,
        claimedType: file.type,
        error: magicResult.error,
      });
      return validationError(
        magicResult.error || "File content does not match expected type."
      );
    }

    // 5. Upload to Supabase Storage
    const admin = createAdminClient();
    const invoiceId = crypto.randomUUID();
    const storagePath = `${orgId}/${invoiceId}/${file.name}`;

    const { error: uploadError } = await admin.storage
      .from("invoices")
      .upload(storagePath, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      logger.error("invoice_upload_storage_failed", {
        userId,
        orgId,
        invoiceId,
        error: uploadError.message,
      });
      return internalError("Upload failed. Please try again.");
    }

    // 6. Create invoice row
    const { error: insertError } = await admin
      .from("invoices")
      .insert({
        id: invoiceId,
        org_id: orgId,
        status: "uploading",
        file_path: storagePath,
        file_name: file.name,
        file_type: file.type,
        file_size_bytes: file.size,
      })
      .select("id")
      .single();

    if (insertError) {
      logger.error("invoice_upload_db_insert_failed", {
        userId,
        orgId,
        invoiceId,
        error: insertError.message,
      });
      return internalError("Upload failed. Please try again.");
    }

    // 7. Update status to extracting
    const { error: updateError } = await admin
      .from("invoices")
      .update({ status: "extracting" })
      .eq("id", invoiceId);

    if (updateError) {
      logger.error("invoice_upload_status_update_failed", {
        userId,
        orgId,
        invoiceId,
        error: updateError.message,
      });
      // Non-fatal: invoice exists, extraction can still proceed
    }

    // 8. Generate signed URL
    const { data: signedUrlData, error: signedUrlError } = await admin.storage
      .from("invoices")
      .createSignedUrl(storagePath, 3600); // 1 hour

    if (signedUrlError) {
      logger.error("invoice_upload_signed_url_failed", {
        userId,
        orgId,
        invoiceId,
        error: signedUrlError.message,
      });
      // Non-fatal: upload succeeded, URL can be regenerated
    }

    const durationMs = Date.now() - startTime;
    logger.info("invoice_upload_success", {
      userId,
      orgId,
      invoiceId,
      fileName: file.name,
      fileType: file.type,
      fileSizeBytes: file.size,
      durationMs,
      status: "success",
    });

    return apiSuccess({
      invoiceId,
      fileName: file.name,
      signedUrl: signedUrlData?.signedUrl || null,
    });
  } catch (error) {
    const durationMs = Date.now() - startTime;
    logger.error("invoice_upload_unexpected_error", {
      userId,
      orgId,
      durationMs,
      error: error instanceof Error ? error.message : "unknown",
    });
    return internalError("Upload failed. Please try again.");
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run app/api/invoices/upload/route.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add app/api/invoices/upload/route.ts app/api/invoices/upload/route.test.ts
git commit -m "feat: implement upload API route with auth, validation, storage (DOC-13)"
```

---

## Chunk 3: Wire Up UploadZone

### Task 3: Connect UploadZone to real API

**Files:**
- Modify: `components/invoices/UploadZone.tsx` (replace `startMockUpload` with real fetch)
- Modify: `components/invoices/UploadZone.test.tsx` (update tests for fetch-based upload)

- [ ] **Step 1: Update UploadZone to call the upload API**

In `components/invoices/UploadZone.tsx`, replace the `startMockUpload` function with a real upload function. Key changes:

1. Replace `startMockUpload` with `uploadFile` that does `fetch("/api/invoices/upload", { method: "POST", body: formData })`
2. Set progress to indeterminate during upload (0 → 100 on completion) since we can't track real upload progress with fetch
3. On success, parse `{ data: { invoiceId, fileName, signedUrl } }` from response
4. On error, parse `{ error }` from response and display it
5. Add an `error` state from API responses (distinct from validation errors)

```typescript
// Replace startMockUpload with:
const uploadFile = useCallback(
  async (file: File) => {
    setState("uploading");
    setError(null);
    setProgress(0);
    setFileName(file.name);
    setStatusAnnouncement(`Uploading ${file.name}`);

    try {
      const formData = new FormData();
      formData.append("file", file);

      // Simulate initial progress
      setProgress(30);

      const response = await fetch("/api/invoices/upload", {
        method: "POST",
        body: formData,
      });

      const body = await response.json();

      if (!response.ok) {
        setState("idle");
        setError(body.error || "Upload failed. Please try again.");
        setStatusAnnouncement("Upload failed");
        return;
      }

      setProgress(100);
      setState("success");
      setStatusAnnouncement("Upload complete");
    } catch {
      setState("idle");
      setError("Upload failed. Please check your connection and try again.");
      setStatusAnnouncement("Upload failed");
    }
  },
  []
);
```

Update `handleFiles` to call `uploadFile` instead of `startMockUpload`.

Remove `timerIdsRef` and the timer cleanup `useEffect` (no longer needed).

- [ ] **Step 2: Update UploadZone tests**

In `components/invoices/UploadZone.test.tsx`, key changes:

1. Remove `vi.useFakeTimers()` / `vi.useRealTimers()` — no more mock timers
2. Mock `global.fetch` to simulate API responses
3. Test: successful upload shows success state
4. Test: API error shows error message
5. Test: network failure shows error message
6. Keep existing validation tests unchanged (they don't hit the API)

```typescript
// Add at top of test file:
const mockFetch = vi.fn();
global.fetch = mockFetch;

beforeEach(() => {
  mockFetch.mockReset();
});

// Example: successful upload test
it("shows success state after successful API upload", async () => {
  mockFetch.mockResolvedValue({
    ok: true,
    json: async () => ({
      data: { invoiceId: "inv-1", fileName: "invoice.pdf", signedUrl: "https://example.com/signed" },
    }),
  });

  render(<UploadZone />);
  const file = createFile("invoice.pdf", 1024, "application/pdf");
  selectFiles(getInput(), [file]);

  await waitFor(() => {
    expect(screen.getByText("Upload Another")).toBeInTheDocument();
  });
});

// Example: API error test
it("shows error message on API failure", async () => {
  mockFetch.mockResolvedValue({
    ok: false,
    json: async () => ({ error: "File exceeds 10MB limit.", code: "VALIDATION_ERROR" }),
  });

  render(<UploadZone />);
  const file = createFile("invoice.pdf", 1024, "application/pdf");
  selectFiles(getInput(), [file]);

  await waitFor(() => {
    expect(screen.getByText("File exceeds 10MB limit.")).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run all tests**

Run: `npx vitest run`
Expected: All tests PASS

- [ ] **Step 4: Run lint and type check**

Run: `npm run lint && npx tsc --noEmit`
Expected: Zero warnings, zero errors

- [ ] **Step 5: Run build**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 6: Commit**

```bash
git add components/invoices/UploadZone.tsx components/invoices/UploadZone.test.tsx
git commit -m "feat: wire UploadZone to upload API route (DOC-13)"
```

---

## Chunk 4: Verification & PR

### Task 4: Final verification and PR

- [ ] **Step 1: Run full completion self-check**

```bash
npm run lint          # Zero warnings, zero errors
npx tsc --noEmit      # No type errors
npm run test          # All tests pass
npm run build         # Build succeeds
```

- [ ] **Step 2: Verify no `any` types in new code**

Run: `grep -r "any" lib/upload/ app/api/invoices/upload/route.ts --include="*.ts" | grep -v test | grep -v node_modules`

- [ ] **Step 3: Verify no console.log in production code**

Run: `grep -r "console\." lib/upload/ app/api/invoices/upload/route.ts --include="*.ts" | grep -v test`

- [ ] **Step 4: Push branch and create PR**

```bash
git push -u origin feature/DOC-13-storage-upload
gh pr create --title "feat: implement Supabase Storage upload (DOC-13)" --body "..."
```

- [ ] **Step 5: Deliver status report**
