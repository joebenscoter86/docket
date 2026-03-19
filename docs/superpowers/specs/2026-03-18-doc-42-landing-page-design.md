# DOC-42: Landing Page Design

## Overview

Single-page marketing landing at `/` for unauthenticated users. Communicates what Docket does, who it's for, and why they should sign up — in an honest, approachable voice aimed at small business owners and bookkeepers. No fake social proof, no enterprise posturing. Authenticated users hitting `/` redirect to `/app/invoices`.

**Tone:** Friendly, warm, almost vulnerable. Small business talking to small business. "We know you're doing this at your kitchen table after hours."

**Visual style:** Follows the Precision Flow design system (UIdesign.md) — clean white surfaces, blue accents, generous spacing, soft shadows. Follows the layout structure from the approved mockup screenshot.

---

## Page Structure

### Nav Bar

Minimal, sticky top bar:

```
[Docket logo]                           [Log In]  [Get Started Free]
```

- **Logo:** Docket logo image (`/public/dockett_logo.png`), links to `/`
- **Log In:** text link → `/login`
- **Get Started Free:** primary button (blue, 12px radius) → `/signup`
- No dropdowns, no nav items linking to pages that don't exist
- White background, subtle bottom border, sticks on scroll

### Section 1: Hero

Two-column layout (text left, screenshot right). Full-viewport height on desktop.

- **Headline:** "From invoice to QuickBooks in under a minute."
  - Cabinet Grotesk 700, ~40-48px, dark text (larger than app headings — landing-page-specific sizing, use Tailwind `text-5xl`/`text-4xl`, not new design tokens)
- **Subheadline:** "Upload your invoices. AI pulls out the details. You review, approve, and sync — done."
  - Satoshi 400, ~18px, muted text color
- **CTA:** "Get Started Free" → `/signup`
  - Primary button, large (48px height), no secondary CTA
  - Same label as nav button for consistency
- **Right side:** Real screenshot of the Docket review UI (side-by-side PDF viewer + extraction form)
  - Static image served from `/public/images/`
  - Subtle soft shadow and rounded corners on the screenshot
  - On mobile, screenshot stacks below the text

### Section 2: How It Works

Centered heading + 3 cards in a row.

- **Section heading:** "How It Works"
  - Cabinet Grotesk 700, ~32px, centered
- **Subheading:** "Your invoices go from paper to ledger in three steps."
  - Satoshi 400, muted, centered

**Cards (3-column grid, stacking on mobile):**

| Step | Icon | Title | Description |
|------|------|-------|-------------|
| 1 | Upload icon | Upload | "Drop your PDFs — one or a whole batch. We take it from there." |
| 2 | Sparkle/AI icon | Review | "AI extracts vendor, line items, and totals. You check the work." |
| 3 | Sync/arrow icon | Sync | "One click creates a bill or cuts a check in QuickBooks." |

- Cards: white surface, soft shadow, 12px radius, generous padding
- Icons: inline SVGs in Heroicons outline style (matching the sidebar icon patterns), primary blue color
- Step numbers optional (subtle, above title)

### Section 3: Features

Two-column layout — feature list on the left, real screenshot on the right (or alternating).

- **Section heading:** "Built for how you actually work"
  - Cabinet Grotesk 700, ~32px

**Feature items (stacked vertically, icon + text):**

| Feature | Description |
|---------|-------------|
| **Batch upload** | "Process a whole stack of invoices at once — no more one at a time." |
| **Bill or check** | "Create a bill in QuickBooks, or skip straight to cutting a check." |
| **AI extraction** | "Our AI reads your invoices so you don't have to type a thing." |
| **Side-by-side review** | "See the original document right next to the extracted data. Fix anything the AI missed." |

- Each feature: small icon (left) + title (bold) + one-line description
- No inflated metrics, no "99.8% accuracy," no SOC badges
- Right side: second screenshot or cropped detail of the review UI

### Section 4: Bottom CTA

Full-width section with centered text and button. Background uses `bg-background` (`#F8FAFC`) to visually separate from the white features section above.

- **Headline:** "Spend your evening, your way — not on invoices."
  - Cabinet Grotesk 700, ~36px
- **CTA:** "Get Started Free" → `/signup`
  - Primary button, large

### Section 5: Footer

Minimal, reuses the existing `Footer` component with minor additions:

```
Privacy Policy · Terms of Service
© 2026 JB Technologies LLC
```

- Existing Footer component already has this structure — reuse as-is
- Subtle top border, centered, small text

---

## Responsive Behavior

> **Note:** UIdesign.md specifies "mobile is unsupported — redirect to desktop warning" for the app. The landing page is an exception because it's a marketing surface, not an app screen. Potential customers will find Docket on their phones — the landing page must look great on mobile even if the app itself is desktop-only.

