# Docket: Pricing Proposal

> Updated March 20, 2026. Internal strategy document.
> v2: Both platforms on all tiers (Xero shipping with MVP), 10-invoice usage-based trial, AI GL inference ungated.

---

## The Issue: Why $99/mo as the Entry Point Doesn't Work

The original business plan set a single $99/mo Growth tier. The revised GTM proposed $39/$99 tiers. But even the revised structure has a gap: it jumps from $39 (50 invoices) straight to $99 (200 invoices) with nothing in between. That's a 153% price jump for a 4x volume increase, and it leaves the core ICP (processing 50-150 invoices/month) either overpaying at $99 or bumping the ceiling at $39.

### Competitive Landscape

| Competitor | Price | Volume | Line Items | Review UI |
|------------|-------|--------|------------|-----------|
| QBO Autofill | Free | Unlimited (one at a time) | Beta | No |
| Hubdoc | Free (with Xero) | Unlimited | No | No |
| PostInvoice | ~$19/mo (est.) | ~100 invoices | Yes | No |
| Datamolino | $29/mo | 250 docs | Yes | No |
| Dext | $31.50/mo | 250 docs / 5 users | Extra credits | No |
| AutoEntry | ~$30/mo | Credit-based | 2x credits | No |
| **Docket (current plan)** | **$99/mo** | **200 invoices** | **Yes** | **Yes** |

At $99, Docket is 3x the price of Dext and 5x PostInvoice. The product is better, but at launch with zero reviews and no brand, that's a hard gap to bridge.

---

## Recommendation: Three Tiers at $29 / $59 / $99

Lower the entry barrier, capture the core ICP in the middle tier, preserve $99 for high-volume users.

**$29 entry point:** Priced just below Dext ($31.50) and at parity with Datamolino ($29). A frustrated QBO Autofill user sees Docket at the same price as established tools, but with a better feature set. Undercuts the psychological "$30 threshold."

**$59 middle tier:** This is where the money lives. The core ICP (contractors, tradespeople, small service businesses) processes 50-150 invoices/month. At $59, you're 2x Dext but with batch upload and the full bill-to-check toggle (4 transaction types) that no competitor offers.

**$99 top tier:** Reserved for businesses processing serious volume (300+ invoices) or small bookkeepers managing a few clients. Includes email forwarding, vendor auto-matching, and priority support.

---

## Proposed Pricing Tiers

### All tiers include (ungated):

- Full header + line-item extraction
- Side-by-side review UI
- Confidence scoring on all fields
- AI GL account inference suggestions
- One-click navigation to created item in QBO/Xero
- QBO + Xero integration (both platforms)
- PDF attachment to bills
- Email support

### Starter: $29/mo ($23/mo billed annually)

- Up to 75 invoices/month
- All core features above
- Single-invoice upload only (no batch)
- Bill creation only (no check/cash/credit card toggle)

### Pro: $59/mo ($47/mo billed annually) — RECOMMENDED

- Up to 200 invoices/month
- Everything in Starter
- Batch upload (drop 25 at once)
- Bill-to-check toggle (bill, check, cash expense, credit card expense)
- Priority email support

### Growth: $99/mo ($79/mo billed annually)

- Up to 500 invoices/month
- Everything in Pro
- Email forwarding ingestion
- Vendor auto-matching
- Multi-entity support
- Priority support + onboarding call
- API access (future)

**Free trial: 10 invoices, no time limit, Pro-level features.** No credit card required. Usage-based, not time-based. After 10 invoices, user must choose a tier to continue. This model aligns with how the ICP actually works (invoices arrive in batches, not daily) and avoids the problem of a 14-day trial expiring during a slow week. Simpler to implement too: no Stripe trial period, no expiry webhooks, just a count check in the access layer.

**Design partners:** First 10 customers get permanent free access to Pro features (150 invoices/month cap). In exchange: honest app store review within 30 days and a 15-minute feedback call.

---

## Unit Economics

Primary variable cost is Claude Vision API calls (~$0.01-0.03 per invoice).

