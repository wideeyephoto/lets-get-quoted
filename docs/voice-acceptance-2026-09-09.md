# Voice acceptance — September 9, 2026

**Status: partial; the spoken-quote fix is live, and failure-path acceptance remains open.**
The owner participated in the affected staff handset retest and a separate
speech diagnostic. Provider-period billing reconciliation remains open and
financial exhaustion blocking stays OFF.

## Staff handset result

The full Dispatch call at 19:59–20:01 UTC used the released staff profile before
PR #55. It found the intended job, previewed a note without saving, saved only
after the caller requested it, and read the saved text back without another
write. Hosted verification found one applied action and one matching job-feed
entry, the correct job/workspace, and an unchanged recorded quote and scope.
The call had no recording, settled 113 AI seconds as two measured/committed
minutes with zero absorbed minutes, and left no held voice reservation.

**The audio acceptance failed.** The owner heard a glitch on “dollars” in three
of four readouts and clarified that there was a long silence after speaking.
This supersedes the earlier successful latency sample; it is not an acceptable
delay report. Opening and interruption acceptance are not inferred from the
absence of additional detail.

The first-ingestion production timing log recorded seven speech-to-first-audio
intervals: 6,367, 2,953, 3,011, 2,719, 5,650, 2,343 and 2,735 ms. These use the
provider's last-word/first-audio anchors, not transcript publication timestamps.
The median of this small sample is 2,953 ms; it is not a production percentile.
The two lookup requests took 926 and 708 ms and the note request took 896 ms.
Backend requests alone do not explain the longer gaps. No human waveform was
recorded, so the precise audible glitch and individual pipeline cause remain
unconfirmed. Masked transcript text is not proof that an amount was masked in
the audio.

The released change supplies the stored quote in complete spoken words,
including cents, and asks for one concise readout. Invalid or unsupported
precision is omitted instead of rounded or fabricated. It does not change the
quote, provider voice, privacy settings or endpointing.

A separate 67.139-second interactive handset diagnostic used the actual staff
speech parameters and a short prompt with the amount already written in words.
The caller asked for the quote and repeated readouts, then reported **clear
pronunciation and no long silence**. No job tools, application writes or human
recording were involved. This supports the candidate readout format; the full
Dispatch prompt and tool flow need separate release-specific evidence.

PR #57 merged as `cf92c60cc` after its full CI passed. Production deployment
`dpl_EvcokC6f4DXQFsLkrhFGFfzLi5Tn` became READY, passed the protected health
check and was promoted. Both public domains resolved to that deployment at
20:48 UTC. No database migration or voice setting changed in this release.

The post-release handset attempt at 21:00–21:01 UTC **failed before Dispatch
started**. The owner described an unavailable message that sounded like a wrong
or broken number. Provider evidence shows the primary route returned voicemail;
application logs reported `admission_unavailable` on a repeated request. The
call lasted 16.498 connected seconds and captured a five-second voicemail. No
AI or job tool ran, so pronunciation, note and interruption retests remain open.
An earlier “all worked correctly” survey response was clarified as not following
a call and is not acceptance evidence.

This attempt ran on the subsequent PR #58 production revision `5e7e00901`,
which includes the spoken-quote release and adds recording authorization tests.
Unlike the earlier emergency fallback with query parameters, this primary
voicemail used the stable recording callback URL and its native callbacks both
returned HTTP 200. The recording persisted automatically, but call termination
and the unused hold still needed provider-verified reconciliation. At 21:07 UTC
that recovery restored voicemail/zero AI charge and released the hold.

The follow-up change gives a busy admission three short, bounded retries through
the existing atomic claim function; it never treats `busy` as permission to
start AI or purchase another hold. It also loads independent workspace and
caller/capacity facts concurrently and records numeric startup/retry timing.
The code exposes a retry race consistent with this call, but the precise failing
claim state was not logged by the old revision. Live validation of the fix is
still required. Emergency recording attribution now uses numeric segments in
the provider-signed path, preserving whole-URL/body authentication and the
database-independent fallback. Provider validation of that new path is pending.

## Transfer, deadline and recovery evidence

| Check | Result and scope |
| --- | --- |
| Answered transfer and recipient-first hangup | Reused September 8 accepted handset evidence: full pickup announcement, two-way audio, remaining leg ended 121 ms after the recipient, no voicemail, one AI minute settled and no hold. The earlier caller-first-only snapshot is superseded. |
| Original deadline across provider phases | Reused real provider probes: repeated answer retained the 15-second timer; a hosted SWML transition retained it. The full late answered transfer ended at 597.661 connected seconds, with the child ending 19 ms before its parent. The inline JSON transition variant remains inconclusive. |
| Unanswered transfer | New internal native-provider probe produced `noAnswer` after approximately five seconds. The visible control entered the failed branch and recording, but recording status was `no_input`. This is branch execution, not successful voicemail capture/playback. |
| Late unanswered/voicemail boundary | The 570-second-delay probe ended at 593.862 connected seconds. It produced no completed voiced recording; natural completion before the cap does not prove forced termination of active voicemail. A reversed-direction short control also did not enforce its requested 40-second answer cap and is excluded from inbound deadline evidence. Keep this gate open. |
| Tool deadline and homeowner/staff behavior | PR #55 merged as `2c5958ac2` and released separately. It aligns homeowner appointment-request wording, separate on-call destinations, staff summaries and after-hours behavior, and bounds new tool actions to admitted allowance minus two seconds. Hosted migration history uses `20260909195808`; repository migration is `20260909194635_voice_tool_call_deadline.sql`. Local boundary/role tests pass; live homeowner/on-call and in-flight tool acceptance remain open. |
| Receipt/recording recovery | Existing observation-hardening database checks passed again: early/late recording, monotonic state, attribution, replay, deletion outbox and authorization. All 23 scoped production receipts were processed and no voice holds remained at 20:57 UTC. The real fallback voicemail below was recovered from authenticated provider evidence; this does not prove automatic callback recovery. No AI receipt was manufactured. |
| Provider-triggered emergency fallback | **Actual invocation proven:** a controlled call to the owned phone number entered `/api/voice/fallback` after the primary SWML fetch failed. It captured a finished 14-second synthetic voicemail. Native recording callbacks failed authentication with HTTP 401; the call was manually recovered, correctly attributed and settled unbillable with zero AI charge and its hold released. Signed-in app playback ran through the recording. Automatic recovery remains open. |

