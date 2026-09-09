# SMS send previews — fix plan

**Audited 2026-09-09.** Scope: every place in the dashboard where a human press
causes an outbound SMS. The question asked was "which send locations do not show
an appropriate preview of the text?" — 22 do not, and 4 more show a preview that
does not match what is sent.

Ordered by blast radius, not by effort. Each task states the defect, the fix, and
the test that has to exist afterwards, because three of these defects are
currently sitting behind a green suite.

---

## The rule this plan enforces

`src/lib/sms-templates.ts` already states it at the top: **a preview is built by
the same function the sender calls, never transcribed.** Four messages have been
rescued from hand-typed previews already. Everything below is either a site that
never got a preview, or a site that got a transcribed one.

Two corollaries that the current code breaks:

1. The preview must render the **envelope** — business-name prefix, opt-out line,
   link — not just the part the owner typed. Otherwise the preview understates
   both the wording and the segment count.
2. The **composition** must be tested, not just the leaf builder. Two of the
   defects below have passing unit tests on the wrapper function and no test on
   the pipeline that calls it twice.

---

## P0 — wrong text goes out, or money is requested unpreviewed

### 1. Lead private text sends a doubled business-name prefix

- **Where:** `src/app/dashboard/leads/text-actions.ts:169`
- **What happens:** `formatPrivateSmsText` returns `"Acme: hello"`
  (`src/lib/dashboard-sms-dispatch.ts:56`), and that string is handed to
  `sendInboxReplySms`, which applies `inboxReplyText` — `${businessName}: ${body}`
  (`src/lib/sms-templates.ts:486`). The customer receives **`Acme: Acme: hello`**.
  Every plain message is doubled; only a body that already names the business
  escapes, via the guard inside `formatPrivateSmsText`.
- **Why it is green:** `test/dashboard-sms-dispatch.test.ts` asserts
  `formatPrivateSmsText` in isolation, including the no-duplicate case. Nothing
  tests the two functions composed. The inbox's own compose path
  (`src/app/dashboard/messages/actions.ts:85`, `:436`) passes a raw body, so the
  bug is unique to the lead modal and invisible from the inbox.
- **Fix:** pass `cleanBody` to `sendInboxReplySms` and delete the
  `formatPrivateSmsText` call from this action. The envelope belongs to exactly
  one function.
- **Decide:** whether `formatPrivateSmsText` has any remaining caller. If not,
  delete it and fold its "already mentions the business" guard into
  `inboxReplyText`, so there is one prefixing rule in the codebase instead of two.
- **Test:** a composition test driving `sendLeadPrivateSmsAction` (or at minimum
  `formatPrivateSmsText` → `inboxReplyText`) asserting the business name appears
  exactly once.

### 2. Milestone stage payments ask for money with no preview

- **Where:** `src/app/dashboard/jobs/[id]/Milestones.tsx:224` — `sendSms`
  checkbox, **default-checked**, then `requestMilestonePaymentAction`
  (`src/app/dashboard/jobs/[id]/milestone-actions.ts:212`) fires
  `payment_requested`.
- **What is missing:** nothing on screen shows
  `paymentText({ eventType: 'payment_requested' })`. The deposit form higher up
  the same page renders `PaymentPreview`
  (`src/app/dashboard/jobs/[id]/PaymentPreview.tsx`) — built for precisely this
  reason, with the invoice tab, the SMS tab, and the segment counter. The
  milestone form was never wired to it.
- **Fix:** render `PaymentPreview` inside the milestone request form, bound to
  the milestone's amount and label. It already takes a `formId`; no new component
  is needed.
- **Test:** extend `test/payment-preview.test.ts` to cover the milestone amount
  and label path, plus a guard asserting the milestone form contains a preview
  node.

### 3. "Serve Notice via SMS" texts something other than the notice

- **Where:** `src/app/dashboard/payments/PaymentModals.tsx:2640`
- **What happens:** the modal renders a statutory NOI document preview, then
  calls `sendPaymentReminderAction`, which is hardcoded to `payment_requested`
  (`src/app/dashboard/payments/actions.ts:182`). The homeowner receives
  *"Acme requested a payment of $X. Pay securely: …"* — no notice, no statutory
  language. The toast then claims "Statutory NOI notice dispatched via SMS &
  registered."
- **Fix, in order:**
  1. Decide whether an NOI is legitimately deliverable by SMS at all, or whether
     this button should only generate and record the document.
  2. If it stays: add an `noi_notice` event type with its own builder in
     `sms-templates.ts`, preview it in the modal beside the document, and stop
     reusing the payment-request body.
  3. If it goes: remove the SMS button and the claim in the toast.
- **Test:** assert the NOI path does not emit a `payment_requested` body.

### 4. "SMS sent with link for customer to update card" sends no such link

- **Where:** `src/app/dashboard/payments/FailedPaymentsRecoveryPanel.tsx:31-34`
- **What happens:** same `sendPaymentReminderAction`, same `payment_requested`
  body. `cardUpdateText` (`src/lib/sms-templates.ts:425`) exists, is the correct
  copy for a declined card, and is not called here.
