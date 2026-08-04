/**
 * What Quick Stops were worth, for the Insights page.
 *
 * A Quick Stop earns twice and the two have to stay apart, because they answer
 * different questions. The FEE is what a homeowner paid to be moved up today's
 * route — that is the price of speed, and it is the number that says whether
 * the feature itself pays. The SERVICE is whatever the visit turned into once
 * you were standing there, which is ordinary work that happened to arrive
 * through a Quick Stop. Add them together and you can no longer tell a feature
 * that earns from a feature that merely finds jobs.
 *
 * Both live in `payments`: the fee is the row whose id the request stores in
 * `payment_id`, every other paid row on the same job is service. Which is
 * exactly why this can't be "sum the payments on the job" — that counts the fee
 * twice and reports it as service.
 *
 * Money is dollars here (the `payments` table is numeric dollars); the request's
 * own `fee_cents` is the OFFER, not the receipt, so it is deliberately not what
 * revenue is built from. An offer that was never paid is not revenue.
 */

export type QuickStopInsightRow = {
  id: string;
  job_id: string | null;
  payment_id: string | null;
  offer_sent_at: string | null;
  paid_at: string | null;
  completed_at: string | null;
};

export type QuickStopPaymentRow = {
  id: string;
  job_id: string | null;
  amount: number | string | null;
  refunded_amount: number | string | null;
  paid_at: string | null;
};

export type QuickStopAssignmentRow = { job_id: string; crew_id: string };
export type QuickStopCrewRow = { id: string; name: string | null };

export type CrewStops = { crewId: string; name: string; stops: number };

export type QuickStopMetrics = {
  totalRevenue: number;
  feeRevenue: number;
  serviceRevenue: number;
  completed: number;
  offered: number;
  accepted: number;
  /** Of the offers SENT in this window — so it can never exceed 100%. */
  acceptanceRate: number | null;
  averageValue: number | null;
  averageFee: number | null;
  /** The denominators, so the page can say what an average is an average of. */
  earningStops: number;
  paidFees: number;
  crew: CrewStops[];
  topCrew: CrewStops | null;
  /** Any Quick Stop activity in this window at all. */
  hasAny: boolean;
};

function money(value: number | string | null | undefined): number {
  const n = typeof value === 'string' ? Number(value) : value ?? 0;
  return Number.isFinite(n) ? (n as number) : 0;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function quickStopMetrics(input: {
  requests: QuickStopInsightRow[];
  payments: QuickStopPaymentRow[];
  assignments: QuickStopAssignmentRow[];
  crew: QuickStopCrewRow[];
  fromMs: number;
  toMs: number;
}): QuickStopMetrics {
  const { requests, payments, assignments, crew, fromMs, toMs } = input;

  const within = (iso: string | null): boolean => {
    if (!iso) return false;
    const ms = new Date(iso).getTime();
    return Number.isFinite(ms) && ms >= fromMs && ms < toMs;
  };

  // Which payment is the fee for which request, and which job belongs to which
  // request. A job carries at most one Quick Stop, but the map is built from
  // the requests either way so a stray second one can't double-count.
  const feeOf = new Map<string, string>();   // payment id -> request id
  const stopOfJob = new Map<string, string>(); // job id -> request id
  for (const request of requests) {
    if (request.payment_id) feeOf.set(request.payment_id, request.id);
    if (request.job_id && !stopOfJob.has(request.job_id)) stopOfJob.set(request.job_id, request.id);
  }

  let feeRevenue = 0;
  let serviceRevenue = 0;
  const paidFeeStops = new Set<string>();
  const earning = new Map<string, number>();

  for (const payment of payments) {
    if (!within(payment.paid_at)) continue;
    // A partial refund leaves the row `paid` with a running refunded total; a
    // full one flips the status and never reaches here. Either way what was
    // KEPT is the revenue.
    const net = money(payment.amount) - money(payment.refunded_amount);
    if (net <= 0) continue;

    const feeStop = feeOf.get(payment.id);
    if (feeStop) {
      feeRevenue += net;
      paidFeeStops.add(feeStop);
      earning.set(feeStop, (earning.get(feeStop) ?? 0) + net);
      continue;
    }
    const jobStop = payment.job_id ? stopOfJob.get(payment.job_id) : undefined;
    if (jobStop) {
      serviceRevenue += net;
      earning.set(jobStop, (earning.get(jobStop) ?? 0) + net);
    }
  }

  // A cohort rate: of the offers sent in this window, how many were paid —
  // whenever they were paid. Counting accepted-in-window against
  // offered-in-window instead lets an offer sent last week and paid this one
  // push the rate over 100% at the boundary.
  const offeredRows = requests.filter((request) => within(request.offer_sent_at));
  const offered = offeredRows.length;
  const accepted = offeredRows.filter((request) => Boolean(request.paid_at)).length;

  const completedRows = requests.filter((request) => within(request.completed_at));

  const crewNames = new Map(crew.map((member) => [member.id, (member.name ?? '').trim() || 'Unnamed']));
  const byJob = new Map<string, string[]>();
  for (const row of assignments) {
    const list = byJob.get(row.job_id);
    if (list) list.push(row.crew_id); else byJob.set(row.job_id, [row.crew_id]);
  }
  const stopsPerCrew = new Map<string, number>();
  for (const request of completedRows) {
    if (!request.job_id) continue;
    for (const crewId of byJob.get(request.job_id) ?? []) {
      stopsPerCrew.set(crewId, (stopsPerCrew.get(crewId) ?? 0) + 1);
    }
  }
  const crewRows: CrewStops[] = [...stopsPerCrew.entries()]
    .map(([crewId, stops]) => ({ crewId, name: crewNames.get(crewId) ?? 'Unnamed', stops }))
    .sort((a, b) => b.stops - a.stops || a.name.localeCompare(b.name));

  const totalRevenue = feeRevenue + serviceRevenue;
  const earningStops = earning.size;
  const paidFees = paidFeeStops.size;

  return {
    totalRevenue: round2(totalRevenue),
    feeRevenue: round2(feeRevenue),
    serviceRevenue: round2(serviceRevenue),
    completed: completedRows.length,
    offered,
    accepted,
    acceptanceRate: offered > 0 ? Math.round((accepted / offered) * 100) : null,
    // Every average here is a real sum over a real count of the SAME set —
    // never a total divided by a differently-filtered denominator.
    averageValue: earningStops > 0 ? round2(totalRevenue / earningStops) : null,
    averageFee: paidFees > 0 ? round2(feeRevenue / paidFees) : null,
    earningStops,
    paidFees,
    crew: crewRows,
    topCrew: crewRows[0] ?? null,
    hasAny: offered > 0 || completedRows.length > 0 || earningStops > 0,
  };
}
