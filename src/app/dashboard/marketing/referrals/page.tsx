import { requireOwnerContext } from '@/lib/auth';
import { getLeadTriage, type LeadTriage } from '@/lib/leads';
import {
  buildReferralQueue,
  quickStopReferralStatus,
  type ReferralQueueLead,
} from '@/lib/referral-queue';
import { isReferralConfigured, mintReferralCode, referralLink } from '@/lib/referral';
import { buildReferralShareText } from '@/lib/referrals';
import { applyTestRecordFilter } from '@/lib/test-records';
import MarketingNav from '../MarketingNav';
import { setReferralRewardAction, settleReferralAction, unsettleReferralAction } from './actions';
import ReferralsClient, {
  type ClientLinkItem,
  type AdvocateItem,
  type RevenueMetrics,
} from './ReferralsClient';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Referrals · Marketing',
  description: 'Manage customer referral links, track incoming leads, and settle thank-you rewards.',
};

/**
 * Marketing Referrals: Track incoming word-of-mouth leads, mint personal referral links,
 * and settle thank-you rewards owed to your customers.
 */
export default async function ReferralsPage() {
  const { supabase, accountId } = await requireOwnerContext();

  // Load leads, extra_stop_requests, account settings, site config, and client roster concurrently.
  const [
    { data: leadRows, error: leadsError },
    { data: stopRows, error: stopsError },
    { data: accountRow },
    { data: siteRow },
    { data: allClients },
  ] = await Promise.all([
    applyTestRecordFilter(
      supabase
        .from('leads')
        .select('id, name, phone, email, status, client_id, created_at, referral_settled_at, triage')
        .eq('account_id', accountId)
        .is('deleted_at', null)
        .not('triage->>referredBy', 'is', null),
    ).order('created_at', { ascending: false }),
    applyTestRecordFilter(
      supabase
        .from('extra_stop_requests')
        .select('id, client_name, client_phone, client_email, status, client_id, created_at, referral_settled_at, intake, fee_cents, diagnostic_fee_cents')
        .eq('account_id', accountId)
        .not('intake->>referredBy', 'is', null),
    ).order('created_at', { ascending: false }),
    supabase
      .from('accounts')
      .select('referral_reward, business_name')
      .eq('id', accountId)
      .maybeSingle(),
    supabase
      .from('sites')
      .select('published, subdomain')
      .eq('account_id', accountId)
      .maybeSingle(),
    supabase
      .from('clients')
      .select('id, name, phone, email, created_at')
      .eq('account_id', accountId)
      .is('deleted_at', null)
      .order('name', { ascending: true })
      .limit(200),
  ]);

  const rawLeads = leadRows ?? [];
  const leadIds = rawLeads.map((l) => l.id as string);

  // Revenue attribution lookup: join jobs tied to referred leads
  const jobMap = new Map<string, number>();
  if (leadIds.length > 0) {
    const { data: jobs } = await supabase
      .from('jobs')
      .select('lead_id, quoted_amount, status')
      .eq('account_id', accountId)
      .in('lead_id', leadIds);

    for (const j of jobs ?? []) {
      if (j.lead_id) {
        jobMap.set(j.lead_id as string, Number(j.quoted_amount) || 0);
      }
    }
  }

  const reward = ((accountRow?.referral_reward as string | null) ?? '').trim();
  const businessName = ((accountRow?.business_name as string | null) ?? '').trim() || 'our company';

  const origin = (process.env.NEXT_PUBLIC_APP_URL || `https://${process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'letsgetquoted.com'}`).replace(/\/$/, '');
  const bookingUrl = siteRow?.published && siteRow?.subdomain ? `${origin}/book/${siteRow.subdomain}` : null;
  const configured = isReferralConfigured();

  type ReferredLeadRow = ReferralQueueLead & { triage: LeadTriage | null };
  const referredBy = new Map<string, string>();
  const referred: ReferralQueueLead[] = (rawLeads as unknown as ReferredLeadRow[]).filter((lead) => {
    const who = getLeadTriage(lead).referredBy;
    if (!who) return false;
    referredBy.set(lead.id, who);
    lead.value = jobMap.get(lead.id) || 0;
    return true;
  });

  type StopRow = {
    id: string;
    client_name: string | null;
    client_phone: string | null;
    client_email: string | null;
    status: string;
    client_id: string | null;
    created_at: string;
    referral_settled_at: string | null;
    fee_cents?: number | null;
    diagnostic_fee_cents?: number | null;
    intake: { referredBy?: unknown } | null;
  };

  for (const stop of (stopRows ?? []) as unknown as StopRow[]) {
    const who = stop.intake?.referredBy;
    if (typeof who !== 'string' || !who) continue;
    referredBy.set(stop.id, who);
    const stopVal = ((Number(stop.fee_cents) || 0) + (Number(stop.diagnostic_fee_cents) || 0)) / 100;
    referred.push({
      id: stop.id,
      source: 'quick_stop',
      name: stop.client_name,
      phone: stop.client_phone,
      email: stop.client_email,
      status: quickStopReferralStatus(stop.status),
      client_id: stop.client_id,
      created_at: stop.created_at,
      referral_settled_at: stop.referral_settled_at,
      value: stopVal,
    });
  }

  // Collect referrer names
  const referrerIds = [...new Set([...referredBy.values()])];
  const names = new Map<string, string>();
  if (referrerIds.length > 0) {
    const { data: clientRows } = await supabase
      .from('clients')
      .select('id, name')
      .eq('account_id', accountId)
      .in('id', referrerIds);
    for (const row of clientRows ?? []) {
      names.set(row.id as string, (row.name as string) || '');
    }
  }

  // Also pre-fill names from allClients if present
  for (const c of allClients ?? []) {
    if (!names.has(c.id as string)) {
      names.set(c.id as string, (c.name as string) || '');
    }
  }

  const queue = buildReferralQueue(
    referred,
    (lead) => referredBy.get(lead.id) ?? null,
    (clientId) => names.get(clientId) || null,
  );

  // Mint customer referral links for distribution
  const clientLinks: ClientLinkItem[] = [];
  for (const c of allClients ?? []) {
    let code = '';
    let url = '';
    if (configured && bookingUrl) {
      try {
        code = mintReferralCode(accountId, c.id as string);
        url = referralLink(bookingUrl, code);
      } catch {
        // Fallback gracefully
      }
    }
    const shareText = buildReferralShareText({
      referrerName: (c.name as string) || 'I',
      businessName,
      shareUrl: url || bookingUrl || origin,
    });

    clientLinks.push({
      id: c.id as string,
      name: (c.name as string) || 'Customer',
      phone: (c.phone as string | null) ?? null,
      email: (c.email as string | null) ?? null,
      referralCode: code,
      referralUrl: url,
      shareText,
    });
  }

  // Aggregate Top Advocates
  const advocateMap = new Map<string, { totalSent: number; totalWon: number; revenue: number; owedCount: number }>();
  for (const row of [...queue.owed, ...queue.waiting, ...queue.thanked]) {
    const prior = advocateMap.get(row.referrerClientId) || { totalSent: 0, totalWon: 0, revenue: 0, owedCount: 0 };
    prior.totalSent += (row.leadIds.length + row.stopIds.length) || 1;
    if (row.stage === 'booked' || row.stage === 'thanked') {
      prior.totalWon += 1;
      prior.revenue += row.value || 0;
    }
    if (row.stage === 'booked') {
      prior.owedCount += 1;
    }
    advocateMap.set(row.referrerClientId, prior);
  }

  const advocates: AdvocateItem[] = [...advocateMap.entries()]
    .map(([clientId, stats]) => {
      const name = names.get(clientId) || 'Past customer';
      const clientRecord = (allClients ?? []).find((c) => c.id === clientId);
      let refUrl = '';
      if (configured && bookingUrl) {
        try {
          refUrl = referralLink(bookingUrl, mintReferralCode(accountId, clientId));
        } catch {
          // ignore
        }
      }
      return {
        clientId,
        name,
        phone: (clientRecord?.phone as string | null) ?? null,
        email: (clientRecord?.email as string | null) ?? null,
        totalSent: stats.totalSent,
        totalWon: stats.totalWon,
        revenue: stats.revenue,
        owedCount: stats.owedCount,
        referralUrl: refUrl,
        shareText: buildReferralShareText({
          referrerName: name,
          businessName,
          shareUrl: refUrl || bookingUrl || origin,
        }),
      };
    })
    .sort((a, b) => b.revenue - a.revenue || b.totalWon - a.totalWon || b.totalSent - a.totalSent);

  // Compute Revenue Metrics
  const totalWonRevenue = [...queue.owed, ...queue.thanked].reduce((sum, r) => sum + (r.value || 0), 0);
  const metrics: RevenueMetrics = {
    totalWonRevenue,
    totalReferrals: queue.owed.length + queue.waiting.length + queue.thanked.length,
    totalWon: queue.owed.length + queue.thanked.length,
    totalOwed: queue.owed.length,
    totalThanked: queue.thanked.length,
  };

  return (
    <main className="wide-shell workspace-shell">
      <MarketingNav referralsOwedCount={queue.owed.length} />

      <section className="workspace-hero panel marketing-hero">
        <div className="workspace-hero-copy">
          <p className="eyebrow">Marketing · Referrals</p>
          <h1 className="workspace-title">Who sent you work</h1>
          <p className="workspace-lead">
            Every customer who sends someone your way gets their own link. When that person books, they show up here — so you can say thank
            you, and track the revenue they created.
          </p>
        </div>
      </section>

      <ReferralsClient
        queue={queue}
        reward={reward}
        configured={configured}
        bookingUrl={bookingUrl}
        businessName={businessName}
        clientLinks={clientLinks}
        advocates={advocates}
        metrics={metrics}
        basePath="/dashboard"
        leadsError={Boolean(leadsError)}
        stopsError={Boolean(stopsError)}
        onSettleAction={settleReferralAction}
        onUnsettleAction={unsettleReferralAction}
        onSetRewardAction={setReferralRewardAction}
      />
    </main>
  );
}
