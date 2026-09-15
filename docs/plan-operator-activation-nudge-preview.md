# Plan: Preview + working send for the Operator "Activation Nudges" card

**Question asked:** is the previewed message email or text?

**Answer: email.** There is no platform-to-contractor SMS rail anywhere in this repo. The only
wired sender for this nudge is Resend, via `src/lib/contractor-lifecycle-emails.ts`, step
`nudge_zero_quotes`. The card's "SMS/email" wording is aspirational and should be corrected.

Everything below is what has to change for that preview to be *truthful* — for the thing it
previews to be the thing that would actually be sent, to the people who would actually get it.

---

## 0. What production actually says today

Read live 2026-09-09, read-only queries against `DATABASE_URL`:

| Fact | Value |
|---|---|
| Pending HITL rows | 3 x `batch_activation_nudges`, all `pending` |
| Card audience (`connect_onboarded = false`, `test_marker is null`) | 4 accounts |
| Their ages | 13, 42, 51, 55 days |
| Their quoted-job counts | **0, 249, 1, 166** |
| Lifecycle emails ever sent, all time | 2 (both to `brett.arnold@live.com`) |
| `email_suppression` rows | 0 |

Resolved recipients for those 4 accounts, via `owner_emails_for_accounts`:

| Account | Owner email | Quotes | What would happen |
|---|---|---|---|
| `6a7a51ae` My Business | `test-contractor@example.com` | 0 | blocked — `example.com` is a placeholder domain in `email-quality.ts` |
| `7caf66e2` BIGFATPIPEGUYS2 | `hello@letsgetquoted.com` | 249 | blocked — `hello` is a ROLE_LOCAL, and it is our own From address |
| `831ab32c` My Business | `chelsealandry@gmail.com` | **166** | **delivers** |
| `c7632694` All is Bright Lighting | `null` | 1 | blocked — no address |

**So the one and only human who would receive "We noticed you haven't sent an estimate yet" is
on an account with 166 estimates.** That is the headline defect, and it is not a preview
problem — the preview would faithfully render a correct email aimed at the wrong person.

---

## 1. Root causes (four, independent)

