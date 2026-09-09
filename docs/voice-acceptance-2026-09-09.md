# Voice acceptance — September 9, 2026

**Status: partial; voice experience and the remaining live failure paths are open.**
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

The candidate change supplies the stored quote in complete spoken words,
including cents, and asks for one concise readout. Invalid or unsupported
precision is omitted instead of rounded or fabricated. It does not change the
quote, provider voice, privacy settings or endpointing.

A separate 67.139-second interactive handset diagnostic used the actual staff
speech parameters and a short prompt with the amount already written in words.
The caller asked for the quote and repeated readouts, then reported **clear
pronunciation and no long silence**. No job tools, application writes or human
recording were involved. This supports the candidate readout format; the full
Dispatch prompt and tool flow still require a retest after release.

## Transfer, deadline and recovery evidence

| Check | Result and scope |
| --- | --- |
| Answered transfer and recipient-first hangup | Reused September 8 accepted handset evidence: full pickup announcement, two-way audio, remaining leg ended 121 ms after the recipient, no voicemail, one AI minute settled and no hold. The earlier caller-first-only snapshot is superseded. |
| Original deadline across provider phases | Reused real provider probes: repeated answer retained the 15-second timer; a hosted SWML transition retained it. The full late answered transfer ended at 597.661 connected seconds, with the child ending 19 ms before its parent. The inline JSON transition variant remains inconclusive. |
| Unanswered transfer | New internal native-provider probe produced `noAnswer` after approximately five seconds. The visible control entered the failed branch and recording, but recording status was `no_input`. This is branch execution, not successful voicemail capture/playback. |
| Late unanswered/voicemail boundary | The 570-second-delay probe ended at 593.862 connected seconds. It produced no completed voiced recording; natural completion before the cap does not prove forced termination of active voicemail. A reversed-direction short control also did not enforce its requested 40-second answer cap and is excluded from inbound deadline evidence. Keep this gate open. |
| Tool deadline and homeowner/staff behavior | PR #55 merged as `2c5958ac2` and released separately. It aligns homeowner appointment-request wording, separate on-call destinations, staff summaries and after-hours behavior, and bounds new tool actions to admitted allowance minus two seconds. Hosted migration history uses `20260909195808`; repository migration is `20260909194635_voice_tool_call_deadline.sql`. Local boundary/role tests pass; live homeowner/on-call and in-flight tool acceptance remain open. |
| Receipt/recording recovery | Existing observation-hardening database checks passed again: early/late recording, monotonic state, attribution, replay, deletion outbox and authorization. All 23 scoped production receipts were processed and no voice holds remained at 20:28 UTC. No live failed receipt was available or manufactured for replay. |
| Provider-triggered emergency fallback | Number configuration is present, but the earlier native REST 404 probe never invoked fallback. Actual phone-number fallback invocation, voicemail persistence, authorized playback and final attribution remain open. |

All internal probes and the diagnostic call ended. The temporary unanswered
SWML resource was checked by project/name/contents and deleted after every
associated call was terminal. No phone route, business setting, customer SMS
eligibility or financial-gate setting was changed.

## Validation and remaining acceptance

The currency commit is based on PR #55's merged revision. `vitest run voice`
passed 956 tests across 77 files; TypeScript and scoped lint passed. The real
PostgreSQL 17 current-contract harness passed 56 checks, including allowance
boundaries, expired mutations, saved-outcome recovery and role/tenant isolation.
Earlier observation-hardening checks passed independently. Local tests and a
short speech diagnostic are not a production release or complete handset matrix.

- [x] Record the full staff test, exact-once note result, timing failure and
  successful isolated pronunciation/response diagnostic.
- [x] Reconcile the previously accepted recipient-first transfer result and
  retained provider deadline evidence with the public checklist.
- [ ] Release the spoken-quote change and repeat full Dispatch lookup, repeated
  quote readout, draft/save/readback, opening and Stop on the handset. Confirm
  pronunciation and post-speech delay with the caller and inspect saved state.
- [ ] Complete voiced unanswered-transfer recovery through persisted voicemail,
  authorized playback and attribution, including active recording at the cap.
- [ ] Complete actual provider fallback invocation, silence/in-flight tool
  boundaries, and homeowner/on-call/role-specific live behavior on PR #55 or later.
- [ ] Complete the provider invoice period reconciliation. Exhaustion blocking
  remains OFF; this session does not authorize enabling it.

Private call references, scoped database snapshots and probe artifacts remain
outside the repository in the dated `prelaunch-voice-*` evidence files. Related
records: [Dispatch TODO](voice-dispatch-production-todo-2026-09-08.md),
[response delay](voice-response-delay.md), [transfer ending](voice-transfer-end-2026-09-08.md)
and [homeowner/staff behavior](voice-homeowner-and-staff-readiness.md).
