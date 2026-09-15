# Legal Review Brief - September 2026

This brief compiles all product surfaces and copy requiring legal review before launch.

## 1. Core Policies
- Terms of Service: `src/app/terms/page.tsx`
- Privacy Policy: `src/app/privacy/page.tsx`
- Data Processing Agreement (DPA): `src/app/dpa/`

## 2. Marketing & Substantiation
- 13 FTC Claims
- FTC Substantiation Register: `docs/ftc-substantiation-register.md`
- AI Inference Tier verification: Confirm with answers from G1 (AI tier checks).

## 3. Disclosures & Consent
- `AI_VOICE_DISCLOSURE` and `RECORDING_DISCLOSURE` in `src/lib/voice/`
- Employee monitoring and crew GPS notices

## 4. Workflows & Output
- Mechanic's Lien / Notice of Intent (NOI) generator
- UPPA (Unauthorized Practice of Public Adjusting) and trade-insurance workflow
- Fee and surcharge logic (Card surcharge, platform fee per state)

## Questions for Counsel

1. **Mechanic's lien and NOI validity:** Are the generated documents valid per state served, given statutory deadlines?
2. **Public-adjusting exposure:** Unlicensed public adjusting is a criminal offense in many states; does the "UPPA-Aligned Workflow" expose us to liability?
3. **Card surcharge and platform fee legality:** What is the legality per state, plus card-network rules if any fee is passed to a cardholder?
4. **All-party-consent recording states:** Is the current disclosure design sufficient for call recording?
5. **Employee monitoring:** Is the employee electronic-monitoring notice sufficient for crew GPS and call recording?
6. **State privacy rights:** (CA, CO, CT, VA) Does the DSAR and 30-day deletion flow satisfy regulations?
7. **ADA and WCAG posture:** We cover contrast (§9 and §10), but not keyboard/screen reader conformance. What is the legal exposure?
8. **The G1 AI tier claim:** (Provide the answer once G1 is completed).