**1a. The audience query is wrong.** The card is built from `getNotOnboardedAccounts()`
([admin-alerts.ts:146-159](../src/lib/admin-alerts.ts#L146-L159)), which selects
`connect_onboarded = false` — *Stripe Connect not finished*. It has no age filter and no quote
filter. The card title and body claim "signed up recently without sending quotes." Neither
clause is enforced by the query.

**1b. Nothing executes.** `batch_activation_nudges` has no `case` in
[engine.ts:381-503](../src/lib/ai-operator/engine.ts#L381-L503), so it falls to `default:` and
calls `executeOperatorTool('batch_activation_nudges')`, which returns
`{ error: 'Unknown operator tool' }` ([tools.ts:571-576](../src/lib/ai-operator/tools.ts#L571-L576)).

**1c. The failure is reported as success.** `executeHitlDecision` never inspects the tool
result — it marks the action `approved` and returns `success: true` regardless, so the cockpit
banner reads *"Action approved and executed successfully"*
([OperatorCockpit.tsx:167](../src/app/admin/operator/OperatorCockpit.tsx#L167)). This is the same
class of defect the codebase already fixed twice, in `recordNudge` and in
`trigger_contractor_lifecycle_nudge`, both of which were deliberately made to fail loudly.

**1d. No dedupe on card creation.** `createHitlAction` always mints `hitl-<uuid>`
([audit.ts:329](../src/lib/ai-operator/audit.ts#L329)), so every RevOps scan inserts another
identical row. Hence the three stacked cards in the screenshot.

---

## 2. Decisions to make first

| # | Decision | Recommendation |
|---|---|---|
| D1 | Does Approve actually send, or stay dark? | Wire it, gated behind `ACTIVATION_NUDGE_SEND_ENABLED`. Preview works with the flag off. |
| D2 | One card or two? | **Split.** The `connect_onboarded = false` audience is real — it just needs the `nudge_incomplete_stripe` email, not the quote one. Two card types, two step ids. |
| D3 | Age window for the manual card | Do not reuse the cron's 5-15 days. The card exists precisely to reach accounts the cron's gates skipped. No upper bound; show age in the preview instead. |
| D4 | Require `welcome_day0` first, as the cron does? | **No**, for the manual card. Exactly one account in the whole database has `welcome_day0`; that precondition is why the drip has sent 2 emails in its lifetime. |
| D5 | SMS ever? | Out of scope. Needs a new platform-to-contractor sender, TCPA consent capture, and 10DLC campaign registration — none of which exist. |

---

## 3. Stages

### Stage 0 — Retire the 3 stale cards
They name an audience the new code will not use. Expire them rather than leaving rows a future
Approve could fire against.

- One-off `UPDATE` setting `status = 'expired'` on the 3 pending `batch_activation_nudges` rows
  in `ai_operator_action_requests`.
- Verify: `select action_type, status, count(*) ... group by 1,2` returns zero pending.

### Stage 1 — Correct the audience (P0)
**File:** `src/lib/admin-alerts.ts`

Add `getZeroQuoteActivationCandidates(admin, opts)` returning accounts where:

- `test_marker is null` **and** `business_name` does not match the E2E/webhook fixture patterns
  (see Stage 7 — `test_marker` is null on all 11 accounts, including `Webhook test *` and
  `E2E Leads-Jobs *`, so that filter currently guards nothing);
- zero rows in `jobs` with `quoted_amount > 0`;
- `created_at` within the configured window.

**File:** `src/lib/ai-operator/revops.ts` (~lines 82-95) — build the card from this function.
Keep the existing `getNotOnboardedAccounts` result for a separate `batch_stripe_connect_nudges`
card (D2).

**Test:** an account with 166 quoted jobs must never appear in the zero-quote candidate set.
That single assertion is the whole point of this stage.

### Stage 2 — Resolve recipients at queue time, store them in the payload
**File:** `src/lib/ai-operator/revops.ts`

Today the payload is just `accountIds`, so recipient resolution, suppression and mailability
would all happen at execute time — meaning the preview and the send could disagree. Store the
resolved set instead:

```ts
payload: {
  stepId: 'nudge_zero_quotes',
  channel: 'email',
  generatedAt: <iso>,
  recipients: [{ accountId, businessName, email, ageDays, quotedJobs }],
  skipped:    [{ accountId, businessName, reason }],  // no_email | not_mailable | suppressed | already_sent
}
```

Reuse `ownerEmailsForAccounts`, `isMailable`, and the `email_suppression` lookup — the same
three gates `runContractorLifecycleSweep` already applies, so the preview inherits the real
rules rather than re-implementing them.

### Stage 3 — The preview itself
**New server action** in `src/app/admin/operator/actions.ts`:

```ts
export async function previewHitlActionMessageAction(actionId: string):
  Promise<{ success: boolean; channel: 'email'; subject: string; fromAddress: string;
            replyTo: string; recipients: [...]; skipped: [...]; html: string; error?: string }>
```

- `requirePermission('ops.manage')`, then `getHitlActionByIdAsync`.
- Look up the step in `CONTRACTOR_LIFECYCLE_STEPS` and render via the **existing**
  `renderContractorLifecycleEmailHtml(step, recipient)`
  ([contractor-lifecycle-emails.ts:226](../src/lib/contractor-lifecycle-emails.ts#L226)). Do not
  build a parallel renderer, or the preview stops being evidence of anything.
- Render against the **first real recipient**, not a fake sample. `{{first_name}}` degrades to
  "there" and `{{business_name}}` to their business name — exactly what they will receive.
- Return `from` = `process.env.SYSTEM_EMAIL_FROM || "Let's Get Quoted <hello@letsgetquoted.com>"`
  and `replyTo` = `step.replyTo`, so the preview shows the real envelope.

**UI** in `OperatorCockpit.tsx` and `OperatorCockpit.module.css`:

- A `Preview message` button in `.hitlActions`, beside Approve and Decline.
- Modal reusing the existing `.modalOverlay` / `.modalContent` classes — already in the CSS and
  already used at [OperatorCockpit.tsx:635](../src/app/admin/operator/OperatorCockpit.tsx#L635).
- Body: `<iframe srcDoc={html} />`, mirroring
  [AdminCampaignComposer.tsx:676](../src/app/admin/campaigns/AdminCampaignComposer.tsx#L676). An
  iframe, not `dangerouslySetInnerHTML` — the email HTML carries its own `<style>` and will
  otherwise bleed into the admin page.
- Header strip: **Channel: Email · From · Reply-to · Subject · N recipients**.
- Two tables: *Will receive* (business, email, age, quote count) and *Will be skipped*, with the
  reason per row. The skip table is what makes the preview worth having — it is where "3 of your
  4 contractors get nothing" becomes visible before you click Approve.

### Stage 4 — Make Approve actually send
**File:** `src/lib/contractor-lifecycle-emails.ts` — new export:

```ts
export async function sendActivationNudgeBatch(
  admin: SupabaseClient,
  input: { stepId: ContractorLifecycleStepId; recipients: [...]; dryRun?: boolean },
): Promise<{ sent: number; skipped: number; errors: number; details: [...] }>
```

Must reuse, not reimplement: `isMailable`, the fail-closed `email_suppression` read,
`buildUnsubscribeOneClickUrl` + `listUnsubscribeHeaders`, `renderContractorLifecycleEmailHtml`,
Resend `tags`, and `recordAccountEvent({ kind: 'contractor_lifecycle_email_sent', meta.step_id })`.

That last one is load-bearing: it is the same ledger the cron reads to build `sentStepMap`, so a
manual send automatically suppresses the cron's duplicate.

Re-check suppression and already-sent **at execute time** as well as preview time — a card can
sit in the queue for days.

**File:** `src/lib/ai-operator/engine.ts` — add `case 'batch_activation_nudges'` before
`default:`, calling the above with `dryRun: !flagEnabled`.

**File:** `src/lib/ai-operator/audit.ts`

- `permissionForHitlAction`: map `batch_activation_nudges` to `'account.support'`, matching the
  existing `trigger_contractor_lifecycle_nudge` and `send_onboarding_reminder` entries. Without
  this it defaults to `ops.manage`, and any ops admin can mass-email contractors.
- Add `batch_activation_nudges` to `REQUIRES_APPROVAL_ACTION_TYPES` so autonomous remediation can
  never pick it up.

### Stage 5 — Stop reporting failures as successes
**File:** `src/lib/ai-operator/engine.ts` (~lines 490-530)

After the switch, inspect the result. If the action type hit `default:` and came back
`Unknown operator tool`, or the tool returned `success: false` / `error`, then **do not** resolve
the action to `approved` — return `{ success: false, error }` and leave it pending.

**File:** `OperatorCockpit.tsx`, `handleResolveAction` (line 160) — currently sets a banner only
when `res.success` and silently swallows the rest. Add the `else` branch that surfaces
`res.error` as an error banner, and do not remove the card from the list on failure.

Worth doing independently of everything else: it is why the queue looked functional.

### Stage 6 — Dedupe card creation
**Files:** `src/lib/ai-operator/audit.ts`, `revops.ts`

Either give the card a deterministic id (`hitl-batch_activation_nudges-<YYYY-MM-DD>` plus
`insert ... on conflict (id) do nothing`), or have `runRevOpsGrowthScan` check for an existing
`pending` row of the same `action_type` before calling `createHitlAction`. Prefer the
deterministic id — it also survives the in-memory/DB dual-store split.

### Stage 7 — Close the fake guard
All 11 production accounts have `test_marker = null`, including `Webhook test ea923c32`,
`Webhook test 89bbe850`, `E2E Leads-Jobs 4f691e58` and `E2E Leads-Jobs d633b816`. Every audience
query in this path filters on `test_marker` and therefore filters nothing.

Either backfill `test_marker` on the fixture accounts (preferred — it fixes every caller at once)
or add an explicit name-pattern exclusion. Do this **before** the flag goes on.

### Stage 8 — Copy
`revops.ts:88-90`: "targeted SMS/email guidance" becomes "targeted onboarding **email**".
Retitle to match the corrected audience. The description should state the step id, so the card
and the preview are obviously the same thing.

### Stage 9 — Tests
Extend `test/ai-operator.test.ts` and `test/contractor-lifecycle-emails.test.ts`:

1. Audience: an account with quoted jobs > 0 is never a zero-quote candidate.
2. Preview returns `channel: 'email'` and a `subject` byte-identical to
   `interpolateTokens(step.subject, recipient)` — assert the call, not the symbol.
3. Preview `skipped[]` contains a suppressed address, a role address, and a placeholder domain,
   each with its own distinct reason.
4. Approve with the flag **off** sends nothing and reports `dryRun: true`.
5. Approve with the flag on calls the Resend mock exactly `recipients.length` times.
6. An unknown `actionType` leaves the action `pending` and returns `success: false` — the Stage 5
   regression.
7. A second approve of the same card sends zero, via the already-sent ledger check.

### Stage 10 — Rollout order
1. Stages 0-3, 5, 6, 8 ship first. Preview is live; Approve is honest about doing nothing.
2. **Look at the preview.** Confirm with your own eyes who is in the recipient table.
3. Stage 7 backfill.
4. Stage 4 merges with `ACTIVATION_NUDGE_SEND_ENABLED` absent, so it dry-runs.
5. Turn the flag on **and redeploy** — Vercel bakes env at build time, so a flag alone changes
   nothing.
6. On the first real approve, watch `account_events` for `contractor_lifecycle_email_sent` and
   the Resend dashboard for the message id.

---

## 4. Files touched

| File | Change |
|---|---|
| `src/lib/admin-alerts.ts` | new `getZeroQuoteActivationCandidates` |
| `src/lib/ai-operator/revops.ts` | correct audience, resolved-recipient payload, copy, dedupe |
| `src/lib/ai-operator/audit.ts` | permission map, approval set, deterministic id |
| `src/lib/ai-operator/engine.ts` | `batch_activation_nudges` case; honest failure handling |
| `src/lib/contractor-lifecycle-emails.ts` | new `sendActivationNudgeBatch` |
| `src/app/admin/operator/actions.ts` | new `previewHitlActionMessageAction` |
| `src/app/admin/operator/OperatorCockpit.tsx` | Preview button, modal, error banner |
| `src/app/admin/operator/OperatorCockpit.module.css` | preview modal and recipient table styles |
| `test/ai-operator.test.ts`, `test/contractor-lifecycle-emails.test.ts` | the 7 assertions above |

No migration required — `ai_operator_action_requests` already has `execution_result` and
`executed_at`, and `payload` is `jsonb`.

## 5. Gates before "done"

`npm run lint`, `npx tsc --noEmit` (delete `.next/types` first), `npm test` — each run directly,
never piped, so the exit code survives. Then `npm run build`.
