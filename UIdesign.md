# Docket — UI Design Blueprint

> **Source of truth**: Stitch project `4072067082889455348` (working title "Precision Flow - PRD" in Stitch — the actual product name is **Docket**).
> Every agent making UI changes to Docket **must** follow this file exactly.

---

## 1. Design Philosophy

**Name:** Docket
**Pitch:** Eliminate manual invoice entry with zero friction. Automate data extraction from raw invoices using AI and sync verified data directly to QuickBooks or Xero with a single click.
**Target users:** Small business owners and freelance bookkeepers who value their time and demand absolute accuracy.
**Device:** Desktop-first (tablet icon-sidebar fallback; mobile is unsupported — redirect to desktop warning).

**Design style ("Precision Flow"):** A pristine, high-trust **light-mode** environment blending clinical accuracy with frictionless interactions. Stark white surfaces, generous curves, ethereal shadows, and massive, inviting interactive zones.

**Inspired by:** Linear, Mercury, Ramp.

---

## 2. Color Palette

| Token                | Hex         | Usage |
|----------------------|-------------|-------|
| `--color-primary`    | `#3B82F6`   | CTAs, focus rings, progress bars, active nav |
| `--color-background` | `#F8FAFC`   | Page background |
| `--color-surface`    | `#FFFFFF`   | Cards, dropdowns, main panes |
| `--color-text`       | `#0F172A`   | Primary body & heading text |
| `--color-muted`      | `#94A3B8`   | Subdued text, structural borders, empty states |
| `--color-accent`     | `#10B981`   | Success states, "Synced" / "Connected" badges |
| `--color-warning`    | `#F59E0B`   | Missing fields, low-confidence AI extraction |
| `--color-error`      | `#DC2626`   | Error states, failed syncs |

### Derived Values (referenced throughout)

| Name                 | Value        |
|----------------------|--------------|
| Active nav bg        | `#EFF6FF`    |
| Focus ring           | `3px solid #BFDBFE` with `2px` offset |
| Skeleton pulse light | `#F1F5F9`    |
| Skeleton pulse dark  | `#E2E8F0`    |
| Connected badge bg   | `#D1FAE5`    |
| Not-connected badge bg | `#F1F5F9`  |

---

## 3. Typography

| Role            | Family              | Weight | Size     |
|-----------------|----------------------|--------|----------|
| Headings        | `Cabinet Grotesk`    | 700    | 24–32px  |
| Body            | `Satoshi`            | 500    | 16px     |
| Small text      | `Satoshi`            | 400    | 14px     |
| Buttons         | `Satoshi`            | 700    | 15px     |
| Monospace / data | `JetBrains Mono`    | 500    | 14px     |

- Load **Cabinet Grotesk**, **Satoshi**, and **JetBrains Mono** via `@font-face` or CDN.
- Use monospace for all financial amounts (`$1,450.00`), dates, and invoice numbers.

---

## 4. Design Tokens (CSS Custom Properties)

All components and pages **must** reference these tokens — never hard-code raw values.

```css
:root {
  /* Colors */
  --color-primary: #3B82F6;
  --color-background: #F8FAFC;
  --color-surface: #FFFFFF;
  --color-text: #0F172A;
  --color-muted: #94A3B8;
  --color-accent: #10B981;
  --color-warning: #F59E0B;
  --color-error: #DC2626;

  /* Typography */
  --font-headings: 'Cabinet Grotesk', sans-serif;
  --font-body: 'Satoshi', sans-serif;
  --font-mono: 'JetBrains Mono', monospace;

  /* Radii */
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 24px;

  /* Shadows */
  --shadow-soft: 0 12px 40px -8px rgba(15, 23, 42, 0.06);
  --shadow-float: 0 20px 60px -12px rgba(15, 23, 42, 0.12);
}
```

### Tailwind Config Mapping

The project uses **Tailwind CSS v3**. Extend `tailwind.config.ts` to mirror these tokens:

