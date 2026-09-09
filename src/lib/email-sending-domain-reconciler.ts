import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/auth';
import { APP_ORIGIN } from '@/lib/app-origin';
import {
  filterSafeSendingDnsRecords,
  failureReasonFor,
  getSendingDomain,
  deleteSendingDomain,
  isSendingDomainProvisioningConfigured,
  listSendingDomains,
  toStoredStatus,
} from '@/lib/resend-domains';
import { getAccountOwnerEmail, sendSendingDomainFailedEmail } from '@/lib/email';

/**
 * The daily re-check of every custom sending domain.
 *
 * THE FAILURE THIS EXISTS FOR. Verification is a moment, not a state. A
 * contractor verifies their domain, and then three weeks later somebody tidies
 * up their DNS and deletes a TXT record they do not recognise. Resend flips the
 * domain to failed; our row still says `verified`; `loadEmailBrand` keeps
 * handing that address to every send. Nothing in the product notices until a
 * human happens to click "Check connection" again — and nobody clicks a button
 * on a thing that is working. This is the only failure mode in the sending
 * domain feature that is both silent and customer-visible.
 *
 * WHY IT RE-CHECKS `failed` ROWS TOO, not just pending and verified. A domain
 * that failed is one a contractor is actively trying to fix; re-reading it is
 * what lets it recover on its own once they put the record back. Only
 * `disabled` is terminal, because that one is set when the provider refused to
 * delete and a human needs to look.
 */

/** Bounded so one run cannot outlive its function timeout. See `remaining`. */
const MAX_DOMAINS_PER_RUN = 100;

type ReconcileRow = {
  id: string;
  account_id: string;
  domain: string;
  provider_domain_id: string | null;
  status: string;
  verified_at: string | null;
};

export type SendingDomainReconcileSummary = {
  checked: number;
  updated: number;
  downgraded: number;
  recovered: number;
  ownersNotified: number;
  orphanedAtProvider: number;
  vanishedMidRun: number;
  errors: number;
  /** Present only when the run was bounded, so a cap is never silent. */
  remaining?: number;
  skipped?: true;
  reason?: string;
};

function emptySummary(): SendingDomainReconcileSummary {
  return {
    checked: 0,
    updated: 0,
    downgraded: 0,
    recovered: 0,
    ownersNotified: 0,
    orphanedAtProvider: 0,
    vanishedMidRun: 0,
    errors: 0,
  };
}

/**
 * Domains at the provider that are ours by definition and must never be
 * reported as orphans: the platform's own sending domain and anything beneath
 * it. Without this the summary would report a permanent orphan count of at
 * least one, every single day, and a number that is always wrong is a number
 * everyone learns to ignore.
 */
function isPlatformOwnedDomain(name: string): boolean {
  const root = (process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'letsgetquoted.com').trim().toLowerCase();
  return name === root || name.endsWith(`.${root}`);
}

async function notifyOwner(
  admin: SupabaseClient,
  row: ReconcileRow,
  reason: string | null,
): Promise<boolean> {
  const recipientEmail = await getAccountOwnerEmail(admin, row.account_id);
  if (!recipientEmail) {
    // Counted as an error by the caller. A verified sending domain that broke
    // with nobody reachable to tell is a real gap, not a quiet no-op.
    console.error(
      `[email-domain-reconcile] no owner email for account ${row.account_id}; ${row.domain} downgraded unannounced`,
    );
    return false;
  }

  const { data: site } = await admin
    .from('sites')
    .select('company_name')
    .eq('account_id', row.account_id)
    .maybeSingle();

  await sendSendingDomainFailedEmail({
    recipientEmail,
    businessName: (site?.company_name as string | null)?.trim() || 'your business',
    domain: row.domain,
    accountId: row.account_id,
    reason,
    settingsUrl: `${APP_ORIGIN}/dashboard/settings`,
  });
  return true;
}

