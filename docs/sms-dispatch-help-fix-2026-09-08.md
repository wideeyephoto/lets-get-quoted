# Dispatch HELP acknowledgment fix — September 8, 2026

The live dispatch test delivered a normal crew welcome and scheduled job assignment, and routed the recipient's ordinary reply correctly. HELP then produced a processed keyword receipt with no account binding. The BrokePipes-only canary gate suppressed the acknowledgment because it could not establish the account.

`ingest_sms_inbound_webhook` includes STOP and START in its existing dispatch authority lookup but omits HELP. The migration adds HELP to that same lookup. A unique consented crew workspace can receive the compliance acknowledgment; ambiguous, stale, and unknown identities remain unbound. HELP does not opt a recipient in or clear STOP.

The migration patches the currently installed function instead of replacing it with a historical copy. It preserves all other function text, its owner/grants, consent handling, and voice behavior; it fails if the expected block changed and can be reapplied safely. It needs no application deployment or change to the account allow-list.

Validation:

- 38 local PostgreSQL inbound checks passed, including the reproduced pre-fix failure, unique/ambiguous/stale/unknown HELP, immutable receipt replay, unchanged consent, HELP while stopped, and existing STOP/START and tenant/action boundaries.
- 23 focused route, routing-migration, and schema-parity tests passed. Schema generation check and final parity rerun passed.
- Full fresh schema execution fails on missing `public.inventory_tool_custody_log` on both the original checkout and this fix. That baseline defect is separate and remains unresolved.

Production status: Brett explicitly approved the fix, and it was applied successfully as hosted migration `20260908173701_sms_dispatch_help_account_binding`. The CLI-generated repository migration is `20260908173107_sms_dispatch_help_account_binding.sql`; the hosted API assigned its own application timestamp. No migration history was rewritten.

Post-apply verification: the installed function body matches the canonical field-intake function plus the single HELP keyword addition after normalizing line endings. Owner, service-role-only execution grants, search path, and UTC setting remain intact. Security advisors reported no finding for this function. A fresh handset HELP passed: the receipt bound to the intended canary, recorded the compliance response, and Brett confirmed its acknowledgment. STOP acknowledgment and worker cancellation of both pre-STOP queued and post-STOP fresh probes also passed; START acknowledgment and a fresh schedule notification also passed with handset confirmation. The temporary crew/job were archived and no test messages remain pending. Private handset/session evidence is kept outside the repository.
