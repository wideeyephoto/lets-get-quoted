# Voice startup latency — September 15, 2026

## Observed failure

The post-Stop-release handset attempt reached provider voicemail before AI execution. The primary route logged an approved `ai_agent` plan (4,032 ms total; 3,415 ms planning), while the provider used its fallback roughly five seconds after call creation. The primary event had HTTP 200 but no response body. This is consistent with a provider read deadline, although it does not independently prove a timeout.

## Change

- Record route-verification evidence with Next.js `after`, keeping the lifecycle-managed write alive without holding the provider response open.
- Load account-scoped voice context concurrently with atomic call admission after caller identity is resolved. An admission refusal still prevents AI; context failures retain the existing null-context behavior.
- Authentication, admission, provisional call recording, and fallback callback context remain prerequisites for the response. Metering and financial-blocking settings are unchanged.

## Validation and remaining acceptance

83 targeted checks pass, including deferred verification, forged webhook rejection, and pending/refused admission while context loads. Type checking and targeted lint pass. Production CI and a fresh handset call remain required. The single-word Stop change has not yet passed live acceptance because this attempt never reached AI.

Operational recovery independently verified the provider call ended with no AI or tool actions, closed the stale admission, released unused reserved minutes, and marked voicemail with zero AI billed minutes. This manual recovery is not proof of automatic settlement recovery. Existing recording metadata was preserved.