```ts
// tailwind.config.ts  — theme.extend
colors: {
  primary:    { DEFAULT: '#3B82F6' },
  background: { DEFAULT: '#F8FAFC' },
  surface:    { DEFAULT: '#FFFFFF' },
  text:       { DEFAULT: '#0F172A' },
  muted:      { DEFAULT: '#94A3B8' },
  accent:     { DEFAULT: '#10B981' },
  warning:    { DEFAULT: '#F59E0B' },
  error:      { DEFAULT: '#DC2626' },
},
borderRadius: {
  sm:  '8px',
  md:  '12px',
  lg:  '24px',
},
boxShadow: {
  soft:  '0 12px 40px -8px rgba(15, 23, 42, 0.06)',
  float: '0 20px 60px -12px rgba(15, 23, 42, 0.12)',
},
fontFamily: {
  headings: ['Cabinet Grotesk', 'sans-serif'],
  body:     ['Satoshi', 'sans-serif'],
  mono:     ['JetBrains Mono', 'monospace'],
},
```

---

## 5. Shared Component Specifications

### 5.1 Primary Button

| Property    | Value |
|-------------|-------|
| Height      | `44px` |
| Background  | `var(--color-primary)` / `#3B82F6` |
| Text color  | `#FFFFFF` |
| Font        | Satoshi 700, 15px |
| Radius      | `var(--radius-md)` / `12px` |
| Hover       | Darken background ~10% (`#2563EB`) |
| Focus       | `3px solid #BFDBFE`, `2px` offset |

### 5.2 Outline / Secondary Button

| Property    | Value |
|-------------|-------|
| Border      | `1px solid #E2E8F0` |
| Text color  | `var(--color-text)` |
| Background  | transparent |
| Radius      | `var(--radius-md)` |
| Hover       | Background `#F8FAFC` |

### 5.3 Status Badge (Pill)

| Property    | Value |
|-------------|-------|
| Font        | Satoshi 500, 14px |
| Shape       | Pill (full radius) |
| Background  | 10% opacity of text color |
| Variants    | **Synced/Connected**: `#10B981` text, `#D1FAE5` bg · **Pending**: `#F59E0B` text, `#FEF3C7` bg · **Failed/Error**: `#DC2626` text, `#FEE2E2` bg · **Not Connected**: `#94A3B8` text, `#F1F5F9` bg |

### 5.4 Cards

| Property    | Value |
|-------------|-------|
| Background  | `var(--color-surface)` |
| Radius      | `var(--radius-lg)` / `24px` |
| Shadow      | `var(--shadow-soft)` |
| Hover lift  | `translateY(-2px)` + shadow → `var(--shadow-float)` |

### 5.5 Inputs

| Property    | Value |
|-------------|-------|
| Height      | `44px` |
| Radius      | `var(--radius-md)` / `12px` |
| Border      | `1px solid #E2E8F0` |
| Focus       | `3px solid #BFDBFE`, `2px` offset |

### 5.6 Toast Notifications

| Position    | Top-right |
|-------------|-----------|
| Error toast | Red text, retry button for failed syncs |

---

## 6. Layout — App Shell

### Sidebar (Left)

| Property          | Value |
|-------------------|-------|
| Width (desktop)   | `280px` |
| Width (tablet)    | Icon-only collapse |
| Background        | `var(--color-surface)` |
| Inner margin      | `16px` |

**Nav items:** Three links — `Invoices` (icon: `receipt_long` / `description`), `Upload` (icon: `cloud_upload` / `upload_file`), `Settings` (icon: `settings`).

| Nav item state | Style |
|----------------|-------|
| Default        | `var(--color-muted)` text |
| Active         | `var(--color-primary)` text, `#EFF6FF` background, `var(--radius-md)` radius |
| Hover          | `#F8FAFC` background |

**User badge** at the bottom: name ("Alex Bookkeeper"), role ("Workspace Admin").

**Branding** at top: Render the official project logo using `<img src="/dockett_logo.png" alt="Dockett" className="h-8" />` (use the provided `public/dockett_logo.png`). Do not use plain text for the branding if the logo is available.

### Main Content Area