### Actual fallback failure and recovery

The controlled call at 20:36–20:37 UTC was intended to test an unanswered office
transfer. The provider instead exhausted its primary document fetch attempts
and invoked the configured emergency fallback. Application logs showed four
HTTP 200 primary requests, while the provider recorded response code zero and
delivered only the fallback document. No AI ran and no transfer was attempted.
The 23.665-second connected call therefore does **not** pass unanswered-transfer
acceptance or establish the primary fetch failure's cause.

The provider retained a finished voicemail containing synthetic speech, but its
recording notifications were rejected with a signature mismatch. A separate
internal no-input probe with plain numeric callback query parameters also
received HTTP 401. That control rules out treating encoded phone-number query
parameters as a sufficient fix. Signature verification remains strict; no
alternative diagnostic signature was accepted.

Recovery at 20:48 UTC verified the provider project, exact call and recording,
terminal state, called/calling numbers, delivered fallback document, absence of
AI execution and absence of an AI receipt. Existing recording-observation and
reservation-release functions restored the scoped call. The call now has a
ready recording, voicemail outcome, reconciliation provenance and zero billed
minutes. AI duration and measured minutes remain unknown, rather than invented
as a receipt. The signed-in call detail displayed the recording and playback
advanced through its end at 20:57 UTC. This proves authorized media delivery
after manual recovery, not automatic recovery or human audio-quality acceptance.

The first internal probes and the diagnostic call ended. The temporary unanswered
SWML resource was checked by project/name/contents and deleted after every
associated call was terminal. No phone route, business setting, customer SMS
eligibility or financial-gate setting was changed.

A further synthetic probe started at 21:16 UTC with speech delayed until the
late voicemail window and enough remaining speech to outlast the call cap. Its
active-recording deadline result and temporary-resource cleanup are pending.

## Validation and remaining acceptance

The currency commit is based on PR #55's merged revision. `vitest run voice`
passed 956 tests across 77 files; TypeScript and scoped lint passed. The real
PostgreSQL 17 current-contract harness passed 56 checks, including allowance
boundaries, expired mutations, saved-outcome recovery and role/tenant isolation.
Earlier observation-hardening checks passed independently. Local tests and a
short speech diagnostic do not complete the handset matrix. PR #57's full CI
also passed installation, dependency audit, unit tests, SEO, stock checks,
TypeScript, lint and production build before release.

The admission/recovery follow-up passed 1,050 tests across 79 files (voice plus
the shared SMS provider verifier), scoped lint and TypeScript. New cases cover
busy-admission replay without a second hold, a terminal transition while waiting,
bounded failure, signed recovery attribution, path tampering and unknown callers.

- [x] Record the full staff test, exact-once note result, timing failure and
  successful isolated pronunciation/response diagnostic.
- [x] Reconcile the previously accepted recipient-first transfer result and
  retained provider deadline evidence with the public checklist.
- [x] Release the spoken-quote change and verify production health and both
  domain aliases.
- [ ] Complete the full Dispatch handset retest on the released version, confirm
  pronunciation and post-speech delay, then verify the note, receipt and settlement.
- [x] Prove actual phone-number fallback invocation, recover its finished
  synthetic voicemail and verify authorized app playback and attribution.
- [ ] Release and retest busy-admission handling and the signed recording
  attribution path; complete automatic termination/unused-hold recovery.
- [ ] Complete voiced unanswered-transfer recovery through persisted voicemail,
  authorized playback and attribution, including active recording at the cap.
- [ ] Complete silence/in-flight tool
  boundaries, and homeowner/on-call/role-specific live behavior on PR #55 or later.
- [ ] Complete the provider invoice period reconciliation. Exhaustion blocking
  remains OFF; this session does not authorize enabling it.

Private call references, scoped database snapshots and probe artifacts remain
outside the repository in the dated `prelaunch-voice-*` evidence files. Related
records: [Dispatch TODO](voice-dispatch-production-todo-2026-09-08.md),
[response delay](voice-response-delay.md), [transfer ending](voice-transfer-end-2026-09-08.md)
and [homeowner/staff behavior](voice-homeowner-and-staff-readiness.md).
