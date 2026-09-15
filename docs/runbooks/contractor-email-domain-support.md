# Contractor email-domain support

Updated September 10, 2026. Source reviewed at release `a19356d3b671fdd0fd49628220bef6e9cd3479c1`. This is the current G07 diagnostic guide; the September 8 production runbook is historical planning. It does not replace the remaining live lifecycle, sending-hold, monitoring-response, or seven-day acceptance gates.

## Start with the correct workspace

1. Open [Account → email domain](https://app.letsgetquoted.com/dashboard/settings#email-domain) and confirm the business name and account number. The path is Business → Profile & locations → Custom Email Sending Domain. A browser signed into another workspace can legitimately show no enrollment section. Existing connections remain manageable when enrollment is paused; do not expand the allowlist to fix a navigation problem.
2. Record UTC time, account ID, domain row ID, exact provider binding ID, displayed status/reason, and current production deployment. Read both the stored state and the provider state before a retry. Collect the product action/quote ID and provider message ID for delivery incidents; keep recipient addresses, raw headers and private quote tokens in restricted evidence.
3. Check the latest `email-domain-reconcile` run in [staff health](https://app.letsgetquoted.com/admin/health), including errors, skipped status, backlog, notice reviews and the domain's last successful check. A green zero-row run proves no tenant behavior. `last_checked_at` alone is insufficient: a failed manual provider request can update it while preserving the previous sending status.

## Choose the recovery from the observed failure

| Symptom | Check and supported next step | Evidence required to close |
| --- | --- | --- |
| Pending DNS | Compare each current LGQ/provider record with authoritative DNS, including host, type, value and MX priority. Use the provider-returned record set, not a fixed record count. Preserve existing website records and inbound-mail MX records. Use Check Connection after publication; provider verification is asynchronous. A second check reads a completed verification without restarting it. | Provider reports verified and LGQ records verified for the same owned binding. Actual mail authentication is a separate receiver check. |
| Failed authentication or provider verification | Inspect the saved reason, actual provider status and receiver's original-message authentication results. Check aligned contractor DKIM/DMARC as well as SPF; a platform-domain PASS does not authenticate a contractor From. DNS restoration may require Check Connection to initiate re-verification. | Records restored, provider and LGQ verified, failure cleared, and an authorized product message received with passing authentication. Record detection/recovery latency and manual steps. |
| Provider binding missing / GET 404 | Use the exact saved provider ID, then confirm account/domain ownership. Restoring DNS cannot recreate a deleted provider resource. After reviewing hold and cleanup state, use the product's inline Disconnect confirmation, reconnect the same owned domain, and verify its newly returned records. Do not adopt another inventory entry merely because its name matches. | Old provider/row absent, fresh IDs recorded, new binding verified, and required fallback/recovered-send receipt evidence. September 10's provider-loss drill proves the recovery steps; its post-downgrade product fallback receipt remains open. |
| Timeout, 429, 5xx or unavailable credentials | Preserve the existing status while investigating exact provider response and LGQ logs. Use the ordinary scheduled check or a reviewed bounded retry; do not delete a healthy binding or stamp it verified. 401/403 needs Operations to repair scoped access. | Successful owned-binding read and subsequent healthy check, with the original error retained in evidence. A transport error is not evidence of missing DNS. |
| Capacity full / partial connection | Check actual provider usage and limits, pending reservations, saved provider IDs and cleanup logs. The UI can map a 422 to its capacity message; inspect the provider response before concluding the quota is exhausted. A pending row without a provider ID is not successful enrollment. Escalate an unsaved binding with its exact account/domain/provider IDs. | Reviewed slot ownership and cleanup outcome, headroom for the admitted workspace, and completed product enrollment. Do not delete the platform domain or another tenant's resource to free a slot. No automatic orphan deletion is promised. |
| Replies missing / new mail to From bounces | Inspect the received Reply-To and the workspace's Customer Reply Email setting. Customer mail uses the explicit account reply address, then the owner's sign-in address, with LGQ support as the final fallback when unresolved. LGQ's platform domain-failure alert replies to LGQ support. Sending-domain verification does not provision an inbox or incoming-mail alias. | Authorized reply received at the intended existing mailbox. A new message addressed directly to From requires a separately provisioned mailbox/alias; Black Hole Art currently has none. Do not change apex MX to solve an outbound verification issue. |
| Disabled domain | Read the reason before any action. An administrative domain hold requires Operations review; product verify/reconnect/disconnect cannot remove it. The `disabled` state prevents this custom From but can still allow platform sending. | Exact operator decision and tested resume/rollback outcome. A separate tenant-wide outbound hold, including platform fallback and queued sends, remains a launch gate; domain disable alone does not contain abusive sending. |
| Cleanup pending / disconnect failed | Refresh settings and retain the `CLEANUP_PENDING` row and provider ID. Product disconnect disables the custom sender before deletion. The scheduled reconciler retries up to ten marked cleanup rows per run; a provider 404 is already absent. A reviewed product Disconnect retry is also available. Do not reconnect or remove ownership evidence while cleanup is uncertain. | Provider GET 404 and corresponding DB row absent, released slot confirmed, no remaining cleanup error. A success toast alone is insufficient. |
| Owner alert missing or repeated | Inspect the durable notice and exact provider message history using the [notice-recovery guide](email-domain-failure-notices.md). An accepted send is not a receipt; an uncertain attempt must not be blindly resent. Repair a bad reply/owner address through the supported account settings and document recipient recovery. | Matching delivery or documented support recovery, scoped notice resolution, no duplicate, and subsequent healthy monitor. Never reset a notice to pending just to clear an incident. |

The configured domain check is daily at **06:23 UTC**. DNS caching, provider detection/reverification, outages and backlog add to that interval. Until LGQ records a downgrade, a send can still attempt the custom From. The shared transport retries once through the platform only after a definitive rejection naming that unverified sender domain; generic errors, suppression and uncertain sends do not qualify. Do not promise immediate fallback or guaranteed inbox placement.

## Responsibility and escalation

| Responsible party | Handles |
| --- | --- |
| LGQ Support / Operations | Workspace eligibility and ownership, provider bindings/access/capacity, sender selection, product links, callbacks and notice incidents, cleanup, release and rollback evidence. Brett is the current canary escalation/decision owner; staffed response expectations remain G03 acceptance. |
| Domain owner / registrar | Device/passkey approval, authoritative DNS publication and restoration, protecting existing website and inbound-mail records. LGQ supplies the exact sending records and verifies the resulting connection. |
| Existing mailbox provider / owner | Inbox or alias provisioning, inbound-mail routing, mailbox access and reply receipt. LGQ supplies From/Reply-To and delivery evidence; it does not create the contractor's inbox. |

For this canary, only BrokePipes is eligible. The restricted record holds the two approved inboxes and one deliberate test per inbox per America/New_York day; count owner alerts and website notifications before triggering a drill. Inspect provider history before repeating an uncertain send. Stop enrollment expansion on identity/authentication failures, unexplained loss/duplicates, inability to suspend, or exhausted capacity. Do not use a platform From to bypass suppression or an abuse hold.

## Read-only support snapshot

Service access only. This query is deliberately scoped to the approved BrokePipes account and discovers the current binding instead of embedding a retired ID. It changes nothing and sends no email.

```sql
select jsonb_build_object(
  'checked_at', now(),
  'domains', coalesce((
    select jsonb_agg(to_jsonb(d)) from (
      select id, account_id, domain, provider_domain_id, status,
             failure_reason, verified_at, last_checked_at
      from public.email_sending_domains
      where account_id = 'c63293b4-138e-45c2-8e11-0f4e6d7e08e6'
    ) d
  ), '[]'::jsonb),
  'open_notices', coalesce((
    select jsonb_agg(to_jsonb(n)) from (
      select id, domain_id, state, provider_id, created_at,
             attempted_at, last_error
      from public.email_domain_failure_notices
      where account_id = 'c63293b4-138e-45c2-8e11-0f4e6d7e08e6'
        and state in ('pending', 'sending', 'accepted', 'manual_review')
      order by created_at
    ) n
  ), '[]'::jsonb)
);
```

Validated against production at **September 10 13:17:31.865 UTC**: one verified matching replacement binding, no failure reason, and zero open notices. This read is neither a scheduled reconciliation run nor an additional mail/lifecycle drill.

Implementation references: [settings actions](../../src/app/dashboard/settings/email-domain-actions.ts), [provider adapter](../../src/lib/resend-domains.ts), [reconciler](../../src/lib/email-sending-domain-reconciler.ts), [sender and reply selection](../../src/lib/email-brand.ts), [definitive fallback](../../src/lib/email-domain-fallback.ts), and [notice recovery](email-domain-failure-notices.md). Broader acceptance stays in the [go-live checklist](../contractor-email-domain-go-live-checklist-2026-09-09.md).