export async function runEmailSendingDomainReconcile(
  client?: SupabaseClient,
): Promise<SendingDomainReconcileSummary> {
  const summary = emptySummary();

  // Not gated on the feature flag, on purpose. The flag decides whether the
  // dashboard offers the section; it says nothing about whether rows already
  // exist. A domain verified while the flag was on stays live in every send
  // path after it is switched off, so it still has to be reconciled.
  if (!(await isSendingDomainProvisioningConfigured())) {
    return { ...summary, skipped: true, reason: 'RESEND_API_KEY is not configured' };
  }

  const admin = client ?? createAdminClient();

  const res = (await admin
    .from('email_sending_domains')
    .select('id, account_id, domain, provider_domain_id, status, verified_at', { count: 'exact' })
    .in('status', ['pending', 'verified', 'failed'])
    .order('last_checked_at', { ascending: true, nullsFirst: true })
    .limit(MAX_DOMAINS_PER_RUN + 1)) as { data: ReconcileRow[] | null; count?: number | null; error: { message: string } | null };
  if (res.error) throw new Error(`Could not load sending domains: ${res.error.message}`);

  const all = res.data ?? [];
  const rows = all.slice(0, MAX_DOMAINS_PER_RUN);
  if (res.count != null && res.count > MAX_DOMAINS_PER_RUN) {
    // Exact backlog count from total matching rows
    summary.remaining = res.count - MAX_DOMAINS_PER_RUN;
  } else if (all.length > MAX_DOMAINS_PER_RUN) {
    // Fallback when count is not returned by the client
    summary.remaining = all.length - MAX_DOMAINS_PER_RUN;
  }

  for (const row of rows) {
    summary.checked += 1;
    try {
      if (!row.provider_domain_id) {
        // Nothing to ask the provider about. Not an error: a row can exist
        // without a binding if creation failed partway.
        continue;
      }

      const provider = await getSendingDomain(row.provider_domain_id);

      // A 404 is the provider saying the domain is gone — deleted from the
      // Resend account out from under us. That is a genuine downgrade, not a
      // read failure, and treating it as `failed` is what stops us sending from
      // an address the provider will now refuse.
      const storedStatus = provider ? toStoredStatus(provider.status) : 'failed';
      const reason = provider
        ? failureReasonFor(provider.status)
        : 'This domain is no longer registered with the email provider. Reconnect it to start sending from it again.';

      const wasVerified = row.status === 'verified';
      const isVerified = storedStatus === 'verified';

      const patch: Record<string, unknown> = {
        status: storedStatus,
        last_checked_at: new Date().toISOString(),
        failure_reason: reason,
        verified_at: isVerified ? row.verified_at || new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      };
      if (provider) {
        // The apex-MX guard applies here too: the provider can change its
        // recommended records at any time, and this is the other place those
        // records enter the database.
        const { safeRecords, warnings } = filterSafeSendingDnsRecords(provider.records, row.domain);
        patch.dns_records = safeRecords;
        for (const warning of warnings) {
          console.warn(`[email-domain-reconcile] ${warning}`);
        }
      }

      const { data: updated, error: updateError } = await admin
        .from('email_sending_domains')
        .update(patch)
        .eq('id', row.id)
        .eq('account_id', row.account_id)
        .eq('domain', row.domain)
        .neq('status', 'disabled')
        .select('id')
        .maybeSingle();
      if (updateError) throw new Error(updateError.message);
      if (!updated) {
        // An accepted statement is not a changed row. The owner disconnected or
        // renamed the domain, or an administrative hold was applied while this run was in flight;
        // benign, but it must not be counted as a successful reconcile.
        summary.vanishedMidRun += 1;
        continue;
      }

      if (storedStatus !== row.status) summary.updated += 1;
      if (wasVerified && !isVerified) {
        summary.downgraded += 1;
        // Only on the verified -> broken TRANSITION. The row is now `failed`,
        // so tomorrow's run sees a different previous status and stays quiet:
        // one email per breakage, not one per day until it is fixed.
        try {
          if (await notifyOwner(admin, row, reason)) summary.ownersNotified += 1;
          else summary.errors += 1;
        } catch (notifyError) {
          summary.errors += 1;
          console.error(
            `[email-domain-reconcile] failed to notify owner for ${row.domain}:`,
            notifyError instanceof Error ? notifyError.message : notifyError,
          );
        }
      }
      if (!wasVerified && isVerified) summary.recovered += 1;
    } catch (rowError) {
      summary.errors += 1;
      console.error(
        `[email-domain-reconcile] ${row.domain} failed:`,
        rowError instanceof Error ? rowError.message : rowError,
      );
    }
  }

  // C08: Recoverable cleanup sweep for domains marked CLEANUP_PENDING
  try {
    const { data: cleanupRows, error: cleanupFetchError } = await admin
      .from('email_sending_domains')
      .select('id, account_id, domain, provider_domain_id')
      .eq('status', 'disabled')
      .ilike('failure_reason', '%CLEANUP_PENDING%')
      .limit(10);

    if (cleanupFetchError) {
      console.warn('[email-domain-reconcile] failed to fetch cleanup rows:', cleanupFetchError.message);
    } else {
      for (const cRow of cleanupRows ?? []) {
        let deleted = true;
        if (cRow.provider_domain_id) {
          deleted = await deleteSendingDomain(cRow.provider_domain_id);
        }
        if (deleted) {
          await admin
            .from('email_sending_domains')
            .delete()
            .eq('id', cRow.id)
            .eq('account_id', cRow.account_id);
          summary.updated += 1;
        }
      }
    }
  } catch (cleanupError) {
    console.warn('[email-domain-reconcile] cleanup sweep error:', cleanupError);
  }

  // Domains registered at the provider with no row behind them. Reported for a
  // human, never deleted: an automated delete here would race a connection that
  // is mid-creation and destroy a domain a contractor is in the middle of
  // verifying.
  try {
    const providerDomains = await listSendingDomains();
    if (providerDomains) {
      const { data: known, error: knownError } = await admin
        .from('email_sending_domains')
        .select('provider_domain_id');
      if (knownError) throw new Error(knownError.message);
      const knownIds = new Set(
        ((known ?? []) as Array<{ provider_domain_id: string | null }>)
          .map((r) => r.provider_domain_id)
          .filter((id): id is string => Boolean(id)),
      );
      const orphans = providerDomains.filter(
        (d) => !knownIds.has(d.id) && !isPlatformOwnedDomain(d.name),
      );
      summary.orphanedAtProvider = orphans.length;
      if (orphans.length) {
        console.warn(
          `[email-domain-reconcile] ${orphans.length} domain(s) at the provider with no row: ${orphans
            .map((d) => d.name)
            .join(', ')}`,
        );
      }
    }
  } catch (orphanError) {
    summary.errors += 1;
    console.error(
      '[email-domain-reconcile] orphan sweep failed:',
      orphanError instanceof Error ? orphanError.message : orphanError,
    );
  }

  return summary;
}
