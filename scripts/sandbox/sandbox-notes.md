# Sandbox Notes

Findings from API validation scripts. Populated during FND-9, FND-10, FND-11.

---

## QBO Sandbox (FND-9) — 2026-03-15

### Setup

- **Developer portal:** developer.intuit.com
- **App ID:** effa21e7-b120-41c9-b9a2-62f1b452d548
- **Sandbox Company ID:** 9341456611914188
- **Scopes selected:** `com.intuit.quickbooks.accounting` only (no payments scope needed)
- **Base URL (sandbox):** `https://sandbox-quickbooks.api.intuit.com/v3/company/{companyId}`
- **Base URL (production):** `https://quickbooks.api.intuit.com/v3/company/{companyId}`

### Auth Token Lifetimes (confirmed)

| Token | Lifetime | Notes |
|-------|----------|-------|
| Access token | 1 hour (3600s) | Must auto-refresh before expiry |
| Refresh token | ~101 days (8726400s) | If this expires, user must re-authorize |

### Vendor Response Shape

Query: `SELECT * FROM Vendor MAXRESULTS 10`

Key fields on a Vendor object:
```
Id              — string (e.g., "56"), this is the VendorRef.value we need
DisplayName     — string, what the user sees
CompanyName     — string (optional, not always present)
PrintOnCheckName — string
Active          — boolean
Balance         — number
BillAddr        — object (optional): { Id, Line1, City, CountrySubDivisionCode, PostalCode }
PrimaryPhone    — object (optional): { FreeFormNumber }
PrimaryEmailAddr — object (optional): { Address }
CurrencyRef     — { value: "USD", name: "United States Dollar" }
SyncToken       — string (needed for updates, not for reads)
MetaData        — { CreateTime, LastUpdatedTime }
```

**Key finding:** Vendor `Id` is a string, not a number. Always use string type.
**Key finding:** `DisplayName` is the most reliable display field. `CompanyName` is optional.
**Key finding:** Some vendors only have `DisplayName` (no `GivenName`/`FamilyName`/`CompanyName`).

### Account (Chart of Accounts) Response Shape

Query: `SELECT * FROM Account WHERE AccountType = 'Expense' MAXRESULTS 10`

Key fields on an Account object:
```
Id                — string (e.g., "69"), this is the AccountRef.value we need
Name              — string (e.g., "Accounting")
FullyQualifiedName — string (e.g., "Legal & Professional Fees:Accounting")
Active            — boolean
Classification    — "Expense" | "Asset" | "Liability" | "Revenue" | "Equity"
AccountType       — "Expense" (for our use case)
AccountSubType    — string (e.g., "LegalProfessionalFees", "Auto", "BankCharges")
SubAccount        — boolean (true if nested under a parent)
ParentRef         — { value: string } (only if SubAccount is true)
CurrentBalance    — number
CurrencyRef       — { value, name }
```

**Key finding:** Use `FullyQualifiedName` for display when `SubAccount: true` to show hierarchy.
**Key finding:** Filter by `AccountType = 'Expense'` for bill line item GL coding.

### Bill Creation

Endpoint: `POST /v3/company/{id}/bill`

**Minimum required payload:**
```json
{
  "VendorRef": { "value": "56" },
  "Line": [
    {
      "DetailType": "AccountBasedExpenseLineDetail",
      "Amount": 150.00,
      "AccountBasedExpenseLineDetail": {
        "AccountRef": { "value": "69" }
      },
      "Description": "Line item description"
    }
  ]
}
```

**Optional but useful fields:**
- `TxnDate` — invoice date (string "YYYY-MM-DD")
- `DueDate` — due date (string "YYYY-MM-DD")
- `PrivateNote` — internal memo

**Response enrichment — QBO adds these fields automatically:**
- `Bill.Id` — the bill ID (string, e.g., "145")
- `Bill.Balance` — sum of line amounts
- `Bill.TotalAmt` — same as Balance for new bills
- `Bill.SyncToken` — "0" for new bills
- `Bill.APAccountRef` — auto-assigned `{ value: "33", name: "Accounts Payable (A/P)" }`
- `Bill.CurrencyRef` — inherited from company defaults
- Each Line gets: `Id`, `LineNum`, `LinkedTxn: []`, `BillableStatus: "NotBillable"`, `TaxCodeRef: { value: "NON" }`

