# Maintained email sender registry

The machine-readable source is [`docs/email-sender-registry.json`](../email-sender-registry.json). Its September 14, 2026 review records 21 files, including application transports, shared policy and ledger helpers, domain-management API calls, and the controlled seed runner. Each entry records purpose, recipient scope, transport, suppression behavior and remaining work. Type-only provider imports are included as supporting contracts, not counted as actual sends.

## Local maintenance

Run `npm run test:email-registry`. CI runs the same command. The checker parses source rather than comments and compares function-scoped transport markers and occurrence counts to the reviewed registry. A new file, removed entry, added call in an existing function, moved sender, missing policy description or unparseable source fails the check. Pure formatting changes do not change signatures.

When a check fails, inspect the implementation and its caller prerequisites. Update purpose, scope, delivery policy and outstanding evidence before editing the corresponding signatures. There is deliberately no automatic baseline-acceptance command. The checker prints file paths and mismatch categories, not message payloads, recipients or credentials.

The scan covers `.ts`, `.tsx`, `.js` and `.mjs` under `src` and `scripts`. It excludes `node_modules`, `fixtures`, `__tests__`, `.test.`/`.spec.` files, `verify-*` scripts and the checker itself. Supported markers are known provider imports (including dynamic imports), `.emails.send/create`, provider URL literals/template prefixes, `/emails` requests through existing provider helpers, and shared gate calls. Renamed named imports of shared gates are recognized.

This is a bounded drift check, not exhaustive call-graph analysis or proof of enforcement. It cannot prove correct recipient tags, detect every dynamically assembled URL, recognize every unknown provider or inspect third-party automation. Removing a gate while leaving a different matching call elsewhere may still require manual review. Verification scripts are excluded because their fixture calls do not represent production transports; any proposal to use them as live senders needs a separate review.

## Outstanding scope and provider evidence

- Shared `email.ts` still has optional account-tag paths that require caller-by-caller review; registry presence does not certify every caller as protected.
- The independent operational monitor retains its durable alert transport; its recipient/block policy must be reviewed separately from customer marketing preferences.
- Hosted Resend workspace/region, actual capacity, credential identity and historical delivery-block reconciliation are explicitly **unverified** in the registry. Local configuration names are not evidence of a particular hosted provider account.
- Remaining notice families need durable event identities. This registry neither creates a send ledger nor authorizes retries.

Before reconciling historical blocks, retain provider workspace/region, event/provider identifiers, normalized recipient, reason, source timestamp and provenance. Review scope and duplicates; preserve stronger complaint/bounce reasons. Do not copy tenant opt-outs into platform scope or treat missing events as permission to send. Importing evidence and hosted verification remain separate work; this pass reads source files only.

Local validation: 10 checker tests passed and all 21 reviewed file signatures matched. No hosted queries, credential inspection, email submissions or deployment occurred.
