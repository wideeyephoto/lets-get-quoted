# Shared email workspace scope

Local caller review and implementation, September 14, 2026. No hosted changes or emails were performed.

Eleven shared sender inputs previously allowed a missing workspace ID. Their production call sites already supplied one; the optional contract and permissive shared transport still allowed new or untyped callers to bypass tenant delivery preferences. Those inputs now require `accountId: string`. Shared tenant tags reject missing, empty, whitespace-padded or tag-altering IDs rather than omitting or rewriting them. Valid IDs are retained exactly.

The shared transport independently rejects a payload without an account tag unless its kind is explicitly `contact_message`, `support_case_staff` or `support_case_customer`. Those three kinds continue through the platform transactional gate. This check runs for fallback attempts too. The generic branding fallback remains available for rendering; missing branding does not grant permission to submit unscoped email.

## Reviewed caller map

| Sender | Workspace source in existing callers |
| --- | --- |
| Office invitation | `dashboard/settings/office-team-actions.ts`: authorized action account |
| Quote follow-up | `lib/followups.ts`: saved link account; `dashboard/settings/actions.ts`: authorized test account |
| Selection request | `lib/selection-notify.ts` and `lib/choice-reminder-sweep.ts`: selected job/send account |
| Appointment reminder | `lib/reminders.ts`: job account; `dashboard/settings/actions.ts`: authorized test account |
| Choice reminder test | `dashboard/settings/actions.ts`: authorized test account |
| Booking confirmation | `lib/booking.ts`: booking account |
| Client portal link | `portal/[subdomain]/actions.ts`: resolved site's account; `portal/global-actions.ts`: matched client's account |
| Card update | `lib/dunning.ts`: payment plan account |
| Card setup | `dashboard/recurring/actions.ts`: authorized plan account |
| Sending-domain failure | `lib/email-domain-failure-notices.ts`: saved notice account |
| Custom-domain connection | `lib/custom-domain-reconciler.ts`: site row account |

This is a review of scope propagation and final submission, not a new authorization mechanism. Existing caller authentication, recipient ownership, token validation and source-row access remain responsible for choosing the authoritative account. No platform scope is inferred from a missing tenant ID. Other exported low-level helpers, indirect callers and external automation require their own review; this does not certify provider-wide enforcement.

## Verification and remaining work

17 selected files / 348 tests passed; full application/test type checking passed. The 23 new tests execute all eleven real sender functions with missing, blank or altered IDs, verify exact workspace tags/queries with valid IDs, preserve marketing-only opt-outs and block a hard bounce. Existing domain, booking, selection, settings, payment, platform support, fallback and suppression tests passed. Changed-file lint and the 21-file sender-registry drift check passed.

Durable event/request identities, independent operational-monitor recipient policy, provider workspace/region/history and hosted acceptance remain open. This change does not add retries or change authentication links, and does not make the database preference read atomic with provider submission.
