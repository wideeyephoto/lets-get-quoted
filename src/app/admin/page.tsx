import Link from 'next/link';
import type { ReactNode } from 'react';
import { requireAdmin } from '@/lib/auth';
import { accountDisplayName } from '@/lib/admin-accounts';
import { buildCommandCenterData, type CommandCenterMetric } from '@/lib/admin-command-center';
import {
  isDateRange,
  severityForDeadline,
  severityForDunningState,
  severityForIncident,
  severityForOnboardingAge,
  relativeAge,
  defaultCardOrder,
  type CardKey,
  type DateRange,
} from '@/lib/command-center-logic';
import { groupEmailFailures, groupSmsFailures, groupWebhookFailures } from '@/lib/admin-failure-groups';
import { stripeAdminLinks } from '@/lib/admin-payments';
import { AlertCard, type AlertItem } from './AlertCard';
import { CommandCenterBoard, type BoardCard } from './CommandCenterBoard';
import { StatCard } from './StatCard';
import styles from './admin.module.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Command Center' };

const DAY_MS = 24 * 60 * 60 * 1000;

const RANGE_TABS: { key: DateRange; label: string }[] = [
  { key: '7d', label: '7 days' },
  { key: '30d', label: '30 days' },
  { key: '90d', label: '90 days' },
];

function usd(dollars: number): string {
  const isWhole = dollars % 1 === 0;
  return `$${dollars.toLocaleString('en-US', { minimumFractionDigits: isWhole ? 0 : 2, maximumFractionDigits: 2 })}`;
}
function fmtMetric(m: CommandCenterMetric): string {
  if (!m.available) return '—';
  return m.format === 'usd' ? usd(m.value) : m.value.toLocaleString('en-US');
}
function trendClass(m: CommandCenterMetric): 'good' | 'bad' | 'flat' {
  if (m.direction === 'flat') return 'flat';
  return m.direction === m.goodDirection ? 'good' : 'bad';
}
function trendLabel(m: CommandCenterMetric): string {
  if (!m.available) return 'Data unavailable';
  if (m.deltaPct === null) return 'No prior-period data';
  const sign = m.deltaPct > 0 ? '↑ +' : m.deltaPct < 0 ? '↓ ' : '';
  return `${sign}${Math.abs(m.deltaPct).toFixed(0)}% vs. prior period`;
}
function cap(s: string): string {
  return s.length ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}
function roleLabel(role: string): string {
  return role.split('_').map(cap).join(' ');
}

const METRIC_ACCENT: Record<string, 'amber' | 'emerald' | 'indigo' | 'rose'> = {
  newAccounts: 'amber',
  paymentsProcessed: 'emerald',
  platformFees: 'indigo',
  refunds: 'rose',
};

/**
 * Where each headline number opens, carrying the range it was counted over.
 *
 * "Payments processed" is the one that returns null, and deliberately: there is
 * no payments ledger in the console yet, so every candidate destination shows a
 * different population from the one counted. A card that links somewhere
 * plausible-but-wrong is worse than one that does not link — it teaches staff
 * that the numbers and the lists agree, right up until one matters.
 */
function metricHref(key: string, range: DateRange): string | undefined {
  switch (key) {
    case 'newAccounts':
      return `/admin/accounts?joined=${range}`;
    case 'paymentsProcessed':
      return `/admin/payments?range=${range}`;
    // Both land on Money, which now honours the same range. Fees go to the top,
    // where the gross-minus-returned working is; refunds go to the table of the
    // individual refunds that make up the total.
    case 'platformFees':
      return `/admin/money?range=${range}`;
    case 'refunds':
      return `/admin/money?range=${range}#refunds`;
    default:
      return undefined;
  }
}

const METRIC_DRILL: Record<string, string> = {
  newAccounts: 'See who',
  paymentsProcessed: 'Open ledger',
  platformFees: 'See the working',
  refunds: 'See each one',
};

type CardSpec = {
  // Typed as CardKey rather than string so a card here that isn't in CARD_KEYS
  // fails to compile. The board renders by looking each key up in the saved
  // order, which is built from CARD_KEYS — a typo would silently render nothing.
  key: CardKey;
  title: string;
  items: AlertItem[];
  /**
   * What an empty card means. One string, used both as the card's own empty
   * state and as its line in the All-clear strip, so the two cannot drift —
   * and so a caveat ("cases with no SLA cannot show up here") survives the card
   * being collapsed. Several of these say what the check does NOT cover, which
   * is the part worth keeping.
   */
  empty: string;
  /** True total when `items` is a capped preview of a longer list. */
  total?: number;
  viewAllHref?: string;
  viewAllLabel?: string;
  headerExtra?: ReactNode;
  /** Where the All-clear line leads, when that differs from the card's own footer. */
  quietHref?: string;
};

