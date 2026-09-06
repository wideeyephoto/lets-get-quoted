# Voice duration and low-balance admission fix

The owner selected a ten-minute maximum for reception and dispatch calls.
Previously each call reserved sixty minutes and the generated SWML placed
`max_duration` under `ai.params`, where SignalWire does not document it as a
duration control. A workspace below sixty available minutes could therefore
receive unmetered calls in measurement mode or premature fallback in enforced
mode.

New calls reserve at most ten minutes. On a definite insufficient-credit error,
the application retries the atomic ledger reservation using the available
whole-minute balance. It does not retry an ambiguous network failure. The
persisted reservation determines the call duration, including on an admission
replay. A two-minute balance therefore supports a call limited to two minutes.
Partial settlement still consumes only actual AI time rounded up to minutes and
returns unused credit.

SignalWire receives `answer.max_duration` in seconds for the entire answered
call, including greeting and transfers. `ai.params.hard_stop_time` is fifteen
seconds earlier, with a brief closing prompt and explicit subsequent hangup.
The adapter also clamps oversized or invalid input. This applies regardless of
the financial enforcement flag. Older admissions retain their original cap for
delayed receipt settlement; historical calls and ledger rows are not rewritten.

Provider references checked September 6, 2026:

- https://signalwire.com/docs/swml/reference/answer
- https://signalwire.com/docs/swml/reference/calling/ai/params

Validation before deployment:

- 625 voice tests passed, including short-balance admission, concurrent balance
  changes, replay limits, provider rendering, and the full call lifecycle test.
- 31 ledger assertions passed using the existing PostgreSQL harness through
  PGlite. The harness loads the current reservation definition and proves a
  failed ten-minute hold on two available minutes leaves no partial rows, the
  same key can reserve two, partial settlement charges once, and the final
  remaining minute is usable. Native embedded-postgres was unavailable.
- Typecheck and scoped lint passed.
- No schema migration, production balance mutation, or environment change.

The production minute meter remains enabled; financial enforcement remains off
pending the runbook measurement and invoice reconciliation requirements. A live
call held to the cutoff is still required to confirm the provider's observed
termination behavior. Local rendering tests alone do not establish that result.
