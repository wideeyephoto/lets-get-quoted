import Link from 'next/link';
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
  type DateRange,
} from '@/lib/command-center-logic';
import { permissionsFor } from '@/lib/staff';
import { AlertCard, type AlertItem } from './AlertCard';
import { CommandCenterBoard, type BoardCard } from './CommandCenterBoard';
import { StatCard } from './StatCard';
import { resolveWebhookFailureAction } from './actions';
import styles from './admin.module.css';

export const dynamic = 'force-dynamic';

const DAY_MS = 24 * 60 * 60 * 1000;

const RANGE_TABS: { key: DateRange; label: string }[] = [
  { key: '7d', label: '7 days' },
  { key: '30d', label: '30 days' },
  { key: '90d', label: '90 days' },
];

function usd(dollars: number): string {
  return `$${dollars.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}
function fmtMetric(m: CommandCenterMetric): string {
  return m.format === 'usd' ? usd(m.value) : m.value.toLocaleString('en-US');
}
function trendClass(m: CommandCenterMetric): 'good' | 'bad' | 'flat' {
  if (m.direction === 'flat') return 'flat';
  return m.direction === m.goodDirection ? 'good' : 'bad';
}
function trendLabel(m: CommandCenterMetric): string {
  if (m.deltaPct === null) return 'No prior-period data';
  const sign = m.deltaPct > 0 ? '+' : '';
  return `${sign}${m.deltaPct.toFixed(0)}% vs. prior period`;
}
function cap(s: string): string {
  return s.length ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

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
  platformFees: 'See the working',
  refunds: 'See each one',
};

export default async function AdminCommandCenterPage({ searchParams }: { searchParams: { range?: string } }) {
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
    return {
      key: row.id,
      severity,
      status: severity === 'bad' ? 'Overdue' : 'Open',
      title: `${usd(Number(row.amount) || 0)} — ${row.dispute_reason || row.dispute_status || 'dispute'}`,
      owner: acctName(row.account_id),
      ownerHref: `/admin/accounts/${row.account_id}`,
      age: relativeAge(row.disputed_at ?? row.dispute_due_by ?? now.toISOString(), now),
      actionLabel: row.stripe_dispute_id ? 'Respond on Stripe' : 'View account',
      actionHref: row.stripe_dispute_id ? `https://dashboard.stripe.com/disputes/${row.stripe_dispute_id}` : `/admin/accounts/${row.account_id}`,
      actionExternal: Boolean(row.stripe_dispute_id),
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

  const failedSmsItems: AlertItem[] = data.failedSms.map((row) => ({
    key: row.id,
    severity: 'warn',
    status: cap(row.event_type.replace(/_/g, ' ')) || 'Failed',
    title: row.phone_number,
    subtitle: row.error_reason ?? undefined,
    age: relativeAge(row.created_at, now),
    actionLabel: 'View account',
    actionHref: `/admin/accounts/${row.account_id}`,
  }));

  const failedEmailItems: AlertItem[] = data.failedEmails.map((row) => ({
    key: row.id,
    severity: 'warn',
    status: row.status === 'complained' ? 'Complaint' : 'Bounced',
    title: row.recipient,
    subtitle: row.error_reason ?? undefined,
    age: relativeAge(row.occurred_at, now),
    actionLabel: row.account_id ? 'View account' : undefined,
    actionHref: row.account_id ? `/admin/accounts/${row.account_id}` : undefined,
  }));

  // resolveWebhookFailureAction requires ops.manage, which only ops and
  // super_admin hold. The button used to render for every role, and since
  // requirePermission throws before anything else runs — with no error boundary
  // under /app — a support user clicking it got Next's generic crash screen and
  // lost their range selection. Hide the control, keep the server check.
  const mayManageOps = permissionsFor(role).includes('ops.manage');
  const webhookFailureItems: AlertItem[] = data.webhookFailures.map((row) => ({
    key: row.id,
    severity: 'bad',
    status: cap(row.source.replace(/_/g, ' ')),
    title: row.event_type || row.reference_id || 'Webhook failure',
    subtitle: row.error_message,
    age: relativeAge(row.created_at, now),
    actionNode: mayManageOps ? (
      <form action={resolveWebhookFailureAction.bind(null, row.id)}>
        <button type="submit" className={styles.rowLink} style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', cursor: 'pointer' }}>
          Mark resolved →
        </button>
      </form>
    ) : undefined,
  }));

  const boardCards: BoardCard[] = [
    // Now leads somewhere, which it never did: the table had a reader and no
    // writer, so an empty card was permanent and looked like good news.
    { key: 'incidents', title: 'Recent releases & incidents', content: <AlertCard title="Recent releases & incidents" items={incidentItems} emptyMessage="Nothing logged yet — write one up on the Incidents page." viewAllHref="/admin/incidents" viewAllLabel="Releases & incidents" /> },
    { key: 'myCases', title: 'Assigned to you', content: <AlertCard title="Assigned to you" items={myCaseItems} emptyMessage="No cases assigned to you." /> },
    // The empty message says what the card COVERS, not just that it is empty.
    // Cases with no SLA set cannot appear here by construction, and that is
    // most of them — every case from the public contact form is created without
    // one — so "No cases approaching their SLA" was reading as an all-clear
    // over a blind spot. The count of the unseen goes in the header.
    {
      key: 'casesNearSla',
      title: 'Cases nearing SLA',
      content: (
        <AlertCard
          title="Cases nearing SLA"
          items={casesNearSlaItems}
          emptyMessage={
            data.casesWithoutSla > 0
              ? `No case is within 48 hours of its SLA. ${data.casesWithoutSla} open ${data.casesWithoutSla === 1 ? 'case has' : 'cases have'} no SLA set and cannot show up here.`
              : 'No case is within 48 hours of its SLA.'
          }
          headerExtra={
            data.casesWithoutSla > 0 ? (
              <Link href="/admin/cases" className={styles.rowLink} style={{ fontSize: '.75rem' }}>
                {data.casesWithoutSla} with no SLA →
              </Link>
            ) : undefined
          }
        />
      ),
    },
    { key: 'disputes', title: 'Open disputes', content: <AlertCard title="Open disputes" items={disputeItems} emptyMessage="No open disputes." viewAllHref="/admin/money" viewAllLabel="View money & disputes" /> },
    { key: 'suspendedAccounts', title: 'Suspended accounts', content: <AlertCard title="Suspended accounts" items={suspendedItems} emptyMessage="No suspended accounts." /> },
    // Renamed with the query. "Overdue" described a state the sweep clears
    // within fifteen minutes; what this can actually show is the requests that
    // ran out of time — which is the same event from the customer's side.
    // Pointed at the matching tab rather than at the default one. The card is
    // almost entirely offer_expired rows in steady state — the sweep clears the
    // live overdue states within fifteen minutes — and "Active" is the one tab
    // that excludes exactly those, so the old link landed on a longer list
    // containing none of the rows you had just been looking at.
    { key: 'overdueQuickStops', title: 'Quick Stops nobody answered', content: <AlertCard title="Quick Stops nobody answered" items={overdueQuickStopItems} emptyMessage="Every Quick Stop in the last two days got an answer." viewAllHref="/admin/quick-stops?f=unanswered" viewAllLabel="View all unanswered" /> },
    // The count is the true total; the rows are capped at 50. Now that the card
    // can say so and hand over the rest, the number stops being a dead end.
    { key: 'notOnboarded', title: 'Not onboarded', content: <AlertCard title="Not onboarded" items={notOnboardedItems} count={data.notOnboardedCount} emptyMessage="Every account is onboarded." viewAllHref="/admin/accounts?filter=not_onboarded" viewAllLabel="All not-onboarded accounts" /> },
    { key: 'dunning', title: 'Payment issues', content: <AlertCard title="Payment issues" items={dunningItems} emptyMessage="No payments needing attention." /> },
    { key: 'pausedPayouts', title: 'Payouts paused', content: <AlertCard title="Payouts paused" items={pausedPayoutItems} emptyMessage="No accounts with paused payouts." viewAllHref="/admin/money" viewAllLabel="View money & disputes" /> },
    // The empty state says what it COVERS, not just that it is empty. Only the
    // payment and crew senders write sms_events; the rest of lib/sms.ts does
    // not, so a quiet card here has never meant "no texts failed". Saying so is
    // not a fix — logging every send is, and that is a bigger change — but a
    // card that overstates its own coverage is how staff stop checking Twilio.
    { key: 'failedSms', title: 'Failed texts', content: <AlertCard title="Failed texts" items={failedSmsItems} emptyMessage="No failed payment or crew texts. Other kinds of text are not tracked here yet — see Webhook failures." /> },
    { key: 'failedEmails', title: 'Failed emails', content: <AlertCard title="Failed emails" items={failedEmailItems} emptyMessage="No bounced or complained emails." /> },
    { key: 'webhookFailures', title: 'Webhook failures', content: <AlertCard title="Webhook failures" items={webhookFailureItems} emptyMessage="No unresolved webhook failures." /> },
  ];

  return (
    <>
      <header className={styles.pageHead}>
        <p className={styles.eyebrow}>Staff console</p>
        <h1 className={styles.title}>Command Center</h1>
        <p className={styles.lead}>Exceptions and open work across every account, ordered by default for the {role} role — customize the layout below to reorder it for how you work.</p>
      </header>

      <div className={styles.filterTabs}>
        {RANGE_TABS.map((r) => (
          <Link key={r.key} href={`/admin?range=${r.key}`} className={`${styles.filterTab} ${range === r.key ? styles.on : ''}`}>{r.label}</Link>
        ))}
      </div>

      {/* Every metric that has rows behind it now opens them, carrying the
          range so the destination covers the same window the number does.
          "Platform fees" is the one that stays inert: it is a sum of money
          rather than a set of records, and its working — gross charged minus
          fees returned — is on the Money page it would otherwise link to,
          which the Refunds card already reaches. */}
      <section className={styles.metricsRow}>
        {data.metrics.map((m) => (
          <StatCard
            key={m.key}
            value={fmtMetric(m)}
            label={m.label}
            href={metricHref(m.key, range)}
            drill={METRIC_DRILL[m.key]}
          >
            <span className={`${styles.metricTrend} ${styles[trendClass(m)]}`}>{trendLabel(m)}</span>
          </StatCard>
        ))}
      </section>

      <CommandCenterBoard role={role} cards={boardCards} defaultOrder={defaultCardOrder(role)} />
    </>
  );
}