function boardCard(spec: CardSpec): BoardCard {
  return {
    key: spec.key,
    title: spec.title,
    rows: spec.items.length,
    quietNote: spec.empty,
    quietHref: spec.quietHref ?? spec.viewAllHref,
    content: (
      <AlertCard
        title={spec.title}
        items={spec.items}
        count={spec.total}
        emptyMessage={spec.empty}
        viewAllHref={spec.viewAllHref}
        viewAllLabel={spec.viewAllLabel}
        headerExtra={spec.headerExtra}
      />
    ),
  };
}

export default async function AdminCommandCenterPage({ searchParams: searchParamsPromise }: { searchParams: Promise<{ range?: string }> }) {
  const searchParams = (await searchParamsPromise) || {};
  const { admin, adminEmail, role } = await requireAdmin();
  const range: DateRange = isDateRange(searchParams.range) ? searchParams.range : '30d';
  const now = new Date();

  const data = await buildCommandCenterData(admin, { role, staffEmail: adminEmail, range, now });

  // Disputes, dunning payments, and overdue Quick Stops only carry an
  // account_id — one batched name lookup covers all three. Every other card's
  // rows already embed business_name/account_number directly, so they skip this.
  const acctIds = [...new Set([
    ...data.disputes.map((d) => d.account_id),
    ...data.dunningPayments.map((d) => d.account_id),
    ...data.overdueQuickStops.map((q) => q.account_id),
    ...data.privacyRequests.map((p) => p.account_id),
  ].filter(Boolean))];
  const nameMap = new Map<string, { business_name: string | null; account_number: number | null }>();
  if (acctIds.length) {
    const { data: acctRows, error: acctErr } = await admin.from('accounts').select('id, business_name, account_number').in('id', acctIds);
    if (acctErr) console.error('command center account name lookup failed:', acctErr);
    for (const a of (acctRows ?? []) as { id: string; business_name: string | null; account_number: number | null }[]) {
      nameMap.set(a.id, a);
    }
  }
  function acctName(accountId: string): string {
    return accountDisplayName(nameMap.get(accountId) ?? {});
  }

  const incidentItems: AlertItem[] = data.incidents.map((row) => ({
    key: row.id,
    severity: row.resolved_at ? 'good' : severityForIncident(row.severity),
    status: row.resolved_at ? 'Resolved' : row.kind === 'incident' ? 'Incident' : 'Release',
    title: row.title,
    subtitle: row.description ?? undefined,
    age: relativeAge(row.started_at, now),
  }));

  const privacyRequestItems: AlertItem[] = data.privacyRequests.map((row) => {
    const severity = severityForDeadline(row.deadline_at, now);
    return {
      key: row.id,
      severity,
      status: severity === 'bad' ? 'Overdue' : 'Open',
      title: `${cap(row.kind)} request`,
      subtitle: row.details ?? undefined,
      owner: acctName(row.account_id),
      ownerHref: `/admin/accounts/${row.account_id}`,
      age: relativeAge(row.deadline_at, now),
      actionLabel: 'View queue',
      actionHref: '/admin/privacy-requests',
    };
  });

  const myCaseItems: AlertItem[] = data.myCases.map((row) => ({
    key: row.id,
    severity: severityForDeadline(row.sla_due_at, now),
    status: cap(row.status),
    title: row.subject,
    owner: row.assigned_to ?? undefined,
    age: relativeAge(row.created_at, now),
    actionLabel: 'Open case',
    actionHref: `/admin/cases/${row.id}`,
  }));

  const casesNearSlaItems: AlertItem[] = data.casesNearSla.map((row) => ({
    key: row.id,
    severity: severityForDeadline(row.sla_due_at, now),
    status: cap(row.status),
    title: row.subject,
    owner: row.assigned_to ?? 'Unassigned',
    age: relativeAge(row.created_at, now),
    actionLabel: 'Open case',
    actionHref: `/admin/cases/${row.id}`,
  }));

  const disputeItems: AlertItem[] = data.disputes.map((row) => {
    const severity = row.dispute_due_by ? severityForDeadline(row.dispute_due_by, now) : 'warn';
    const disputeUrl = stripeAdminLinks(row).find((link) => link.kind === 'dispute')?.url;
    return {
      key: row.id,
      severity,
      status: severity === 'bad' ? 'Overdue' : 'Open',
      title: `${usd(Number(row.amount) || 0)} — ${row.dispute_reason || row.dispute_status || 'dispute'}`,
      owner: acctName(row.account_id),
      ownerHref: `/admin/accounts/${row.account_id}`,
      age: relativeAge(row.disputed_at ?? row.dispute_due_by ?? now.toISOString(), now),
      actionLabel: disputeUrl ? 'Respond on Stripe' : 'Review payment',
      actionHref: disputeUrl ?? `/admin/payments/${row.id}`,
      actionExternal: Boolean(disputeUrl),
    };
  });

  const suspendedItems: AlertItem[] = data.suspendedAccounts.map((row) => ({
    key: row.id,
    severity: 'warn',
    status: 'Suspended',
    title: accountDisplayName(row),
    subtitle: row.suspended_reason ?? undefined,
    owner: row.suspended_by ?? undefined,
    age: relativeAge(row.suspended_at ?? now.toISOString(), now),
    actionLabel: 'Review account',
    actionHref: `/admin/accounts/${row.id}`,
  }));

  const overdueQuickStopItems: AlertItem[] = data.overdueQuickStops.map((row) => {
    // An already-expired row has no deadline left to be overdue against — the
    // sweep closed it and updated_at is when. Dating it by a lapsed deadline
    // would show the moment it BECAME late rather than the moment it was lost.
    const expired = row.status === 'offer_expired';
    const when = expired ? row.updated_at : (row.payment_deadline_at ?? row.response_deadline_at);
    return {
      key: row.id,
      // Expired is settled, not urgent: nobody can save it now. The live ones
      // still can be, so they keep the deadline-driven severity.
      severity: expired ? 'warn' : severityForDeadline(row.payment_deadline_at ?? row.response_deadline_at, now, DAY_MS),
      status: expired ? 'Expired unanswered' : cap(row.status.replace(/_/g, ' ')),
      title: row.client_name || 'Quick Stop',
      owner: acctName(row.account_id),
      ownerHref: `/admin/accounts/${row.account_id}`,
      age: relativeAge(when ?? now.toISOString(), now),
      actionLabel: 'View Quick Stop',
      actionHref: `/admin/quick-stops/${row.id}`,
    };
  });

  const notOnboardedItems: AlertItem[] = data.notOnboardedAccounts.map((row) => {
    const severity = severityForOnboardingAge(row.created_at, now);
    return {
      key: row.id,
      severity,
      status: severity === 'warn' ? 'Stalled' : 'New',
      title: accountDisplayName(row),
      age: relativeAge(row.created_at, now),
      actionLabel: 'View account',
      actionHref: `/admin/accounts/${row.id}`,
    };
  });

  const dunningItems: AlertItem[] = data.dunningPayments.map((row) => ({
    key: row.id,
    severity: severityForDunningState(row.dunning_state),
    status: row.dunning_state === 'exhausted' ? 'Exhausted' : row.dunning_state === 'needs_card' ? 'Needs card' : cap(row.dunning_state ?? 'Retrying'),
    title: `${usd(Number(row.amount) || 0)}${row.label ? ` — ${row.label}` : ''}`,
    subtitle: row.failure_message ?? undefined,
    owner: acctName(row.account_id),
    ownerHref: `/admin/accounts/${row.account_id}`,
    age: relativeAge(row.failed_at ?? now.toISOString(), now),
    actionLabel: 'View account',
    actionHref: `/admin/accounts/${row.account_id}`,
  }));

  const pausedPayoutItems: AlertItem[] = data.pausedPayouts.map((row) => ({
    key: row.id,
    severity: 'bad',
    status: 'Paused',
    title: accountDisplayName(row),
    age: relativeAge(row.connect_disabled_at ?? now.toISOString(), now),
    actionLabel: 'View account',
    actionHref: `/admin/accounts/${row.id}`,
  }));

  const failedSmsItems: AlertItem[] = groupSmsFailures(data.failedSms).map((group) => ({
    key: group.key,
    severity: 'warn',
    status: `${cap(group.sample.event_type.replace(/_/g, ' ')) || 'Failed'} × ${group.count}`,
    title: group.sample.phone_number,
    subtitle: group.sample.error_reason ?? undefined,
    age: relativeAge(group.latestAt, now),
    actionLabel: 'View account',
    actionHref: `/admin/accounts/${group.sample.account_id}`,
  }));

  const failedEmailItems: AlertItem[] = groupEmailFailures(data.failedEmails).map((group) => ({
    key: group.key,
    severity: 'warn',
    status: `${group.sample.status === 'complained' ? 'Complaint' : 'Bounced'} × ${group.count}`,
    title: group.sample.recipient,
    subtitle: group.sample.error_reason ?? undefined,
    age: relativeAge(group.latestAt, now),
    actionLabel: group.sample.account_id ? 'View account' : undefined,
    actionHref: group.sample.account_id ? `/admin/accounts/${group.sample.account_id}` : undefined,
  }));

  const webhookFailureItems: AlertItem[] = groupWebhookFailures(data.webhookFailures).map((group) => ({
    key: group.key,
    severity: 'bad',
    status: `${cap(group.sample.source.replace(/_/g, ' '))} × ${group.count}`,
    title: group.sample.event_type || group.sample.reference_id || 'Webhook failure',
    subtitle: group.sample.error_message,
    age: relativeAge(group.latestAt, now),
    actionLabel: 'Investigate',
    actionHref: '/admin/failures#webhooks',
  }));

  // A job that stops firing produces no errors, because nothing runs to produce
  // them — so unlike every other card here, this one is not fed by a failure
  // log. Jobs that have never reported are excluded upstream: right after the
  // heartbeat ships that is all of them, and an alert everybody dismisses on
  // day one is an alert nobody reads on day thirty.
  const cronTroubleItems: AlertItem[] = data.cronTrouble.map((row) => ({
    key: row.job,
    severity: 'bad',
    status: row.health === 'stale' ? 'Overdue' : 'Failing',
    title: row.label,
    subtitle: row.error ?? row.consequence,
    age: row.lastSuccessAt ? `last worked ${relativeAge(row.lastSuccessAt, now)}` : 'never succeeded',
    actionLabel: 'Service health',
    actionHref: '/admin/health',
  }));

  const unavailableSignals = new Set<string>(data.unavailableSignals);
  const boardCards: BoardCard[] = [
    boardCard({
      key: 'cronTrouble',
      title: 'Scheduled jobs',
      items: cronTroubleItems,
      empty: 'Every job that has reported is running on schedule.',
      viewAllHref: '/admin/health',
      viewAllLabel: 'Service health',
    }),
    // Now leads somewhere, which it never did: the table had a reader and no
    // writer, so an empty card was permanent and looked like good news.
    boardCard({
      key: 'incidents',
      title: 'Recent releases & incidents',
      items: incidentItems,
      empty: 'No recent incidents or releases have been recorded.',
      viewAllHref: '/admin/incidents',
      viewAllLabel: 'Releases & incidents',
    }),
    boardCard({
      key: 'privacyRequests',
      title: 'Privacy requests (DSAR)',
      items: privacyRequestItems,
      empty: 'No open privacy requests. 30-day statutory clock active when logged.',
      viewAllHref: '/admin/privacy-requests',
      viewAllLabel: 'Privacy requests queue',
    }),
    boardCard({ key: 'myCases', title: 'Assigned to you', items: myCaseItems, empty: 'No cases assigned to you.', quietHref: '/admin/cases' }),
    // The empty message says what the card COVERS, not just that it is empty.
    // Cases with no SLA set cannot appear here by construction, and that is
    // most of them — every case from the public contact form is created without
    // one — so "No cases approaching their SLA" was reading as an all-clear
    // over a blind spot. The count of the unseen goes in the header.
    boardCard({
      key: 'casesNearSla',
      title: 'Cases nearing SLA',
      items: casesNearSlaItems,
      empty:
        data.casesWithoutSla > 0
          ? `No case is within 48 hours of its SLA. ${data.casesWithoutSla} open ${data.casesWithoutSla === 1 ? 'case has' : 'cases have'} no SLA set and cannot show up here.`
          : 'No case is within 48 hours of its SLA.',
      headerExtra:
        data.casesWithoutSla > 0 ? (
          <Link href="/admin/cases" className={styles.rowLink} style={{ fontSize: '.75rem' }}>
            {data.casesWithoutSla} with no SLA →
          </Link>
        ) : undefined,
      quietHref: '/admin/cases',
    }),
    boardCard({ key: 'disputes', title: 'Open disputes', items: disputeItems, empty: 'No open disputes.', viewAllHref: '/admin/money', viewAllLabel: 'View money & disputes' }),
    boardCard({
      key: 'suspendedAccounts',
      title: 'Suspended accounts',
      items: suspendedItems,
      empty: 'No suspended accounts.',
      viewAllHref: '/admin/accounts?filter=suspended',
      viewAllLabel: 'All suspended accounts',
    }),
    // Renamed with the query. "Overdue" described a state the sweep clears
    // within fifteen minutes; what this can actually show is the requests that
    // ran out of time — which is the same event from the customer's side.
    // Pointed at the matching tab rather than at the default one. The card is
    // almost entirely offer_expired rows in steady state — the sweep clears the
    // live overdue states within fifteen minutes — and "Active" is the one tab
    // that excludes exactly those, so the old link landed on a longer list
    // containing none of the rows you had just been looking at.
    boardCard({
      key: 'overdueQuickStops',
      title: 'Quick Stops nobody answered',
      items: overdueQuickStopItems,
      empty: 'Every Quick Stop in the last two days got an answer.',
      viewAllHref: '/admin/quick-stops?f=unanswered',
      viewAllLabel: 'View all unanswered',
    }),
    // The count is the true total; the rows are capped at 50. Now that the card
    // can say so and hand over the rest, the number stops being a dead end.
    boardCard({
      key: 'notOnboarded',
      title: 'Not onboarded',
      items: notOnboardedItems,
      total: data.notOnboardedCount,
      empty: 'Every account is onboarded.',
      viewAllHref: '/admin/accounts?filter=not_onboarded',
      viewAllLabel: 'All not-onboarded accounts',
    }),
    boardCard({ key: 'dunning', title: 'Payment issues', items: dunningItems, empty: 'No payments needing attention.' }),
    boardCard({ key: 'pausedPayouts', title: 'Payouts paused', items: pausedPayoutItems, empty: 'No accounts with paused payouts.', viewAllHref: '/admin/money', viewAllLabel: 'View money & disputes' }),
    // The empty state says what it COVERS, not just that it is empty. Only the
    // payment and crew senders write sms_events; the rest of lib/sms.ts does
    // not, so a quiet card here has never meant "no texts failed". Saying so is
    // not a fix — logging every send is, and that is a bigger change — but a
    // card that overstates its own coverage is how staff stop checking Twilio.
    boardCard({
      key: 'failedSms',
      title: 'Failed texts',
      items: failedSmsItems,
      empty: 'No failed payment or crew texts. Other kinds of text are not tracked here yet — see Webhook failures.',
      viewAllHref: '/admin/failures#texts',
      viewAllLabel: 'All grouped text failures',
    }),
    boardCard({ key: 'failedEmails', title: 'Failed emails', items: failedEmailItems, empty: 'No bounced or complained emails.', viewAllHref: '/admin/failures#emails', viewAllLabel: 'All grouped email failures' }),
    boardCard({ key: 'webhookFailures', title: 'Webhook failures', items: webhookFailureItems, empty: 'No unresolved webhook failures.', viewAllHref: '/admin/failures#webhooks', viewAllLabel: 'All grouped webhook failures' }),
  ].map((card) => ({ ...card, available: !unavailableSignals.has(card.key) }));

  return (
    <>
      <header className={styles.pageHead}>
        <p className={styles.eyebrow}>Staff console</p>
        <div className={styles.titleRow}>
          <h1 className={styles.title}>Command Center</h1>
        </div>
        <p className={styles.lead}>Exceptions and open work across every account. Verified clear checks collapse below. Ordered for the {roleLabel(role)} role.</p>
      </header>

      <div className={styles.filterGroup}>
        <span className={styles.filterLabel}>Performance period</span>
        <nav className={styles.filterTabs} aria-label="Performance period">
          {RANGE_TABS.map((r) => (
            <Link key={r.key} href={`/admin?range=${r.key}`} aria-current={range === r.key ? 'page' : undefined} className={`${styles.filterTab} ${range === r.key ? styles.on : ''}`}>{r.label}</Link>
          ))}
        </nav>
      </div>

      <section className={styles.metricsRow}>
        {data.metrics.map((m) => (
          <StatCard
            key={m.key}
            value={fmtMetric(m)}
            label={m.label}
            href={metricHref(m.key, range)}
            drill={METRIC_DRILL[m.key]}
            accent={METRIC_ACCENT[m.key] || 'neutral'}
            tone={!m.available ? 'warn' : undefined}
          >
            <span className={`${styles.metricTrend} ${styles[trendClass(m)]}`}>{trendLabel(m)}</span>
          </StatCard>
        ))}
      </section>

      <CommandCenterBoard role={role} staffKey={adminEmail} cards={boardCards} defaultOrder={defaultCardOrder(role)} />
    </>
  );
}
