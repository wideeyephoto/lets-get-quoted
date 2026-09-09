import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/auth';
import { APP_ORIGIN } from '@/lib/app-origin';
import { verifyDomain } from '@/lib/domains';
import { isVercelDomainProvisioningConfigured, listProjectDomains } from '@/lib/vercel-domains';
import { revalidatePublicSiteCache } from '@/lib/cached-sites';
import { getAccountOwnerEmail, sendCustomDomainConnectedEmail } from '@/lib/email';

/**
 * The wait between "DNS is right" and "the certificate exists".
 *
 * THE FAILURE THIS EXISTS FOR. Certificate issuance is asynchronous and takes
 * minutes to hours. `verifyCustomDomainAction` refuses to stamp a domain until
 * a real TLS handshake succeeds, which is correct — but it only ever runs when
 * a human clicks "Check connection". So a contractor who did everything right
 * adds their records, sees "a secure connection is not available yet", closes
 * the tab, and their domain then goes live with nothing to notice it and
 * nothing to tell them. The dashboard keeps saying pending until they happen to
 * come back and click again. This job is the thing that comes back and clicks.
 *
 * WHY IT ONLY EVER PROMOTES. Serving is gated on `custom_domain_verified_at`:
 * every route under src/app/site-domain/[domain] calls notFound() without it.
 * Clearing that stamp on a domain that is already live would take a paying
 * contractor's website down — for a DNS blip, a slow resolver, or the seconds a
 * certificate spends renewing. A stale "connected" badge on a domain the owner
 * themselves broke is a far smaller harm than an outage we caused, so this job
 * can move a row forward and never backward. The re-check that catches a live
 * domain going bad is a different job needing its own paced state; see
 * docs/custom-domain-tls.md.
 *
 * The counterpart for email sending domains is
 * `runEmailSendingDomainReconcile`, which does downgrade — because there
 * nothing is being served, and the downgrade only changes which From address
 * an email goes out under.
 */

/**
 * Bounded so one run cannot outlive its function timeout. Each row costs a DNS
 * lookup, up to three provider API calls, and a TLS handshake.
 */
const MAX_DOMAINS_PER_RUN = 25;

/**
 * A domain saved and then abandoned would otherwise be probed every fifteen
 * minutes forever. After a month of the records never appearing this stops
 * asking; saving the domain again in the builder moves `updated_at` and puts
 * the row back in scope.
 */
const PENDING_WINDOW_DAYS = 30;

type ReconcileRow = {
  id: string;
  account_id: string;
  custom_domain: string;
  subdomain: string | null;
  company_name: string | null;
};

export type CustomDomainReconcileSummary = {
  checked: number;
  /** Rows promoted from pending to connected on this run. */
  connected: number;
  stillPending: number;
  ownersNotified: number;
  vanishedMidRun: number;
  /** Bindings on the project with no site row behind them. Reported, never deleted. */
  orphanedAtProject: number;
  errors: number;
  /** Present only when the run was bounded, so a cap is never silent. */
  remaining?: number;
  skipped?: true;
  reason?: string;
};

function emptySummary(): CustomDomainReconcileSummary {
  return {
    checked: 0,
    connected: 0,
    stillPending: 0,
    ownersNotified: 0,
    vanishedMidRun: 0,
    orphanedAtProject: 0,
    errors: 0,
  };
}

/**
 * Domains that are ours by definition and must never be reported as orphans:
 * the platform domain, anything beneath it, and Vercel's own preview hosts. A
 * count that is always wrong is a count everyone learns to ignore.
 */
function isPlatformOwnedDomain(name: string): boolean {
  const root = (process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'letsgetquoted.com').trim().toLowerCase();
  return name === root || name.endsWith(`.${root}`) || name.endsWith('.vercel.app');
}

async function notifyOwner(admin: SupabaseClient, row: ReconcileRow): Promise<boolean> {
  const recipientEmail = await getAccountOwnerEmail(admin, row.account_id);
  if (!recipientEmail) {
    // Counted as an error by the caller. Connecting a domain and telling nobody
    // leaves the contractor still waiting for a thing that already happened.
    console.error(
      `[custom-domain-reconcile] no owner email for account ${row.account_id}; ${row.custom_domain} connected unannounced`,
    );
    return false;
  }

  await sendCustomDomainConnectedEmail({
    recipientEmail,
    businessName: row.company_name?.trim() || 'your business',
    domain: row.custom_domain,
    accountId: row.account_id,
    siteUrl: `https://${row.custom_domain}`,
    settingsUrl: `${APP_ORIGIN}/dashboard/sites`,
  });
  return true;
}

