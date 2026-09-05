# Ready commits release — September 5, 2026

Production is at `ea9575d69731135ece46dc4fab4773c2fe493f89`. The reviewed release includes the twelve commits through `858b2623d`, plus the release regression and permission fixes accompanying this record. Uncommitted merchandise/card work and its `20260905170000` migration are excluded.

Validation: 13,350 unit tests passed; full typecheck, lint, SEO tests, and stock tests passed. Lint reports existing warnings. Live calls remain deferred.

Apply the database changes before pushing this release to main, because the voice and messaging code requires the new functions. The batch uses a transaction with a five-second lock timeout and a sixty-second statement timeout. Failure rolls back the entire batch. It creates tables/indexes, replaces functions and row policies, seeds capabilities, backfills inventory image URLs, and restricts default grants. It does not place calls, send messages, or change billing enforcement flags.

The production catalog confirms the insurance schema, inventory deduplication indexes, payment settings, recurring cancellation timestamp, and forwarding number synchronization are already installed. They do not need replaying. Missing dependencies are listed below.

| Migration | Purpose |
| --- | --- |
| `20260904200000_voice_ai_lead_capture_and_notifications.sql` | Add caller follow-up and contractor notification settings. |
| `20260904210000_sms_delivery_task_ttl.sql` | Expire stale SMS delivery tasks at claim/stage boundaries. |
| `20260905090000_inventory_comprehensive_hardening.sql` | Add custody log, van kits, asset metadata, maintenance protection, and inventory capabilities. |
| `20260905100000_office_enable_client_duplicate_dismissals_and_portal.sql` | Enable capability-aware client dismissal and portal access. |
| `20260905120000_merchandise_hardening.sql` | Protect revenue data, constrain order states, add fulfillment attempts and unique checkout IDs. |
| `20260905140000_cancellation_waitlist_office_rls.sql` | Enable capability-aware waitlist access. |
| `20260905140000_office_marketing_capabilities.sql` | Register marketing read/write capabilities. |
| `20260905140000_review_invites_rls_hardening.sql` | Repair review-invite write checks and revoke anonymous writes. |
| `20260905150000_marketing_tracking_links.sql` | Add persistent campaign tracking links. |
| `20260905151055_voice_observation_and_recording_hardening.sql` | Add recording observation/deletion queues, forwarding measurements, and guarded voice tool functions. |
| `20260905153351_sms_lead_delivery_history.sql` | Append SMS delivery history atomically and once only. |
| `20260905160000_referrals_performance_indexes.sql` | Index referral and settlement queries. |
| `20260905161546_release_schema_permissions.sql` | Restrict inherited table grants and make the membership view obey caller RLS. |

Production preflight found approximately 920 leads, eight inventory tools, twenty delivery tasks, and no merchandise orders or duplicate checkout sessions. The inventory migration's only immediate business-data update fills missing image URLs from existing notes. The SMS changes affect queue handling when workers next execute.

Production batch `ready_commits_release_20260905` applied successfully after explicit approval. Post-apply checks confirmed seven new tables with RLS and no anonymous reads or authenticated TRUNCATE grants, three voice notification columns, five office capabilities, four referral indexes, and a caller-RLS membership view. Sensitive voice/SMS functions deny execution by anonymous and authenticated roles. The source/catalog audit reports no detected gaps; the security advisor reports no errors. Push and deployment verification follow database verification.
