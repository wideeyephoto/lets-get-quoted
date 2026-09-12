# Client dashboard — executable task list

**Date:** 2026-09-12 · **Baseline:** `a0e6833` · **Verified against** the working tree
on `claude/client-dashboard-improvements-u490hf`.

"Client dashboard" covers the three surfaces a customer or their record lives on:

| Surface | Route | Files | Audience |
| --- | --- | --- | --- |
| **A. Job dashboard** | `/client/jobs/[token]` | [page.tsx](../src/app/client/jobs/[token]/page.tsx) + 19 siblings | homeowner, one job |
| **B. Account portal** | `/portal/view/[token]` | [page.tsx](../src/app/portal/view/[token]/page.tsx) | homeowner, whole history |
| **C. Customer book** | `/dashboard/clients` | [ClientsWorkspace.tsx](../src/app/dashboard/clients/ClientsWorkspace.tsx) + 18 siblings | contractor |

The short version of what the read found: **A is in good shape** — one status, one
next action, sections ordered the way a person decides things, `loading.tsx` and
`error.tsx` both present, two inline styles in 1,012 lines. **B is the weak one** —
it reads like it was written in one sitting and never revisited: 103 inline style
blocks, 28 hardcoded hex colors against a five-theme app, zero aria attributes, no
loading or error boundary, and a referral feature that cannot work. **C works but
does not scale** — it loads every client and every job row on every page view.

Tasks are grouped into waves. Within a wave they are independent unless a
**Depends on** line says otherwise.

**Standing rules for every task below**
- Run `npm run lint` **unpiped** alongside `npm test` and `npm run build`. Piping a
  gate loses its exit code.
- When a task adds a gate, **prove it bites**: reintroduce the defect, watch the test
  fail, revert. A gate that has never failed is not a gate.
- Nothing in Wave 0 or Wave 1 is a refactor. Each one is a thing that is currently
  wrong on a page a homeowner opens from a text message.

---

## Wave 0 — Currently broken or leaking

