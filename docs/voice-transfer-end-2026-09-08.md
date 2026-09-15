# End answered transfers without voicemail

**September 9 evidence reconciliation:** The later September 8 handset retest
on PR #42 closed recipient-first hangup and pickup-announcement acceptance. The
owner heard the full announcement and two-way audio; the remaining caller ended
121 ms after the recipient, with no voicemail and one AI minute settled once.
All legs ended and temporary scripts were removed. This supersedes the earlier
open recipient-hangup/pickup observations below. Unanswered voicemail recovery
and its active-recording boundary remain open; see the
[current acceptance record](voice-acceptance-2026-09-09.md).

The September 8 owned-number test successfully transferred through Dispatch to
the owner's mobile. The owner heard the automated caller and their own words
echoed through the bridge, confirming audio in both directions with one handset.
The admission captured measurement mode and a ten-minute allowance; ten AI
seconds settled as one measured and committed minute, with zero absorbed minutes.
The answered transfer retained separate connection timestamps and 119 forwarding
seconds. Its receipt processed once without error.

When the mobile disconnected, the provider executed the unconditional voicemail
instructions after `connect`: it played an unavailable message and made a
five-second recording. The parent call ended 13.473 seconds after the bridge.
This is a call-control defect even though the history correctly kept its answered
transfer outcome. The original evidence and recording metadata are preserved.

Both the AI transfer and direct SWML forwarding paths now branch on the native
`connect_result`. Only `failed` plays the voicemail prompt and records. Connected
and unknown results continue directly to hangup. Number routing, callbacks,
recording limits, AI metering, and the original call timer remain unchanged.

Provider contracts checked September 8:

- [Connect result and callbacks](https://signalwire.com/docs/swml/reference/calling/connect)
- [SWML switch](https://signalwire.com/docs/swml/reference/calling/switch)
- [Native echo test](https://signalwire.com/docs/compatibility-api/cxml/reference/voice/echo)

Validation: 79 focused adapter, inbound, transfer-status, fallback, and recording
tests passed. Coverage verifies the only recording branch is `failed`, unknown
results fall through to hangup, and signed callback destinations are retained.
Full CI passed in run 34280733087. PR #41 merged as
`ef7f42df55ae241720375e2e5c63cb403e2ff676` and was explicitly promoted to
production deployment `dpl_Y42ukrhhX4fEp6zusb8wiJFaEvGA`; both public hosts were
verified on that release before the retest.

The retest had 80.794 seconds of connected forwarding and 110.914 seconds of
answered parent time. All three provider legs ended at 21:41:20 UTC, with no
post-transfer playback or recording. The database retained `transferred_and_answered`,
81 rounded forwarding seconds, recording status `none`, one measured/committed
AI minute, and one successfully processed receipt. No voice holds remained.

The user initially reported hanging up, then clarified that they were still on
the line. The test caller had its own 60-second Echo followed by a closing message
and hangup. Provider events attribute the final disconnect to that caller side.
This proves clean caller-side termination with no voicemail; it does not prove
that a recipient hangup triggers the new connected-result branch. Keep that
specific acceptance check open.

The user also reported speech already underway on pickup. The mobile leg's
announcement began 111.868 ms after its answer timestamp. The transfer whisper
now starts with one second of native silence, giving the answered handset time
before the opening words. This delay applies only to the recipient announcement,
within the existing call cap. It does not change conversational endpointing.
The audible improvement still needs handset verification.

The test harness's fixed pause also allowed its instructions to advance without
knowing when the mobile bridge was ready. Future controlled tests must synchronize
their prompt to the confirmed bridge and use a shorter, clearly described echo
window. Do not treat harness timing as speech-to-audio latency evidence.

Native silence contract: [SWML play](https://signalwire.com/docs/swml/reference/calling/play).

This short echo test does not establish the ten-minute transfer boundary or
speech-to-audio latency percentiles.
