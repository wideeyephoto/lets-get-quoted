# Claims Substantiation & Compliance Register

See the full authoritative register at [docs/ftc-substantiation-register.md](./ftc-substantiation-register.md).

## Quick Summary of Invariants

1. **All quantified claims** (2.8x win rate, 22% tier uplift, <60s estimates, 30% missed calls) are grounded in published industry benchmarks and technical product truths.
2. **All pricing & plan tiers** ($39 Solo, $129 Growth, $329 Scale, platform fees down to 0.25%/0.10%) are strictly bound to Stripe Live catalog IDs and `src/lib/billing/catalog.ts`.
3. **All marketing emails** carry RFC 8058 `List-Unsubscribe` headers, valid physical postal addresses, and fail-closed suppression.
4. **All telephony and AI voice calls** enforce mandatory automated AI and recording disclosures before audio capture.
5. **No 100% guarantee or 100% compliance claims** are permitted without strict factual boundaries.
