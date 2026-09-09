# How It Works job tour

The public job lifecycle tour now opens in a compact dialog on `/how-it-works` from the hero, workflow section, and final call to action. Its five tabs are Website, Smart Intake, Qualified Lead, Quote, and Approval & Booking. The last tab includes the connected result.

The dialog uses the shared Broke Pipes Plumbing / Alex Morgan fixture. Quote totals are calculated from its line items and optional valve upgrade. The deposit is $725. Changing the upgrade invalidates the sample signature, deposit and booking. Skipping ahead leaves those actions incomplete. All interactions are local simulations; the only tour network write is the existing anonymous analytics endpoint, using funnel version 2.

Progress uses `lgq_job_lifecycle_v2` in session storage with an in-memory fallback. Opening adds one history entry; tab changes replace it. Back and Escape close the dialog, and reopening resumes. Restart clears the choices. Native modal behavior plus keyboard wrapping keeps focus inside; focus returns to the launcher. The underlying hero pauses while the dialog is open. The panel bundle and QR generator load on demand, and failed panel loads expose Retry and Close.

Old `/demo/tour` URLs redirect to corresponding popup tabs. The old `complete` URL expands the result preview. Recognized `upgrade=0|1` options are preserved, but handoffs start unsigned and unpaid. The demo banner/sidebar no longer launch the tour. The booking preview links to the new approval tab, and the dashboard orientation invitation is suppressed for the read-only public demo.

Verification:

- Targeted Vitest checks cover state invariants, totals, redirects, tour catalog, demo rendering and How It Works regressions.
- `node scripts/verify-job-lifecycle-tour.mjs` verifies the entire sample journey, QR handoff, history, Escape, focus, restart, reload, legacy URLs, blocked storage, lazy-load retry, and all five tabs at 360, 390, 768 and 1280 pixels.
- Browser artifacts are written to the ignored `artifacts/job-lifecycle-tour/` directory. Set `TOUR_BASE_URL` to verify another environment. The harness intercepts its analytics so it does not contaminate the public funnel.
- The old full-page screens, framing, styles and storage provider were removed; server routes remain as compatibility redirects.
