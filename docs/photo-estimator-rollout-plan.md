# Photo Estimator Rollout Plan

## Phase 6: Pilot with Contractors and Expand by Trade

### Initial Rollout Strategy
1. **Target Audience**: Limited rollout to 5-10 trusted contractors.
2. **Initial Trades**: Roofing, Landscaping, and General Repair. These trades typically have clear, visual defects (e.g., missing shingles, overgrown brush, damaged drywall) that the Gemini 2.5 Flash model detects accurately.
3. **Feature Flag**: 
   - A `photo_estimator_enabled` flag (boolean) can be added to the `accounts` or `features` table.
   - For now, we can check for this flag in the UI (e.g., hiding the "Estimate from Photos" button for non-pilot accounts).
4. **Unsupported Trades**: 
   - Restrict access to the estimator for trades like Plumbing or Electrical where defects are often hidden behind walls or require specialized diagnostic tools.
   - Display a "Coming Soon for [Trade]" message or hide the button.

### Feedback Loop
1. **Pilot Contractor Interviews**: Conduct bi-weekly check-ins to ask:
   - "How often did you have to delete the AI's suggested line items?"
   - "Did the cost estimates align with your actual price book?"
   - "Did the AI hallucinate damage?"
2. **Prompt Adjustments**: Use feedback to fine-tune the `system_instruction` in `src/lib/multimodal-defect-estimator.ts`. We can even add trade-specific prompt branches if needed (e.g., "If trade is Roofing, pay special attention to X").

### Expansion
- Once the false positive rate drops below an acceptable threshold (e.g., 5%), roll out to all accounts in the initial trades.
- Gradually add support for other trades by testing them internally using the Accuracy Loop (see `photo-estimator-manual-evaluation.md`) before opening them up to the pilot group.
