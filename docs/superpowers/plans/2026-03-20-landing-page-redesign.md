# Landing Page Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate 6 new 3D image assets into the landing page with a minimal-float icon treatment and minor polish refinements.

**Architecture:** Pure frontend changes — 3 component files edited, 6 image files committed. No new dependencies, no API changes, no database changes.

**Tech Stack:** Next.js 14, Tailwind CSS, next/image

**Spec:** `docs/superpowers/specs/2026-03-20-landing-page-redesign-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `public/images/icon-upload.png` | Commit | 3D workflow icon (already on disk, untracked) |
| `public/images/icon-review.png` | Commit | 3D workflow icon (already on disk, untracked) |
| `public/images/icon-sync.png` | Commit | 3D workflow icon (already on disk, untracked) |
| `public/images/hero_data_3d.png` | Commit | Future hero asset (already on disk, untracked) |
| `public/images/hero_illustration_3d.png` | Commit | Future hero asset (already on disk, untracked) |
| `public/images/hero_tablet_3d.png` | Commit | Future hero asset (already on disk, untracked) |
| `components/landing/HowItWorksSection.tsx` | Modify | Bump icon container from 96px to 128px |
| `components/landing/FeaturesSection.tsx` | Modify | Widen text column, tighten mobile gap |
| `app/page.tsx` | Modify | Normalize ring opacity on Features card |

---

### Task 1: Commit image assets

**Files:**
- Commit: `public/images/icon-upload.png`
- Commit: `public/images/icon-review.png`
- Commit: `public/images/icon-sync.png`
- Commit: `public/images/hero_data_3d.png`
- Commit: `public/images/hero_illustration_3d.png`
- Commit: `public/images/hero_tablet_3d.png`

- [ ] **Step 1: Stage all 6 image files**

```bash
git add public/images/icon-upload.png public/images/icon-review.png public/images/icon-sync.png public/images/hero_data_3d.png public/images/hero_illustration_3d.png public/images/hero_tablet_3d.png
```

- [ ] **Step 2: Commit**

```bash
git commit -m "chore: add 3D landing page image assets (workflow icons + hero images)"
```

---

### Task 2: HowItWorksSection — increase icon size

**Files:**
- Modify: `components/landing/HowItWorksSection.tsx:38`

- [ ] **Step 1: Change icon container size**

In `components/landing/HowItWorksSection.tsx`, line 38, change the icon container div classes:

```tsx
// Before
<div className="relative h-24 w-24 mb-6">

// After
<div className="relative h-32 w-32 mb-6">
```

The `<Image>` inside uses `fill` and `object-contain`, so it scales automatically with the container.

- [ ] **Step 2: Verify dev server renders correctly**

```bash
npm run dev -- --port 3000
```

Open `http://localhost:3000` and confirm the 3 workflow icons in "How It Works" are larger (128px) and their 3D glow/glassmorphism detail reads clearly. Hover each to confirm `scale-105` transition still works.

- [ ] **Step 3: Commit**

```bash
git add components/landing/HowItWorksSection.tsx
git commit -m "style: increase HowItWorks icon size to 128px for 3D detail"
```

---

### Task 3: FeaturesSection — rebalance layout

**Files:**
- Modify: `components/landing/FeaturesSection.tsx:7,9`

- [ ] **Step 1: Widen text column and tighten mobile gap**

In `components/landing/FeaturesSection.tsx`:

Line 7 — change the flex container gap:
```tsx
// Before
<div className="flex flex-col gap-16 lg:flex-row lg:items-center lg:gap-24">

// After
<div className="flex flex-col gap-10 lg:flex-row lg:items-center lg:gap-24">
```

Line 9 — change the text column max-width:
```tsx
// Before
<div className="flex-1 lg:max-w-md">

// After
<div className="flex-1 lg:max-w-lg">
```

- [ ] **Step 2: Verify layout**

On the dev server at `http://localhost:3000`, confirm:
- Desktop: text column is wider, screenshot still fills remaining space
- Mobile (resize to ~375px): gap between text and screenshot is tighter (40px instead of 64px)

- [ ] **Step 3: Commit**

```bash
git add components/landing/FeaturesSection.tsx
git commit -m "style: rebalance FeaturesSection text/screenshot layout"
```

---

### Task 4: page.tsx — normalize card ring opacity

**Files:**
- Modify: `app/page.tsx:65`

- [ ] **Step 1: Change Features card ring opacity**

In `app/page.tsx`, line 65, update the Features card wrapper:

```tsx
// Before
<div className="rounded-[40px] shadow-2xl overflow-hidden bg-white ring-1 ring-white/10">

// After
<div className="rounded-[40px] shadow-2xl overflow-hidden bg-white ring-1 ring-white/20">
```

This matches the Hero card's `ring-white/20` for visual consistency.

- [ ] **Step 2: Verify**

On the dev server, confirm the Features card's border ring matches the Hero card's subtle white glow on the dark background.

- [ ] **Step 3: Commit**

```bash
git add app/page.tsx
git commit -m "style: normalize card ring opacity to ring-white/20"
```

---

### Task 5: Final verification

- [ ] **Step 1: Run lint**

```bash
npm run lint
```

Expected: zero warnings, zero errors.

- [ ] **Step 2: Run build**

```bash
npm run build
```

Expected: successful build with no errors.

- [ ] **Step 3: Run type check**

```bash
npx tsc --noEmit
```

Expected: no type errors.

- [ ] **Step 4: Full visual check**

Open `http://localhost:3000` and verify the complete landing page:
- Dark dot-grid background renders correctly
- Nav card: white, no ring (strong contrast)
- Hero card: `ring-white/20` subtle glow
- HowItWorks: 3D icons at 128px, floating on `#FAFAFA`, hover scale works
- FeaturesSection: text column wider, mobile gap tighter
- Features card: `ring-white/20` matching Hero card
- BottomCTA and Footer: unchanged, rendering correctly
