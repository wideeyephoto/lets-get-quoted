# Homeowner and staff voice behavior

Homeowner appointments are requests for office review. Available windows and
temporary holds do not confirm an appointment. Cancellation/rescheduling requests
leave the original appointment unchanged until the office verifies the change.
The prompt and tool descriptions must match these returned outcomes, including
the difference between a queued text and a delivered text.

The receptionist settings use the workspace business name in greeting presets.
Saved custom greetings remain owner-controlled. The branded opening and cue
still precede a homeowner's business greeting; staff use the shared opening.

Owners can set a separate **On-Call / Emergency Transfer** destination. Empty
means use the regular office transfer. The SMS alert destination is independent
and is never implicitly used as a live voice transfer. Ordinary and emergency
tools each have a fixed server-selected destination. The call plan removes the
caller and dialed receptionist numbers from valid destinations. If no destination
remains, the assistant offers a callback request without claiming a connection.
Immediate danger must not be delayed by intake or a promised contractor response.

The on-call tool reuses the regular transfer's 25-second ringing limit, original
call deadline, one-second pickup pause, signed outcome callback and failed-only
voicemail branch. A tool invocation alone means transfer attempted; completion
still requires provider evidence.

Staff post-call instructions identify the actual staff caller separately from
customers whose jobs were discussed. They distinguish draft, submitted, unknown
and confirmed outcomes, and do not label an existing schedule as a new booking.
Existing staff settlement protections remain in effect.

## Tool authorization deadline

Migration `20260909194635_voice_tool_call_deadline.sql` changes the tool admission
and staff mutation gates to the snapshotted allowed minutes minus the two-second
provider hangup margin. Legacy unsnapshotted calls are bounded to ten minutes.
Future admissions, invalid allowances, terminal calls and mismatched identities
are denied. The mutation gate checks time after its admission lock is acquired.
The inner mutation implementation remains inaccessible to application roles.

Read-only recovery of a previously committed outcome keeps its existing scoped,
terminal-aware rules. It does not authorize a new action after expiry. The call
cutoff, metering policy, exhaustion gate and recording defaults are unchanged.

## Verification and remaining setup

Run affected voice tests and `LGQ_VOICE_CURRENT_CONTRACT=1 node
scripts/verify-voice-contractor-dispatch.mjs` for the real PostgreSQL upgrade
sequence, allowance boundaries, denied writes and saved-outcome recovery.

Every business still needs accurate services, territory, hours, timezone,
appointment capacity, staff roles and notification recipients. Customer SMS
eligibility and acceptance remain separate. Handset acceptance of homeowner
intake, actual on-call transfers, unavailable destinations and provider fallback
must be recorded against the released deployment; unit tests do not prove audio.