- **Fix:** route this button through the `card-update` event, and preview the
  body in the panel. Correct the success toast to match whichever body is
  actually sent.
- **Test:** assert the failed-payment recovery path emits `card-update`, not
  `payment-requested`.

### 5. Batch overdue reminders fan out with no text on screen

- **Where:** `src/app/dashboard/payments/ReceivablesAgingBoard.tsx:58-62`
- **What happens:** `confirm()` states the count, never the wording, then
  `batchSendOverdueRemindersAction` texts every overdue customer.
- **Fix:** show the composed body once (the copy is identical per recipient
  except amount and label) plus the recipient count and total segment cost, in a
  real dialog rather than `window.confirm`.
- **Test:** guard that the batch control renders a preview node.

---

## P1 — preview exists but lies

### 6. TextCustomerModal's shared-lane preview is a hardcoded string

- **Where:** `src/components/leads/TextCustomerModal.tsx:145-152`
- **Preview shown:** `"[Your Business Name] here — view your project portal and
  next steps: https://letsgetquoted.com/client/jobs/… Reply STOP to opt out."`
- **Actually sent** (`src/lib/dashboard-sms-dispatch.ts:50`):
  `"Acme: Hi Karen, here is your project portal and next steps (Review Project &
  Next Steps): <url> Reply STOP to opt out."`
- Different opener, a greeting the preview omits, and a parenthetical it drops
  entirely.
- **Fix:** call `formatClientDashboardSmsText` in the component with the real
  business name and a sample link.
- **Also decide:** there are now two unrelated builders for the same message —
  `clientJobDashboardText` (`src/lib/sms-templates.ts:294`, used by
  `sendClientJobDashboardSms`) and `formatClientDashboardSmsText` (used by the
  lead modal). Collapse to one, or document why the lead lane differs.
- **Test:** assert the preview string equals the builder output.

### 7. Catalogue transcribes `quick-stop-status`

- **Where:** `src/lib/sms-catalogue.ts:594` shows
  `withOptOut(SAMPLE.business + ' is on the way to you now.')`
- **Actually sent:** `"Your Quick Stop technician is on the way."`
  (`src/app/dashboard/quick-stops/actions.ts:213`), `"Your technician has
  arrived."` (`:246`), `"Quick Stop update: Your technician is approximately N
  minutes away."` (`:266`).
- This is the one entry in the file that breaks the file's own stated rule.
- **Fix:** lift the three inline literals into `quickStopStatusText(kind, …)` in
  `sms-templates.ts`, call it from the actions, and call it from the catalogue.
- **Test:** a guard that every `SmsCatalogueEntry.body` is produced by a function
  imported from a template module — no string literals in the `body` position.
  This is the test that would have caught it and will catch the next one.

### 8. `declineTextPreview` is a hand-typed copy

- **Where:** `src/app/dashboard/leads/[leadId]/LeadTriageActions.tsx:17`
- Currently matches `leadDeclineText` (`src/lib/sms-templates.ts:366`) character
  for character. Nothing is wrong today; it is the drift shape, unguarded, and
  the comment above it even says it "mirrors" the sender.
- **Fix:** import `leadDeclineText` and delete the local copy.
- **Test:** covered by task 7's guard if that guard scans preview sites and not
  only the catalogue.

---

## P2 — no preview at all

Same fix shape for all of these: render the real builder's output next to the
control, with recipient and segment count.

| # | Site | File | Message |
|---|------|------|---------|
| 9 | Instant pay link, default-checked SMS box | `payments/PaymentModals.tsx:896` | `paymentText` / `payment_requested` |
| 10 | "SMS Receipt" one-click | `payments/PaymentModals.tsx:2016` | `paymentText` / `payment_paid` |
| 11 | "Deliver Waiver to Owner" | `payments/PaymentModals.tsx:3215` | `lienWaiverText` |
| 12 | "Resend link" / "Resend payment link" | `recurring/page.tsx:107`, `:193` | `cardSetupText` |
| 13 | `remindNextVisitAction` | `recurring/actions.ts:228` | `appointmentReminderText` |
| 14 | Quick Stop ETA button | `quick-stops/QuickStopRequestCard.tsx:236` | inline literal |
| 15 | Quick Stop en route / arrived | `quick-stops/actions.ts:213`, `:246` | inline literals |
| 16 | "Send Dates to Client" | `leads/[leadId]/LeadAvailabilityScheduler.tsx:369` | `leadQuoteVisitOptionsText` |
| 17 | Book the visit | `leads/[leadId]/page.tsx:171` | `leadQuoteVisitText` |
| 18 | "Save & text the client" | `jobs/[id]/QuoteBuilder.tsx:853` | `quoteUpdatedText` |
| 19 | Crew "Notify" | `schedule/schedule-calendar.tsx:2167` | `crewScheduleSelectedText` |
| 20 | Post-an-update "Also text this update" | `jobs/[id]/page.tsx:1055` | `jobUpdateText` envelope |
| 21 | Request review | `jobs/[id]/page.tsx:509` | `reviewRequestText` |
| 22 | Retry payment text | `jobs/[id]/page.tsx:366` | `paymentText` |
| 23 | Crew assignment notify | `jobs/actions.ts:794`, `:897` | `crewAssignmentText` |
| 24 | Send quote (lead → job) | `leads/actions.ts:641` | `clientJobDashboardText` |