**Key finding:** VendorRef only needs `{ value: "id" }`. QBO fills in the `name` in the response.
**Key finding:** AccountRef only needs `{ value: "id" }`. QBO fills in the `name` in the response.
**Key finding:** Bill creation is a POST that returns the full Bill object. Status 200 on success (not 201).
**Key finding:** `DetailType` must be `"AccountBasedExpenseLineDetail"` for expense bills. There's also `"ItemBasedExpenseLineDetail"` for item-based tracking, but we don't need it.

### PDF Attachment

Endpoint: `POST /v3/company/{id}/upload`

**Format:** Multipart form-data with two parts:
1. `file_metadata_0` — JSON with attachment metadata
2. `file_content_0` — the actual file binary

**Metadata JSON:**
```json
{
  "AttachableRef": [
    {
      "EntityRef": {
        "type": "Bill",
        "value": "145"
      }
    }
  ],
  "FileName": "invoice.pdf",
  "ContentType": "application/pdf"
}
```

**Response:** `AttachableResponse[0].Attachable` contains:
- `Id` — attachment ID
- `FileName` — as submitted
- `FileAccessUri` — relative download path
- `TempDownloadUri` — temporary signed URL for download
- `Size` — file size in bytes
- `ContentType` — MIME type
- `AttachableRef[0].EntityRef` — confirms the bill linkage

**Key finding:** Attachment is a SEPARATE API call after bill creation. Two-step process.
**Key finding:** The multipart boundary must be set manually. Content-Type header = `multipart/form-data; boundary=...`.
**Key finding:** Part names are `file_metadata_0` and `file_content_0` (zero-indexed).
**Key finding:** If attachment fails but bill succeeded, bill is still valid. Handle as partial success.

### Error Response Shapes

All errors follow this structure:
```json
{
  "Fault": {
    "Error": [
      {
        "Message": "Human-readable message",
        "Detail": "More specific detail",
        "code": "error_code_string",
        "element": "field_name_or_null"
      }
    ],
    "type": "ValidationFault" | "AUTHENTICATION"
  }
}
```

**Error codes observed:**

| Code | HTTP | Type | Meaning |
|------|------|------|---------|
| 3200 | 401 | AUTHENTICATION | Bad/expired token. `www-authenticate` header: `Bearer realm="Intuit", error="invalid_token"` |
| 2020 | 400 | ValidationFault | Required param missing. `element` tells you which field. |
| 2500 | 400 | ValidationFault | Invalid reference ID. Entity not found. |

**Key finding:** Auth errors (401) have a different JSON shape — `fault` (lowercase) with `error` array. Validation errors (400) use `Fault` (uppercase) with `Error` array. INCONSISTENT CASING between error types.
**Key finding:** Error code is a string, not a number.
**Key finding:** `element` field tells you exactly which field caused the error — useful for mapping back to our UI fields.
**Key finding:** Empty `Line` array returns code 2020, same as missing VendorRef. Check `element` to distinguish.

### Rate Limits

- Documented: 500 requests/company/minute (throttle tier based on app tier)
- Not hit during testing (only ~10 requests total)
- No rate limit headers observed in responses
- For MVP (<10 users, <100 invoices/month): not a concern

### CorePlus Metering

- **Free (not metered):** POST (create bill), POST (upload attachment)
- **Metered (CorePlus credits):** GET queries (vendor list, account list)
- Builder tier: 500K credits/month — plenty for MVP
- Each GET query costs ~1 credit

### Surprises / Gotchas

1. **Status 200 on create**, not 201. Don't check for 201.
2. **Inconsistent error JSON casing**: auth errors use `fault.error`, validation errors use `Fault.Error`. Our error parser needs to handle both.
3. **All IDs are strings**, even though they look numeric. Always type as `string`.
4. **VendorRef/AccountRef only need `{ value }` on write**. QBO fills in `name` on response. Don't send `name`.
5. **`SyncToken` is required for updates** (PUT) but not for creates (POST). We must read it before updating.
6. **Attachment is a separate call** from bill creation. Two network roundtrips to fully create a bill with PDF.
7. **Timestamps use Pacific time** in sandbox responses (e.g., `2026-03-15T20:07:36-07:00`).
8. **`time` field** appears at the root of every response — server processing timestamp. Can be used for debugging.
9. **Empty Line array** is treated as "missing required param", not "invalid value". Same error code (2020) as missing VendorRef.
10. **`TempDownloadUri`** on attachments is a very long signed URL. Don't store it — it expires. Use `FileAccessUri` for permanent reference.

---

## Xero Sandbox (FND-10)

TBD

---

## AI Extraction (FND-11)

TBD
