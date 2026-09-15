# Operational cleanup and branch integration — September 10, 2026

The current-source integration brings the outage SMS rail and truthful webhook inspection from source commit `f51f24620` into the launch base. It does not execute a historical disposition script, replay a webhook, send a drill message, or establish new production acceptance.

## Included application changes

- The operator cockpit, generic webhook tool and automatic healer inspect failures without claiming a replay or silently marking a failure resolved.
- A failed inspection remains an error rather than a healthy empty result.
- The operational monitor and independent watchdog can page the configured operator through SignalWire even when the email provider fails. The existing environment configuration controls the recipient and sender.
- An hourly durable claim permits one provider submission across competing watchdogs. Ambiguous submissions require review; repeats reconcile the original provider identity. Confirmed delivery evidence is preserved.
- The paging ledger is inaccessible to browser roles and is registered as internal operational data. This rail does not create customer SMS tasks or charge tenant usage.

The paging table was confirmed present through a read-only production catalog query during this review. Its original production migration used timestamp `20260909202110`; the repository migration uses `20260909200503`. Do not blindly reapply the CREATE TABLE migration to a database that already has the verified table.

## Historical acceptance retained

The source task's latest reviewed snapshot is `ccff4445f` on `fix/prelaunch-operational-cleanup-20260909`. Its report and timestamped evidence remain there. They record individual dispositions for the original 221 failures, the earlier controlled email-outage SMS receipt, observation checkpoints, and the separately authorized cancellation of one confirmed rehearsal SMS. Those are historical observations, not new actions in this integration.

At the source task's September 10 15:29 UTC checkpoint, the observer reported 219 successful billing cycles, 219 monitor cycles and 1,097 SMS cycles, no pending SMS or active delivery task, and unchanged fingerprints for all 221 original dispositions. The snapshot keeps paging activation, explicit rehearsal-routing disposition, independent watchdog timing assurance and observation after relevant runtime changes open.

The source task owns the fixed observation ending September 10 at 21:13:17 UTC. Integrating or deploying new monitoring/SMS code does not automatically satisfy that gate or replace its runtime qualification. Leave its working directory and scheduled follow-up intact.

## Release follow-up

Follow [the operational alerts runbook](runbooks/operational-alerts.md). Verify the deployed revision, configured operator paging, scheduled execution and actual delivery before closing the launch gate. Database-plus-email-provider failure remains outside the proved SMS channel because the durable SMS claim requires the database.

The [branch review](branch-integration-review-2026-09-10.md) records the integration selection and current-source validation. Detailed historical account/provider records and the one-off disposition scripts remain in their source worktree; they are not required for application execution and were not republished in this integration.