Notes on individual rows:

- **17, 24** — `QuoteDeliveryPreview` already resolves and displays the *channel*
  correctly; what is missing is the body. Extend that component rather than
  adding a second one beside it.
- **20** — the owner types the title and body, so the words are theirs; only the
  envelope (`jobUpdateText` prefix, link, opt-out) is unpreviewed. Low severity,
  but the segment count is what the owner is actually missing.
- **21** — previewed in Settings (`settings/ReviewRequestSection.tsx:209`, built
  not transcribed) but not at the point of send. Lowest severity in the table;
  arguably already acceptable.
- **18** — the note under the button ("Save & text sends them the updated total
  and the link") is prose, and it is accurate. Still not the text.

### 25. Waitlist offer: the editor was built and never wired

- **Where:** `src/app/dashboard/schedule/waitlist/WaitlistManager.tsx:69`, `:293`
- `customSmsBody` state exists and is passed to `sendWaitlistOfferAction` as
  `customBody`. The server honors it
  (`src/lib/cancellation-waitlist-data.ts:301`). **`setCustomSmsBody` is never
  called** — there is no textarea anywhere in the file. So the auto-drafted body
  always goes out, unpreviewable and uneditable, with the whole override path
  finished on the server side and dead on the client.
- **Fix:** add the textarea seeded from `draftWaitlistOfferBody`, and render
  `composeWaitlistOfferMessage(businessName, body)` as the preview — the same
  shape `RescheduleOffer` already uses.

### 26. "Text them the new time" is a partial preview

- **Where:** `src/app/dashboard/schedule/plan/page.tsx:656`
- Shows the recipient list and each arrival window — the only variable that
  matters — plus a note explaining the window policy. Missing only the wording of
  `arrivalTimeChangedText`.
- **Fix:** render the composed body for the first recipient with a "+N others"
  affordance.

### 27. Campaign composer shows segments but not the envelope

- **Where:** `src/app/dashboard/marketing/CampaignComposer.tsx:473-479`
- `smsSegments(body)` is counted correctly and the note says the business name
  and opt-out line are added — but they are described, not rendered, so the count
  excludes them.
- **Fix:** count and preview `campaignText(businessName, body)`, not `body`.

---

## Shared work — do this once, not 22 times

### 28. One `SmsPreview` component

Extract from `PaymentPreview` the parts that are not payment-specific: the
composed-body bubble, the segment counter with its GSM-7/UCS-2 detection
(`PaymentPreview.tsx:68`), the recipient line, and the "N texts" warning. Every
P2 row above becomes a three-line change once this exists.

Keep `PaymentPreview`'s two-tab invoice/SMS shape where an invoice is involved;
elsewhere only the SMS half is wanted.

### 29. One guard test that enumerates the send sites

The recurring failure here is not any single missing preview — it is that nothing
fails when a new send ships without one. Write a test that:

- enumerates every module calling `enqueueSmsDelivery`, `queueAccountSms`, or a
  `send*Sms` export, filtered to those reachable from a `'use client'` component
  or a form action;
- asserts each has an entry in a declared allowlist recording **either** the
  preview component that renders its body **or** an explicit, reasoned exemption;
- fails on a new send site not present in the list.

Model it on the "assert the call, not the symbol" pattern — the list has to name
call sites, because a list that names only modules goes stale silently.

### 30. No string literals in the `body` position

Separate, cheaper guard (see task 7): every `SmsCatalogueEntry.body` and every
preview node in a component must be a call expression, not a template literal.
This is the check that catches transcription before it drifts.

---

## Suggested sequencing

1. **Tasks 1, 3, 4** — wrong text is currently leaving the building. 1 is a
   two-line fix; 3 and 4 need a copy decision first.
2. **Task 28** (`SmsPreview`), then **2, 5, 9-11** — the money surfaces.
3. **Tasks 6, 7, 8** — the lying previews, plus **30** to stop them recurring.
4. **Tasks 12-27** — mechanical once 28 exists.
5. **Task 29** last, with the allowlist reflecting the finished state.

## What was already right

Copy these, they need no work: `crew/requests/[id]/RecipientPicker.tsx:164-185`
(editable body, personalized preview, segment count),
`schedule/plan/EstimateOffers.tsx:109`, `schedule/plan/RescheduleOffer.tsx:237`,
`schedule/plan/BriefCrewModal.tsx:142`, `schedule/WeatherPanel.tsx:113-117`
(editable draft), `rebook/RebookScreen.tsx:76`, and
`jobs/[id]/PaymentPreview.tsx`. Each calls the real builder; several show the
envelope and the segment cost.