### T1. The portal referral loop cannot work, end to end
- **Where:** [portal/view/[token]/page.tsx:63](../src/app/portal/view/[token]/page.tsx#L63)
- **What is wrong:** the portal mints its share code with `generateReferralCode()`
  from [src/lib/referrals.ts](../src/lib/referrals.ts), which returns a name-derived
  string like `MARCUS-50`. Intake verifies codes with `referrerFromCode()` at
  [referral.ts:150](../src/lib/referral.ts#L150), whose `CODE_SHAPE` at
  [referral.ts:57](../src/lib/referral.ts#L57) requires exactly 22 chars, a literal
  `.`, then 22 chars. `MARCUS-50` can never match, so `referrerFromCode` returns
  `null` and **every referral arriving from the portal is silently dropped** at
  [book/[subdomain]/actions.ts:275](../src/app/book/[subdomain]/actions.ts#L275).
- **Proof it is a mismatch and not a second design:** the contractor-side card does it
  correctly — [clients/[id]/page.tsx:88-94](../src/app/dashboard/clients/[id]/page.tsx#L88)
  calls `isReferralConfigured()`, `mintReferralCode(accountId, clientId)` and
  `referralLink(bookingUrl, code)`. The portal is the only caller of the other module.
- **Do:** replace lines 63-65 of the portal page with the same three calls. Gate the
  whole referral card on `isReferralConfigured()` — a card that cannot attribute is
  worse than no card.
- **Verify:** a new test that round-trips — `mintReferralCode` → the rendered share
  URL's `ref` param → `referrerFromCode` → the original `clientId`.
- **Effort:** 1 h · **Blocks:** T2, T3.

### T2. Delete `src/lib/referrals.ts`, or make it delegate
- **What is wrong:** two modules one character apart in name (`referral.ts`,
  `referrals.ts`) implementing incompatible code formats. The second is now
  unreferenced once T1 lands, except by its own test.
- **Do:** delete it. If the share-copy helper `buildReferralShareText` is worth
  keeping, move that one function into `referral.ts` and drop the rest
  (`generateReferralCode`, `parseReferralCode`, `calculateReferralDiscount`,
  `DEFAULT_REFERRAL_*` — none of which any route calls).
- **Verify:** `grep -rn "lib/referrals'" src` returns nothing; `npm run typecheck`.
- **Depends on:** T1 · **Effort:** 30 min.

### T3. Retire the test that locks in the bug
- **Where:** [test/portal-referral.test.ts](../test/portal-referral.test.ts)
- **What is wrong:** it asserts `generateReferralCode('Marcus Aurelius') === 'MARCUS-50'`
  and never puts that code through `referrerFromCode`. The suite has been green the
  whole time the feature was dead. This is the more important half of T1: the fix is an
  hour, the reason nobody noticed for weeks is this file.
- **Do:** replace both cases with the round-trip test from T1, plus a case asserting a
  name-shaped code is **rejected** by `referrerFromCode`.
- **Depends on:** T1 · **Effort:** 30 min.

### T4. The `$50 off / $50 credit` promise has nothing behind it
- **Where:** [portal/view/[token]/page.tsx:720](../src/app/portal/view/[token]/page.tsx#L720)
- **What is wrong:** the portal tells a customer, as a firm statement, "Give a neighbor
  **$50 off** their first service … and receive a **$50 credit** on your next project."
  The numbers are module constants at
  [referrals.ts:7-9](../src/lib/referrals.ts#L7). Three separate problems:
  1. **No ledger.** `grep -c "referral_credits\|client_referrals" schema.sql` → `0`.
     There is no table in which a credit could be recorded, so none can be redeemed.
  2. **Not the contractor's offer.** No account-level config sets or consents to it.
     The platform is promising a discount against someone else's revenue.
  3. **A dollar claim to a consumer**, which puts it in scope for
     [docs/ftc-substantiation-register.md](./ftc-substantiation-register.md).
- **Do:** three tasks, in order — (a) drop the specific numbers from the copy now and
  describe the program generically, or hide the card until (b) and (c) land;
  (b) `referral_programs` per account (discount, reward, min spend, enabled) with a
  settings UI; (c) `referral_credits` ledger with issue → redeem → expire, RLS enabled
  and `REVOKE ALL … FROM anon, authenticated` in the same migration.
- **Effort:** (a) 30 min · (b) 4 h · (c) 1 d.

### T5. The job dashboard is indexable
- **Where:** [client/jobs/[token]/page.tsx](../src/app/client/jobs/[token]/page.tsx) exports no `metadata`
- **What is wrong:** the page carries the homeowner's name, street address, scope and
  price. [robots.ts:39](../src/app/robots.ts#L39) disallows only `/dashboard/`,
  `/api/` and `/pay/`. The account portal at least defends itself —
  [portal/view/[token]/page.tsx:21](../src/app/portal/view/[token]/page.tsx#L21) sets
  `robots: { index: false, follow: false }` — and the job page has no equivalent. Any
  route that leaks a token (a referrer header, a shared screenshot, a toolbar that
  phones URLs home) is then eligible for the index.
- **Do:** (a) `export const metadata = { robots: { index: false, follow: false } }` on
  the job page, `/invoice/[id]` and `/pay/[id]`; (b) add `/client/` and `/portal/` to
  the robots.txt disallow list; (c) set `X-Robots-Tag: noindex, nofollow` in
  [middleware.ts](../src/middleware.ts) for those three prefixes, so the header
  protects them even if a page forgets.
- **Verify:** a test asserting each token route renders `noindex` **and** that the
  middleware header is present — the existing
  `test/edge-routing-security-matrix.test.ts` is the natural home.
- **Effort:** 2 h.

### T6. Portal actions have no rate limit
- **Where:** [portal/view/[token]/actions.ts](../src/app/portal/view/[token]/actions.ts)
- **What is wrong:** `sendPortalMessageAction` and `customerTogglePlanAction` check
  only that the token resolves. The token lives 90 days
  ([client-portal.ts:32](../src/lib/client-portal.ts#L32)) and the page itself says
  "anyone who has it can see this." So a leaked link is an unbounded write:
  every message inserts a job-feed event, an `sms_messages` row and fires a
  contractor alert email; every plan toggle mutates the recurring schedule and fires
  another email. The link-**request** path was built with a rate limiter (see the
  header comment in `client-portal.ts`); the link-**use** path was not.
- **Do:** (a) per-token limit on messages (e.g. 10/hour, 30/day); (b) per-account daily
  cap on portal-originated alert emails; (c) a cooldown and an audit row on plan
  toggles — pausing and resuming a plan repeatedly currently rewrites the calendar
  each time with no record of who did it.
- **Verify:** a test driving the 11th message in an hour and asserting no insert.
- **Effort:** 4 h.

### T7. A portal note is written to the database as an inbound SMS
- **Where:** [client-portal-data.ts:725](../src/lib/client-portal-data.ts#L725)
- **What is wrong:** `submitPortalMessage` inserts an `sms_messages` row with
  `direction: 'inbound'` for text typed into a web form. No carrier was involved. Those
  rows are what the messaging surfaces and the deliverability/consent audits read as
  real traffic, so a portal note now looks like a text the customer sent — which
  affects reply-window logic, consent inference and any A2P evidence built off that
  table.
- **Do:** the `PortalMessage` type already carries the right discriminator —
  `channel: 'sms' | 'portal_note' | 'update'`
  ([client-portal.ts:120](../src/lib/client-portal.ts#L120)). Stop writing portal notes
  into `sms_messages`; persist them under their own channel and have the thread view
  union the two sources for display.
- **Verify:** a test asserting a portal message inserts zero `sms_messages` rows, and
  that the thread still renders it.
- **Effort:** 4 h.

### T8. The portal has no loading and no error boundary
- **Where:** `src/app/portal/view/[token]/` contains only `page.tsx`, `actions.ts`,
  `PortalMessageForm.tsx`
- **What is wrong:** the job dashboard ships both
  ([loading.tsx](../src/app/client/jobs/[token]/loading.tsx),
  [error.tsx](../src/app/client/jobs/[token]/error.tsx)). The portal, which is
  `force-dynamic` over eight table reads, ships neither — so a homeowner tapping the
  link from a text gets a white screen for the duration, and Next's default error page
  if any read throws.
- **Do:** add both, mirroring the job page's. The error copy should match the tone
  already set by the expired-link branch at
  [page.tsx:44-59](../src/app/portal/view/[token]/page.tsx#L44) — say what happened and
  what to do, never a stack trace.
- **Effort:** 2 h.

---

## Wave 1 — The portal does not match the rest of the app

### T9. Move the portal onto the theme system
- **Where:** [portal/view/[token]/page.tsx](../src/app/portal/view/[token]/page.tsx) — 103 `style={{…}}` blocks, 28 distinct hardcoded hex values
- **What is wrong:** `globals.css` defines five themes as
  `:root[data-theme='light'|'dim'|'onyx'|'sunlight'|'clarity']`. None of them reach
  this page. Hardcoded `#0f172a` body text, `#f8fafc` panel fills, `#92400e`-on-amber
  badges and `#dcfce7` status chips are painted regardless of theme, so on `dim` or
  `onyx` the customer portal is the one screen in the product that breaks. The job
  dashboard, same audience, uses **two** inline styles in 1,012 lines and reads
  correctly on all five.
- **Do:** lift the VIP membership card, quote cards, plan cards, passport grid,
  document vault and message bubbles into `globals.css` classes built from the existing
  tokens (`--surface-color`, `--surface-subtle`, `--edge-t12`, `--mute-t50`, the
  `--ink-*` ramp). The route already uses `panel workspace-section-card` for its
  wrappers — the work is filling in the parts inside them.
- **Verify:** `grep -cE "#[0-9a-fA-F]{3,6}" src/app/portal/view/\[token\]/page.tsx`
  returns 0, plus a test asserting it stays 0.
- **Effort:** 1 d.

### T10. Give the portal an accessibility pass
- **What is wrong:** `grep -c "aria-"` on the portal page → `0`. Concretely: status is
  carried by color alone on every chip; the emoji that do the labelling work (⚡, 📅,
  🔧, 📷, 💳, 🔄) are announced as content; the message thread is a plain `div` stack
  with no `role="log"`; nine sections have no landmarks; the 340px-tall scrolling
  thread is not keyboard reachable.
- **Do:** `aria-hidden="true"` on decorative emoji and a real text label beside every
  colored chip; `role="log"` + `aria-live="polite"` on the thread; `aria-labelledby`
  per section against its existing `<h2>`; `tabindex="0"` on the scroll region;
  visible focus rings from the platform styles rather than inline.
- **Verify:** axe-core pass on a seeded portal; manual tab traverse to every action.
- **Effort:** 1 d · **Depends on:** T9 (the chips move in that task).

### T11. Add navigation — the portal is one 750-line scroll
- **What is wrong:** eleven stacked sections (hero → VIP → invoices → quotes → plans →
  passport → history → documents → messages → warranties → receipts → referral) with
  exactly one anchor in the whole page, `#portal-message-section`. On a phone, a
  customer looking up a warranty scrolls past their entire financial history to reach
  it.
- **Do:** a sticky jump nav, or better, turn the existing quick-metrics row at
  [page.tsx:96](../src/app/portal/view/[token]/page.tsx#L96) into the page's index —
  cards that count and link ("2 quotes to review", "3 documents", "1 warranty"). Give
  each section an `id`. Collapse work history and receipts behind a `<details>` once
  they exceed five rows.
- **Effort:** 1 d.

### T12. Fix the message thread
- **Where:** [page.tsx:576](../src/app/portal/view/[token]/page.tsx#L576) — `portal.messages.slice(0, 15)`
- **What is wrong:** hard cap of 15 with no "load older", a fixed 340px scroll box, no
  unread state, no read receipts, and no realtime — a contractor's reply appears only
  when the customer happens to reload. For the section the page calls the
  "Communication Center", that is a one-way channel with extra steps.
- **Do:** paginate (cursor on `createdAt`); unread count driven off a
  `last_read_at` on the portal access row; subscribe to inserts (Supabase realtime is
  already in use elsewhere in the app); optimistic append on send so the customer sees
  their own message land.
- **Effort:** 1 d · **Depends on:** T7 (the message source changes shape).

### T13. Substantiate or remove the membership dollar claim
- **Where:** [membership-tiers.ts:337](../src/lib/membership-tiers.ts#L337), rendered at
  [page.tsx:159-163](../src/app/portal/view/[token]/page.tsx#L159)
- **What is wrong:** the portal prints "ESTIMATED ANNUAL VALUE +$X/yr" in green from
  `(benefits.discountPercentage * 18) + (included * 149) + (freeFilterReplacements * 25)`.
  The first term multiplies a percentage by 18 and calls the result dollars; 149 and 25
  are unsourced. It is a specific dollar figure shown to a consumer, computed from
  invented constants.
- **Do:** either derive it from that account's real prices (average ticket × discount +
  the tune-up's actual configured price), or replace the number with the benefits
  themselves, which are true and already listed right beside it. If it stays, register
  the basis in [docs/ftc-substantiation-register.md](./ftc-substantiation-register.md).
- **Effort:** 4 h.

---

## Wave 2 — Performance

### T14. Parallelize the job dashboard's reads
- **Where:** [client/jobs/[token]/page.tsx:108-175](../src/app/client/jobs/[token]/page.tsx#L108)
- **What is wrong:** roughly nine database round trips run one after another —
  `getClientJobDashboard`, `resolveJobAccess`, change orders, warranties, signed
  warranty URLs, `sites`, selections, form submissions, insurance, then the signature
  read. Only two of those orderings are real: everything needs `access` first, and the
  narrow signature read depends on the wide one failing.
- **Do:** one `Promise.all` for the eight independent reads after `resolveJobAccess`
  resolves. Keep the `readSignature` fallback sequential — the second read is
  conditional on the first's error, and that fallback exists because the signature
  columns ship behind their own migration.
- **Verify:** count the awaits before and after; time the page against a seeded job.
- **Effort:** 2 h.

### T15. Stop loading the entire customer book on every view
- **Where:** [dashboard/clients/page.tsx:26](../src/app/dashboard/clients/page.tsx#L26) → [clients.ts:85](../src/lib/clients.ts#L85)
- **What is wrong:** `listClientsWithStats` defaults `fetchAll` to `true`, and
  `fetchAllPages` then loops until **every** `clients` row — `select('*')`, all columns
  — and **every** `jobs` row for the account is in memory. The per-client stats are
  then computed in JS, and the whole book is serialized into the client component
  [ClientsWorkspace.tsx](../src/app/dashboard/clients/ClientsWorkspace.tsx), which
  filters and sorts it in the browser. At 5,000 customers that is a multi-megabyte
  payload and a visible hydration stall; search cannot find anyone who is not already
  in the payload.
- **Do:** (a) aggregate the stats in SQL — a view or RPC returning
  `jobCount/totalValue/lastJobAt/nextJobAt/unscheduledJobs` per client, which removes
  the second full-table read entirely; (b) select only the columns
  [toClientRows](../src/lib/client-rows.ts) actually reads; (c) server-side search,
  sort and pagination, with the current client-side path kept for the first page;
  (d) virtualize the list once (c) lands.
- **Note:** `clientPins` is already correct here — one query for the whole book's
  coordinates, as its comment says. This task is about the other two reads.
- **Effort:** 2-3 d.

---

## Wave 3 — Gaps worth closing

Ordered by what a customer notices first.

### T16. Appointment self-service
The portal shows `nextRunDate` as plain text. No reschedule, no cancel, no add-to-
calendar, no link to live ETA — despite [/features/live-eta](../src/app/features/live-eta)
and [/features/eta](../src/app/features/eta) being live marketing pages. An `.ics`
download and a reschedule request are each half a day and remove a phone call per job.

### T17. Pay from the portal, not one invoice at a time
`/portal/view` links out to `/invoice/[id]` per invoice
([page.tsx:210](../src/app/portal/view/[token]/page.tsx#L210)). There is no pay-all, no
stored card, no autopay enrollment — while the job dashboard has a full payment-plan UI
with deposits, installments, payoff and financing
([page.tsx:572-645](../src/app/client/jobs/[token]/page.tsx#L572)). The account-level
view of the same customer has none of it.

### T18. An account-level "needs you" queue
Change orders, selections, warranty acknowledgements and completion certificates are
reachable **only** from the per-job link. A customer who bookmarked the portal instead
of the job link cannot see that something is waiting for their signature. Surface the
same items on the portal, linking into the job page to act.

### T19. Document vault usability
A flat `auto-fill minmax(240px)` grid of every document ever
([page.tsx:511](../src/app/portal/view/[token]/page.tsx#L511)) with no filter by job,
kind or date, no search, and no bulk download. Fine at 6 documents, unusable at 60.

### T20. Let the homeowner maintain their own passport
The equipment cards render brand, model, serial and filter size read-only
([page.tsx:429](../src/app/portal/view/[token]/page.tsx#L429)). The homeowner is the
one standing next to the unit. Let them add a photo, correct a serial, or add equipment
the contractor never touched — that is the data moat the passport is for.

### T21. Spanish
Zero i18n on any of these routes. For a homeowner-facing surface in the trades this is
a conversion item, not a nicety. Start with the job dashboard: it is the page that
carries an approval decision, and it is 20 strings plus the shared components.

### T22. Instrument the portal
No analytics events on open, section engagement, referral share, message send or
document view. None of T9-T21 can be prioritized by evidence or shown to have worked
until this exists. Do it early, not last.

### T23. Consolidate `/client/*` and `/portal/*`
[client/portal/route.ts](../src/app/client/portal/route.ts) is a 307 to `/portal`,
which is the tell: one concept, two URL families, and `/client/jobs/[token]` vs
`/portal/view/[token]` are the same customer in two namespaces. Pick one, redirect the
other permanently, and keep every existing token link working — those live in text
messages people do not delete.

---

## Suggested sequencing

| Wave | Contents | Why now |
| --- | --- | --- |
| 0 | T1-T8 | Each is currently wrong in production. T3 and T5 are the two that could have been caught by a test and were not. |
| 1 | T9-T13 | The portal is the only screen in the product that breaks under four of five themes. |
| 2 | T14-T15 | T14 is two hours for a measurable win. T15 is the only item here that gets worse on its own as accounts grow. |
| 3 | T16-T23 | Do T22 first within this wave, so the rest can be ordered by data. |

**One-day cut, if that is all there is:** T1 + T3 (referrals work, and stay working),
T5 (stop indexing homeowner addresses), T8 (no more white screen), T14 (faster job
page). Four items, all small, all on the path a customer actually walks.
