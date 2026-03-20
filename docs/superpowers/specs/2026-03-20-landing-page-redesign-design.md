# Landing Page Redesign — Polish & 3D Asset Integration

**Date:** 2026-03-20
**Scope:** Targeted polish pass integrating new 3D assets, not a full reimagining.

## Summary

Integrate 6 newly generated 3D image assets into the landing page. Three glassmorphism workflow icons go into the HowItWorksSection with a minimal-float treatment (no container cards). Three hero images are committed for future use. Minor refinements to page.tsx card styling and FeaturesSection layout balance.

## Files Changed

| File | Change |
|------|--------|
| `components/landing/HowItWorksSection.tsx` | Increase icon size, remove unnecessary containers, let 3D icons float with built-in glow |
| `components/landing/FeaturesSection.tsx` | Rebalance text/screenshot column weights |
| `app/page.tsx` | Minor card/canvas spacing refinements |
| `components/landing/HeroSection.tsx` | **No changes** — already in clean state |
| `public/images/icon-upload.png` | Commit (already referenced in HowItWorks) |
| `public/images/icon-review.png` | Commit (already referenced in HowItWorks) |
| `public/images/icon-sync.png` | Commit (already referenced in HowItWorks) |
| `public/images/hero_data_3d.png` | Commit for future use |
| `public/images/hero_illustration_3d.png` | Commit for future use |
| `public/images/hero_tablet_3d.png` | Commit for future use |

## Design Decisions

### HowItWorksSection — Minimal Float Icons (Option A)

The 3D icons already have glassmorphism, glow, and depth baked into the art. Adding a frosted-glass container or card around them would compete with the art and feel over-designed.

**Treatment:**
- Icons float directly on the `#FAFAFA` section background
- Icon container div changed from `h-24 w-24` to `h-32 w-32` (128px). The `<Image>` inside uses `fill` and scales automatically.
- Existing `drop-shadow-xl` and `hover:scale-105 transition-transform` on the Image preserved
- `mb-6` below icon container unchanged. Grid `gap-12` and `mt-20` unchanged — the size bump alone provides enough presence without spacing changes.
- Title and description centered below each icon, unchanged

**Rejected alternatives:**
- **B — Subtle Glass Card:** Frosted glass pedestal behind each icon. Redundant with the built-in glass effect.
- **C — Full Step Card:** Icon + text grouped in a structured card. Adds visual weight that competes with the icons.

### page.tsx — Card & Canvas Refinements

The dark dot-grid canvas (`#1A1C20`, radial-gradient dots at `opacity-50`) and floating rounded cards (`rounded-[40px]`, `shadow-2xl`) are already in place from the Stitch mockup integration.

**Refinements per card element:**
- **Nav card** (`rounded-[40px] bg-white shadow-xl`): No ring needed — white-on-dark already has strong contrast.
- **Hero card** (`ring-1 ring-white/20`): Keep as-is.
- **Features card** (`ring-1 ring-white/10`): Change to `ring-white/20` to match Hero card for consistency.
- Spacing between cards (`space-y-8 lg:space-y-12`): Keep as-is.

### FeaturesSection — Structural Rebalance

**Changes:**
- Text column: change `lg:max-w-md` to `lg:max-w-lg` so copy has more room to breathe alongside the screenshot
- Mobile gap: reduce `gap-16` to `gap-10` in the `flex-col` layout so text and screenshot feel connected on smaller screens. Desktop `lg:gap-24` unchanged.
- Keep the decorative gradient blur behind the screenshot

### HeroSection — No Changes

The split-column layout (copy left, HeroAnimation right) was recently reverted to a clean state. It stays as-is.

### Image Assets

All 6 new 3D images committed to `public/images/`:
- **Workflow icons** (in use): `icon-upload.png`, `icon-review.png`, `icon-sync.png`
- **Hero images** (future use): `hero_data_3d.png`, `hero_illustration_3d.png`, `hero_tablet_3d.png`

## Out of Scope

- HeroAnimation.tsx changes
- New sections or copy rewrites
- LandingNav, BottomCTA, or Footer changes
- Mobile-specific layout overhauls (existing responsive classes are sufficient)
