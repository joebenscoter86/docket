# TODOS

Deferred work items tracked from plan reviews and implementation sessions.

---

## P2: Duplicate Detection for Batch Uploads

**What:** Add SHA-256 file hash check during upload to warn on duplicate invoices.

**Why:** Prevents duplicate bills in QuickBooks (real money impact). Most likely when uploading batches from mixed sources.

**Context:** Hash file contents on upload, store hash in `invoices` table (new column `file_hash TEXT`), check against existing hashes for the org. Warn client-side: "invoice-march.pdf appears to be a duplicate of an invoice uploaded on Mar 15. Upload anyway?" User can proceed or skip.

**Effort:** S (human: ~1 day / CC: ~15 min)
**Depends on:** Batch Upload project (BAT-1+)
**Source:** CEO Plan Review, 2026-03-19