| Breakpoint | Behavior |
|------------|----------|
| Desktop (≥1024px) | Two-column hero, 3-column cards, two-column features |
| Tablet (768-1023px) | Two-column hero (narrower screenshot), 3-column cards, single-column features |
| Mobile (<768px) | Single column throughout. Screenshot stacks below hero text. Cards stack vertically. Features stack. |

- **Mobile nav:** Logo + hamburger icon. Tapping opens a slide-down panel (white background, same shadow-soft) containing "Log In" text link and "Get Started Free" button. Closes on tap outside or a second tap on hamburger. Panel is keyboard-navigable.
- All sections get reduced padding on mobile
- Hero headline scales down to ~28-32px on mobile

---

## Technical Details

### Route Logic

In `app/page.tsx`:
1. Check auth status server-side via Supabase `getUser()`
2. If authenticated → `redirect('/app/invoices')`
3. If not → render landing page

### SEO

```tsx
export const metadata: Metadata = {
  title: 'Docket — Invoice to QuickBooks in Under a Minute',
  description: 'Upload invoices, AI extracts the data, sync to QuickBooks with one click. Built for small businesses and bookkeepers.',
  openGraph: {
    title: 'Docket — Invoice to QuickBooks in Under a Minute',
    description: 'Upload invoices, AI extracts the data, sync to QuickBooks with one click.',
    url: 'https://dockett.app',
    siteName: 'Docket',
    type: 'website',
    images: [
      {
        url: 'https://dockett.app/images/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Docket — Invoice to QuickBooks in Under a Minute',
      },
    ],
  },
}
```

### Screenshot Asset

- Capture a real screenshot of the review UI (`/app/invoices/[id]/review`) with sample data
- Save as `/public/images/review-ui-screenshot.png` (and a 2x version for retina)
- Use `next/image` with proper `width`, `height`, and `alt` text
- Screenshot should show a clean, populated state — not empty or error
- **Fallback:** If no clean sample data is available at implementation time, use a placeholder image and replace with real screenshot before launch
- **OG image:** Create a 1200x630px image at `/public/images/og-image.png` — can be a branded card with the headline and a cropped screenshot

### File Structure

```
app/
  page.tsx                           # Landing page (replaces current stub)
components/
  landing/
    LandingNav.tsx                   # Minimal nav bar
    HeroSection.tsx                  # Hero with headline + screenshot
    HowItWorksSection.tsx            # 3-step cards
    FeaturesSection.tsx              # Feature list with screenshot
    BottomCTA.tsx                    # Final call to action
  layout/
    Footer.tsx                       # Existing — reused as-is
public/
  images/
    review-ui-screenshot.png         # Real product screenshot
    review-ui-screenshot@2x.png      # Retina version
    og-image.png                     # 1200x630 Open Graph image
```

### Design Tokens Used

All from UIdesign.md / Precision Flow — no new tokens:
- Colors: `primary`, `background`, `surface`, `text`, `muted`
- Typography: Cabinet Grotesk (headings), Satoshi (body)
- Radius: `radius-md` (12px) for cards and buttons
- Shadows: `shadow-soft` for cards, `shadow-float` for screenshot

### Accessibility

- Use semantic landmarks: `<nav>` for nav bar, `<main>` for page content, `<section>` for each content section, `<footer>` for footer
- Screenshot `alt` text: "Docket review interface showing a PDF invoice side-by-side with extracted data fields"
- Hamburger menu is keyboard-navigable (Escape to close, Tab through items)
- All interactive elements have visible focus states (existing `focus ring` token)
- No animations — static page, no scroll-triggered transitions

### Dependencies

None new. Uses existing:
- `next/image` for screenshot
- `next/link` for navigation
- Supabase server client for auth check
- Existing `Footer` component

---

## What This Page Does NOT Include

Intentionally excluded based on design review with Joe:

- ~~Pricing section~~ — not needed for design partner launch
- ~~Social proof / trust badges~~ — no customers yet, no fake metrics
- ~~"Watch Demo" CTA~~ — no demo video exists
- ~~SOC 2, accuracy percentages~~ — no certifications or benchmark data
- ~~Nav dropdowns (Product, Solutions, Resources)~~ — no pages to link to
- ~~Footer links (API Docs, Careers, Partner Program)~~ — none exist
- ~~Testimonials~~ — no customers to quote

These can be added as the product matures and real data exists to back them up.

---

## Copy Guidelines

- **Target audience:** Small business owners and bookkeepers who enter invoices manually
- **Tone:** Professional but warm. Empathetic, not salesy. "We get it."
- **Avoid:** Jargon, inflated claims, enterprise language, "AI-powered" as a buzzword
- **Lean into:** Time savings, simplicity, the relief of not doing data entry
- **Voice test:** Would a small business owner read this and think "these people understand my problem"?