- Background: `var(--color-background)` / `#F8FAFC`
- Full remaining width after sidebar

---

## 7. Screen Specifications

### 7.1 Invoices Screen

**Route:** `/invoices`
**Purpose:** Central hub tracking all uploaded invoices with processing statuses and a primary CTA to add more.

#### Layout
- Sidebar (280px) + wide main content area
- Header: page title (`Cabinet Grotesk`, 32px) + massive "Upload New" primary button (right-aligned)

#### Invoice List
- Borderless list rows with staggered appearance animation
- **Monospace** for amounts (`$1,450.00`), invoice numbers, dates
- Status badges: pill-shaped, colored per §5.3
- Inline extracted-data fields for quick review

#### Key Data Fields
- Subtotal, Tax, Due Date, Category (AI Suggested)
- "Showing X to Y of Z invoices" pagination footer

#### Interactions
| Action       | Behavior |
|--------------|----------|
| Hover row    | Background → `#F8FAFC`, right-aligned "Sync" action appears |
| Click row    | Row expands to reveal detailed extracted fields (Vendor, Date, Total, Tax) |
| Click "Sync to Xero" | Invoice marked complete, syncs via API |

#### States

| State    | Behavior |
|----------|----------|
| Empty    | "No invoices yet" illustration + massive "Upload your first invoice" primary button |
| Loading  | Skeleton pulses (`#E2E8F0` → `#F1F5F9`) replacing list rows |
| Error    | Toast notification (top-right), red text, retry button |
| Success  | Green "Synced" badge, `verified` icon + "Data Extracted Successfully" banner |

#### Responsive
- **Desktop:** Full sidebar + all data columns
- **Tablet:** Sidebar collapses to icons
- **Mobile:** Redirect to desktop warning

---

### 7.2 Upload Screen

**Route:** `/upload`
**Purpose:** Frictionless bulk ingestion of raw invoice PDFs/images via a dedicated hero page.

#### Layout
- Massive centered dropzone: **80% width**, **60vh height**
- Sidebar still visible

#### Dropzone

| Property        | Value |
|-----------------|-------|
| Background      | `var(--color-surface)` / `#FFFFFF` |
| Border          | `2px dashed #CBD5E1` |
| Radius          | `var(--radius-lg)` / `24px` |
| Icon            | Upload icon, `48px`, centered |
| Heading         | `Cabinet Grotesk`, 24px, `var(--color-text)`: "Drag & drop invoices here" |
| Subtext         | `Satoshi`, 14px, `var(--color-muted)`: "PDF, PNG, JPG up to 10MB" |

#### States

| State             | Behavior |
|-------------------|----------|
| Empty             | Standard dropzone as described |
| Active (drag over)| Border → solid `#3B82F6`, background → `#EFF6FF`, scale `1.02` |
| Processing        | Individual file rows with `4px` progress bar in `var(--color-primary)` |

#### Processing Queue
- Slides up from bottom once files are dropped
- **File row:** `64px` height, `var(--color-surface)` bg, `var(--shadow-soft)`, file icon + filename + status text
- Each row shows a progress bar (`4px` height, `#3B82F6`)
- "View Result" link navigates to the invoice review

#### Interactions
| Action       | Behavior |
|--------------|----------|
| Drop files   | Haptic-style snap animation, dropzone shrinks slightly, queue populates |
| Click "Browse" | Standard OS file picker |

---

### 7.3 Settings Screen

**Route:** `/settings`
**Purpose:** Manage app preferences and connect to accounting suites (QuickBooks or Xero).

#### Layout
- Centered narrow column: **max-width 600px**
- Sidebar still visible

#### Page Title
- `Cabinet Grotesk`, 32px: "Settings"

#### Sections

**Section: Connected Accounting**
- Section heading: `Satoshi`, 16px, `var(--color-muted)`: "Connected Accounting"
- **Integration Cards:** horizontal cards, `120px` height, `var(--radius-lg)`, `var(--color-surface)` bg
  - Left: Xero / QuickBooks SVG logo, centered vertically
  - Right: Connection status pill badge
    - Connected: `#10B981` text, `#D1FAE5` bg
    - Not Connected: `#94A3B8` text, `#F1F5F9` bg
  - Action: Outline-style "Connect" button (§5.2)

