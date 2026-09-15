# Email campaign review — September 9, 2026

Prepared on branch `codex/email-campaign-audit-20260909`, based on locally available `origin/main` at `fd3f3385c`. The Git remote refresh failed because this shell lacked GitHub credentials. No deployment or outbound email was performed. Production database access was read-only.

The revised set contains 10 lifecycle emails and 13 manual campaign presets. Sign-in, support, and dedicated-number application emails also received the platform styling. Customer quotes, invoices, invitations, and reminders retain the contractor’s business identity and selected website theme.

## Findings and changes

| Finding | Prepared change |
| --- | --- |
| Emails used an Austin fallback and the Privacy Policy listed a Boston placeholder. | Use the owner-confirmed `2222 W GRAND RIVER AVE STE A, OKEMOS, MI 48864` from `src/lib/company.ts` across platform emails, shared website footers and alternate homepage footers, Contact, Terms, Privacy, SMS Terms, DPA, and homepage organization metadata. Environment variables cannot override the LGQ address. |
| Onboarding rotated between five unrelated email themes; sign-in/support used blue branding. | One LGQ treatment based on the website’s navy `#07131d`, orange `#ff6a24`, recognizable checkmark, and sans-serif typography. White reading surface, readable orange buttons, inline styles, and table layout. |
| Welcome claimed a published website; several emails promised 2.8× conversion, 22% more value, 92% review usage, $1,200 weekly revenue, or setup in seconds. | Removed unsubstantiated statistics and assumed completion. Explain one practical next step in plain language. |
| Payment emails promised instant/next-day payouts and universal payment methods. | Explain setup, review requirements, and account-dependent methods/timing. Stripe’s payout documentation confirms that schedules and availability vary. [Stripe payouts](https://docs.stripe.com/payouts) |
| Plan emails advertised unlimited usage, obsolete allowances, and a lifetime founder offer. | Direct owners to current Plan & usage details without hard-coded discounts or entitlement promises. |
| Review emails promoted a negative-feedback firewall and guaranteed ranking gains. | Ask for honest feedback without promising a rating, diverting only dissatisfied customers, or guaranteeing search results. This is a copy change; the underlying review workflow was not redesigned. |
| Founder messages promised personal responses and described an unverified roadmap. | A short request for feedback, delivered to the team, without invented promises. |
| Payment and voice CTA tabs were stale. | Payments uses `/dashboard/settings?tab=payments`; voice uses `/dashboard/automations#ai-receptionist`. Quick Stops links to its verified feature guide. |
| Platform broadcasts and the lifecycle sweep preferred the customer reply address. | Resolve the owner login email. Missing owners are skipped instead of guessing another recipient. |
| Free/paid audiences used legacy `accounts.plan` values. | Resolve active Flex or paid membership from `workspace_entitlements`. Plan lookup errors stop the audience calculation. |
| Welcome ignored suppression lookup errors; history and quote lookup failures could be treated as empty results. | Stop rather than send when those checks fail. Exclude suspended/test accounts. |
| A batch approval trusted its saved age, quote count, and recipient email. | Recheck current account age, status, priced quotes, owner identity, suppression, and previous sends immediately before dispatch. |
| Daily runs could send again too soon; retries could duplicate the same step. | Add a 48-hour lifecycle gap, duplicate-account checks, welcome history check, and the same per-account/per-step provider idempotency key across immediate, scheduled, and approved paths. |
| New daily approval cards accumulated while older ones remained pending. | Don’t create another activation batch while one is pending, and don’t create empty batches. Legacy approvals with no prepared recipients now return an error instead of appearing successfully executed. |
| The composer’s initial text was a separate hard-coded feature announcement. | Initialize from the same reviewed preset catalog. Shared onboarding presets use the same content as scheduled emails. |
| Dedicated-number confirmation defaulted to a $49.99 paid receipt and promised approval in 1–3 days. | No invented fee when an amount is missing; show a supplied amount as a listed setup fee and point to payment status. Remove the approval-time guarantee. |

## Sequence and purpose

These are eligibility windows, not a promise that every owner receives every message. Send history, suppression, current milestones, and the 48-hour gap can skip or delay a step. Existing logic can send a missed welcome first to an account up to 45 days old; the new welcome avoids assuming it has just launched.

| Step | Account age | Purpose / destination |
| --- | --- | --- |
| Welcome | Immediate; sweep fallback | Business details, a draft quote, and payment setup → Dashboard |
| First quote | Days 2–4 | Clear scope, price, and next step → Jobs |
| Payment setup help | Days 3–14, incomplete setup | Continue remaining Stripe requirements → Payments |
| Payment education | Days 4–6 | Review online payment setup; skipped after setup help or completed connection → Payments |
| First-quote help | Days 5–15, no priced quote | Build a draft; stop if a priced quote now exists → Jobs |
| Workday organization | Days 7–10 | Check notes, schedule, and team needs → Schedule |
| Customer feedback | Days 10–13 | Review request settings and invite honest feedback → Reviews |
| AI call answering | Days 14–18 | Review availability, settings, and a test call → Automations |
| Plan fit | Days 21–28 | Compare actual usage and costs → Plan & usage |
| Founder check-in | Days 30–45 | Ask for useful feedback → Dashboard / reply |

## Production observations

Read-only queries on September 9 found three pending `batch_activation_nudges` cards, created September 8 at 18:40 UTC and September 9 at 11:00 and 15:08 UTC. Their stored audience fingerprints match. None has a prepared `recipients` array, `stepId`, or `channel`.

The lifecycle event history contains two records: `welcome_day0` on September 1 and `founder_checkin_day30` on September 2. This is an application record of sends, not confirmation of inbox delivery or of the whole campaign being active. No activation-nudge send was found in that history. Current billing entitlements include active Flex, Solo, and Growth rows, which confirms the need to stop using the old free/pro/crew audience labels.

The existing three cards were not altered. Decline the legacy cards and generate a fresh preview after deploying the reviewed changes. Do not treat their displayed contractor count as a verified send list.

## Review artifacts and validation

Run `node scripts/preview-platform-emails.mjs` to generate the complete HTML/plain-text set in `artifacts/email-campaign-review/`. Add `--serve` for the local gallery at `http://127.0.0.1:4187`. These use a synthetic business and a non-production unsubscribe signing key. They import renderers and content only, not sending code.

The gallery has desktop/mobile controls and individual email/plain-text links. Template rendering and send behavior are checked with mocked providers. Validation logs are saved in `C:/dev/email-campaign-audit-tests.log`, `C:/dev/email-campaign-audit-typecheck.log`, and `C:/dev/email-campaign-audit-lint.log`.

Final targeted suite: 193 tests passed across 13 files. ESLint: no warnings or errors. All 23 campaign pages were measured at a 375px browser viewport (360px content width when a vertical scrollbar is present) with no horizontal overflow. Desktop and mobile samples were visually inspected. The preview’s browser tooling emitted a MutationObserver error during iframe automation; the gallery source contains no MutationObserver and direct-page verification succeeded.

TypeScript checking also passed with no errors.

Address correction follow-up: all 46 generated HTML/plain-text email files contain the exact owner-approved address. A further 105 tests across six focused suites passed. Browser verification covered Privacy, Terms, SMS Terms, DPA, Contact, and all four homepage variants: each shows the correct address, with no stale address, error overlay, or horizontal overflow. The current and classic homepage organization metadata also match. ESLint and TypeScript checks passed for the updated code.

## Remaining release checks and limits

- The mailing address was confirmed by the owner on September 9 and centralized across the site and platform emails. Confirm the reply inbox is monitored.
- Preview Gmail, Outlook, and Apple Mail using an authorized test inbox before broad sending. Browser rendering cannot prove inbox rendering, dark-mode transformations, delivery, spam placement, or image loading in every client.
- Provider idempotency lasts 24 hours. The existing account-event writer is best-effort, so this is not a durable exactly-once guarantee after a lost event and a retry outside that window. Parallel sends of different steps are also not serialized by a database claim. A durable delivery outbox is the next reliability improvement. [Resend idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys)
- Lifecycle history and quote scans now stop at a possible 1,000-row truncation instead of guessing eligibility. Paginate these scans before the campaign grows beyond that boundary. Supabase’s default row limit is documented in its [select reference](https://supabase.com/docs/reference/javascript/select).
- The pending-card lookup prevents normal repeat scans, but a database uniqueness constraint would be needed to guarantee a single card under simultaneous scans. It does not clean up existing cards.
- No live campaign, provider test message, deployment, database mutation, or approval execution was performed during this review. The separate activation-autopilot path remains a diagnostic path without a delivery dispatcher.