export async function runCustomDomainReconcile(
  client?: SupabaseClient,
): Promise<CustomDomainReconcileSummary> {
  const summary = emptySummary();

  if (!isVercelDomainProvisioningConfigured()) {
    // Without the credentials `verifyDomain` can neither attach nor read
    // anything and reports every row unconfigured. Say that, rather than
    // recording a run that checked nothing and calling it a success.
    return {
      ...summary,
      skipped: true,
      reason: 'VERCEL_AUTH_TOKEN/VERCEL_PROJECT_ID are not configured',
    };
  }

  const admin = client ?? createAdminClient();
  const since = new Date(Date.now() - PENDING_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await admin
    .from('sites')
    .select('id, account_id, custom_domain, subdomain, company_name')
    .not('custom_domain', 'is', null)
    .is('custom_domain_verified_at', null)
    .gte('updated_at', since)
    // Oldest first, so a bounded run still reaches everything over a few
    // cycles rather than starving the tail forever.
    .order('updated_at', { ascending: true })
    .limit(MAX_DOMAINS_PER_RUN + 1);
  if (error) throw new Error(`Could not load pending custom domains: ${error.message}`);

  const all = ((data ?? []) as ReconcileRow[]).filter((row) => Boolean(row.custom_domain));
  const rows = all.slice(0, MAX_DOMAINS_PER_RUN);
  if (all.length > MAX_DOMAINS_PER_RUN) summary.remaining = all.length - MAX_DOMAINS_PER_RUN;

  for (const row of rows) {
    summary.checked += 1;
    try {
      // Provisioning stays ON here. A row saved while the credentials were
      // missing has no binding at all, so a read-only check could never
      // recover it — this is also the retry for a first attach that failed.
      const verification = await verifyDomain(row.custom_domain);
      if (!verification.verified || verification.sslStatus !== 'issued') {
        summary.stillPending += 1;
        continue;
      }

      // The same guard the interactive action uses: tie the write to the row
      // AND the domain, so a check that started before the owner changed or
      // disconnected the domain cannot stamp the replacement as verified.
      const { data: updated, error: updateError } = await admin
        .from('sites')
        .update({ custom_domain_verified_at: new Date().toISOString() })
        .eq('id', row.id)
        .eq('account_id', row.account_id)
        .eq('custom_domain', row.custom_domain)
        .is('custom_domain_verified_at', null)
        .select('id')
        .maybeSingle();
      if (updateError) throw new Error(updateError.message);
      if (!updated) {
        // An accepted statement is not a changed row.
        summary.vanishedMidRun += 1;
        continue;
      }

      summary.connected += 1;
      // The public site is cached per host. Without this the domain keeps
      // serving the not-found it was cached with while it was unverified.
      revalidatePublicSiteCache({ subdomain: row.subdomain, customDomain: row.custom_domain });

      try {
        if (await notifyOwner(admin, row)) summary.ownersNotified += 1;
        else summary.errors += 1;
      } catch (notifyError) {
        summary.errors += 1;
        console.error(
          `[custom-domain-reconcile] failed to notify owner for ${row.custom_domain}:`,
          notifyError instanceof Error ? notifyError.message : notifyError,
        );
      }
    } catch (rowError) {
      summary.errors += 1;
      console.error(
        `[custom-domain-reconcile] ${row.custom_domain} failed:`,
        rowError instanceof Error ? rowError.message : rowError,
      );
    }
  }

  // Bindings the project still holds with no site row behind them: the residue
  // of a deletion path that could not hand its domain back. Reported for a
  // human, never deleted — an automated delete here would race a domain a
  // contractor is in the middle of connecting and destroy it mid-setup.
  try {
    const attached = await listProjectDomains();
    if (attached) {
      const { data: known, error: knownError } = await admin
        .from('sites')
        .select('custom_domain')
        .not('custom_domain', 'is', null);
      if (knownError) throw new Error(knownError.message);
      const claimed = new Set(
        ((known ?? []) as Array<{ custom_domain: string | null }>)
          .map((row) => row.custom_domain?.trim().toLowerCase())
          .filter((domain): domain is string => Boolean(domain)),
      );
      const orphans = attached.filter((name) => !claimed.has(name) && !isPlatformOwnedDomain(name));
      summary.orphanedAtProject = orphans.length;
      if (orphans.length) {
        console.warn(
          `[custom-domain-reconcile] ${orphans.length} domain(s) attached to the project with no site row: ${orphans.join(', ')}`,
        );
      }
    }
  } catch (orphanError) {
    summary.errors += 1;
    console.error(
      '[custom-domain-reconcile] orphan sweep failed:',
      orphanError instanceof Error ? orphanError.message : orphanError,
    );
  }

  return summary;
}