**Section: Preferences**
- Standard form inputs (§5.5) for user preferences

#### States

| State    | Behavior |
|----------|----------|
| Empty    | Both cards show "Not Connected" |
| Loading  | OAuth redirect spinner overlay |

#### Interactions
| Action       | Behavior |
|--------------|----------|
| Click Connect | Initiates OAuth popup window |
| Hover card   | `translateY(-2px)` lift + shadow → `var(--shadow-float)` |

---

## 8. Key User Flow — Upload & Verify

This is the primary flow. All screens must support this journey seamlessly:

1. User is on **Invoices** screen → sees **"Upload New"** primary button.
2. User clicks **"Upload New"** → navigates to **Upload** screen.
3. User drops 5 PDFs into the dropzone → real-time progress indicators appear in the queue.
4. AI finishes extraction → user navigates back to **Invoices** list.
5. User reviews extracted data fields directly within expanded list rows.
6. User clicks **"Sync to Xero"** on a verified invoice → invoice is marked complete and syncs via API.

---

## 9. Component-to-File Mapping (Current Codebase)

| Stitch Concept            | Docket Component File                              |
|---------------------------|-----------------------------------------------------|
| App Shell / Sidebar       | `components/layout/AppShell.tsx`, `Sidebar.tsx`, `Header.tsx` |
| Invoice List              | `components/invoices/InvoiceList.tsx`               |
| Invoice Status Badges     | `components/invoices/InvoiceStatusBadge.tsx`        |
| Upload Dropzone           | `components/invoices/UploadZone.tsx`                |
| Extraction Progress       | `components/invoices/ExtractionProgress.tsx`        |
| Extraction Form / Review  | `components/invoices/ExtractionForm.tsx`            |
| Line Item Editor          | `components/invoices/LineItemEditor.tsx`            |
| PDF Viewer (split pane)   | `components/invoices/PdfViewer.tsx`                 |
| Review Layout             | `components/invoices/ReviewLayout.tsx`              |
| Approve / Sync Bars       | `components/invoices/ApproveBar.tsx`, `SyncBar.tsx` |
| QBO Connection Card       | `components/settings/QBOConnectionCard.tsx`         |
| Settings Alert            | `components/settings/SettingsAlert.tsx`             |
| Shared Button             | `components/ui/Button.tsx`                          |
| Shared Badge              | `components/ui/Badge.tsx`                           |
| Shared Input              | `components/ui/Input.tsx`                           |
| Shared Select             | `components/ui/Select.tsx`                          |

---

## 10. Style Rules for Agents

> [!IMPORTANT]
> Follow these rules when making any visual or UI change to Docket.

1. **Always use design tokens** — reference CSS custom properties or their Tailwind equivalents. Never hard-code hex values inline.
2. **Radii are generous** — `24px` on cards, `12px` on inputs/buttons, `8px` on small elements. Do not use sharp corners.
3. **Shadows are diffused** — use `shadow-soft` by default, `shadow-float` on hover/lift states. Never use harsh `drop-shadow`.
4. **Focus rings are mandatory** — every interactive element must show `3px solid #BFDBFE` with `2px` offset on focus.
5. **Monospace for data** — all financial amounts, dates, and invoice numbers use `JetBrains Mono`.
6. **Light mode only** — do not add dark mode unless explicitly requested.
7. **Animations** — use subtle transitions (`150–200ms ease`). Hover lifts use `translateY(-2px)`. Skeleton loading uses pulse animation between `#E2E8F0` and `#F1F5F9`.
8. **Spacing** — prefer generous whitespace. The design favors "expansive" over "compact".
9. **No mobile layout** — the app is desktop-first. Tablet gets icon-only sidebar. Mobile shows a redirect warning.
10. **Status colors are semantic** — green = success/synced, amber = warning/pending, red = error/failed, muted gray = inactive/not-connected.
