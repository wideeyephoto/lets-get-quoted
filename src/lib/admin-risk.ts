import type { SupabaseClient } from '@supabase/supabase-js';
import { accountDisplayName } from '@/lib/admin-accounts';
import { assessRisk, isWorthReviewing, type RiskAssessment, type RiskSignals } from '@/lib/risk-score';

/**
 * Gathering the numbers the risk queue ranks on.
 *
 * Aggregated in memory rather than in SQL, because PostgREST cannot express
 * "group by account_id with four different conditional counts" and the
 * alternative is a database function that would then hold half the scoring
 * logic where it cannot be tested. The window and the row cap below keep the
 * cost bounded; the page states both, so a reviewer knows what they are
 * looking at rather than assuming it is everything.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Long enough for a pattern, short enough that old trouble stops dominating. */
export const RISK_WINDOW_DAYS = 90;

/**
 * Ceiling on rows pulled per table. A young product is nowhere near this; when
 * it is, the queue narrows to the most recent activity rather than silently
 * dropping accounts, and the page says so.
 */
const ROW_CAP = 5000;

export type RiskRow = {
  accountId: string;
  name: string;
  accountNumber: number | null;
  signals: RiskSignals;
  assessment: RiskAssessment;
};

type PaymentRow = {
  account_id: string;
  status: string | null;
  amount: number | null;
  refunded_amount: number | null;
  disputed_at: string | null;
  dispute_status: string | null;
  paid_at: string | null;
};

type QuickStopRow = { account_id: string; status: string };
type AccountRow = {
  id: string;
  business_name: string | null;
  account_number: number | null;
  created_at: string;
  suspended_at: string | null;
};

function blankSignals(accountId: string, ageDays: number, suspended: boolean): RiskSignals {
  return {
    accountId,
    paidCount: 0,
    paidVolume: 0,
    disputedCount: 0,
    disputedVolume: 0,
    chargebacksLost: 0,
    refundCount: 0,
    refundedVolume: 0,
    noShowsConfirmed: 0,
    suspended,
    accountAgeDays: ageDays,
  };
}

export type RiskQueue = {
  rows: RiskRow[];
  /** Accounts examined, so an empty queue reads as "checked" not "broken". */
  accountsScanned: number;
  windowDays: number;
  /** True when a row cap bit, which narrows the window rather than the set. */
  truncated: boolean;
  available: boolean;
  unavailableSources: string[];
};

export async function buildRiskQueue(admin: SupabaseClient, now = new Date()): Promise<RiskQueue> {
  const since = new Date(now.getTime() - RISK_WINDOW_DAYS * DAY_MS).toISOString();

  const [acctRes, payRes, qsRes] = await Promise.all([
    admin.from('accounts').select('id, business_name, account_number, created_at, suspended_at').is('test_marker', null).limit(ROW_CAP),
    // Dated on paid_at OR disputed_at: a charge collected before the window can
    // still be disputed inside it, and that dispute is exactly what this queue
    // exists to surface. Filtering on paid_at alone would hide it.
    admin
      .from('payments')
      .select('account_id, status, amount, refunded_amount, disputed_at, dispute_status, paid_at')
      .is('test_marker', null)
      .or(`paid_at.gte.${since},disputed_at.gte.${since}`)
      .limit(ROW_CAP),
    admin
      .from('extra_stop_requests')
      .select('account_id, status')
      .is('test_marker', null)
      .eq('status', 'no_show_confirmed')
      .gte('created_at', since)
      .limit(ROW_CAP),
  ]);
  if (acctRes.error) console.error('buildRiskQueue (accounts) failed:', acctRes.error);
  if (payRes.error) console.error('buildRiskQueue (payments) failed:', payRes.error);
  if (qsRes.error) console.error('buildRiskQueue (quick stops) failed:', qsRes.error);
  const unavailableSources = [acctRes.error ? 'accounts' : null, payRes.error ? 'payments' : null, qsRes.error ? 'Quick Stops' : null].filter((value): value is string => Boolean(value));

  const accounts = (acctRes.data ?? []) as AccountRow[];
  const payments = (payRes.data ?? []) as PaymentRow[];
  const noShows = (qsRes.data ?? []) as QuickStopRow[];

  const byId = new Map<string, { account: AccountRow; signals: RiskSignals }>();
  for (const account of accounts) {
    const ageDays = (now.getTime() - new Date(account.created_at).getTime()) / DAY_MS;
    byId.set(account.id, {
      account,
      signals: blankSignals(account.id, Number.isFinite(ageDays) ? ageDays : 0, Boolean(account.suspended_at)),
    });
  }

  for (const p of payments) {
    const entry = byId.get(p.account_id);
    if (!entry) continue;
    const s = entry.signals;
    const amount = Number(p.amount) || 0;
    const refunded = Number(p.refunded_amount) || 0;

    // "Collected" means the money arrived, whatever the row became afterwards —
    // the same reading lib/platform-fees.ts settled on. Using status alone would
    // drop every refunded and disputed payment out of the denominator, which is
    // precisely the population that makes a rate meaningful.
    if (p.paid_at) {
      s.paidCount += 1;
      s.paidVolume += amount;
    }
    if (refunded > 0) {
      s.refundCount += 1;
      s.refundedVolume += refunded;
    }
    if (p.disputed_at) {
      s.disputedCount += 1;
      s.disputedVolume += amount;
      // The webhook writes dispute_status 'lost' and flips the row to
      // 'refunded' when the bank decides against us.
      if (p.dispute_status === 'lost') s.chargebacksLost += 1;
    }
  }

  for (const q of noShows) {
    const entry = byId.get(q.account_id);
    if (entry) entry.signals.noShowsConfirmed += 1;
  }

  const rows: RiskRow[] = [];
  for (const { account, signals } of byId.values()) {
    const assessment = assessRisk(signals);
    // An account with nothing on it is not a queue item. A review queue padded
    // with every healthy account is a list nobody works through.
    if (!isWorthReviewing(assessment)) continue;
    rows.push({
      accountId: account.id,
      name: accountDisplayName(account),
      accountNumber: account.account_number,
      signals,
      assessment,
    });
  }

  rows.sort(
    (a, b) =>
      b.assessment.score - a.assessment.score ||
      b.signals.disputedVolume - a.signals.disputedVolume ||
      a.name.localeCompare(b.name),
  );

  return {
    rows,
    accountsScanned: accounts.length,
    windowDays: RISK_WINDOW_DAYS,
    truncated: accounts.length >= ROW_CAP || payments.length >= ROW_CAP || noShows.length >= ROW_CAP,
    available: unavailableSources.length === 0,
    unavailableSources,
  };
}