| Tier | Revenue | API Cost (max usage) | Gross Margin | Contribution |
|------|---------|---------------------|--------------|--------------|
| Starter ($29) | $29 | ~$2.25 (75 inv.) | 92% | $26.75 |
| Pro ($59) | $59 | ~$6.00 (200 inv.) | 90% | $53.00 |
| Growth ($99) | $99 | ~$15.00 (500 inv.) | 85% | $84.00 |

Fixed infrastructure costs remain under $100/month. Contribution-positive from customer #1 at any tier.

---

## Revenue Scenarios

Assuming 50/35/15 split across Starter/Pro/Growth:

| Scenario | Customers | Blended ARPU | MRR | Annual Run Rate |
|----------|-----------|-------------|-----|-----------------|
| Conservative (Month 6) | 25 | $50 | $1,250 | $15,000 |
| Target (Month 6) | 50 | $52 | $2,600 | $31,200 |
| Conservative (Month 12) | 75 | $54 | $4,050 | $48,600 |
| **Target (Month 12)** | **150** | **$56** | **$8,400** | **$100,800** |

The lower entry price drives more trial signups, and natural tier upgrades increase ARPU over time. You need ~150 customers at three-tier pricing to match what ~80 customers at single $99 would deliver, but a $29 entry generates 2-3x more trials.

---

## Key Changes from Current Plan

**1. Entry price drops from $39 to $29.** At launch with zero app store reviews, price parity with known players removes the "why risk the new thing?" objection. Raise to $39 once you have 20+ reviews.

**2. A $59 Pro tier fills the gap.** The $39-to-$99 jump was too steep. Most of the ICP falls in the 50-150 invoices/month range with no tier to match.

**3. Invoice caps increase.** 75 / 200 / 500 (up from 50 / 200). A 50-invoice Starter cap would push most ICP directly to $99 with no middle option.

**4. Annual discount at 20%.** Standard SaaS practice. Reduces churn, improves cash flow. Default the pricing page toggle to annual.

**5. Free trial is usage-based (10 invoices), not time-based.** Every trial user gets Pro-level features. Usage-based aligns with how SMBs process invoices (in batches, not daily). No time pressure means higher quality evaluation and better conversion.

**6. Both platforms (QBO + Xero) on all tiers.** Xero ships with MVP. Gating by platform would create confusing edge cases and put a price barrier in front of Xero users, who are actually the easier conversion (Xero has no native AI extraction). Most SMBs use one platform; dual access doesn't cost us anything extra.

**7. AI GL inference and one-click navigation on all tiers.** These are core product differentiators, not upsell levers. AI GL inference is what makes a $29 Docket Starter objectively better than a $31.50 Dext plan. Gating it would weaken the product story at exactly the tier where competitive positioning matters most.

---

## Pricing Evolution Roadmap

**Phase 1 (Launch, Q3 2026):** $29 / $59 / $99 as proposed. Maximize trials and conversions. Grandfather early customers at launch rates.

**Phase 2 (Month 4-6):** Evaluate tier distribution. If 60%+ land on Starter, consider raising to $39 or adding a feature gate. If Pro dominates, pricing is working.

**Phase 3 (Month 8-12):** Introduce free tier (5-10 invoices/month) as a funnel once conversion data is solid. Raise Growth to $129 if vendor auto-matching proves sticky. Consider $199 Practice tier for bookkeepers.

---

## The Free Tier Question

Not at launch. The 10-invoice usage-based trial serves as the "try before you buy" experience. A persistent free tier would attract tire-kickers who'd be fine with QBO Autofill. Those users churn at 80%+ and generate support load without revenue.

Introduce a free tier at 5-10 invoices/month in Phase 2+, once conversion data tells you whether it's a growth engine or a support cost center. If fewer than 5% of free users upgrade, it's not worth the support overhead. If 10%+, it's a funnel. Need data before making that call.

---

## Bottom Line

$99/mo as the primary price point is too high for a launch-stage product in a market where free and $29 options exist. The $29 / $59 / $99 three-tier structure enters the market at competitive parity, captures the core ICP at the sweet spot, and preserves premium positioning for high-volume users. Unit economics are strong at every tier (85-92% gross margin).

Launch cheap. Prove value. Raise prices when you've earned the right to.
