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
  client_id?: string | null;
  status?: string | null;
  arrival_date?: string | null;
  /** Route cost against the last stop already on that day. */
  detour_miles?: number | string | null;
  route_extension_minutes?: number | null;
  offer_visit_minutes?: number | null;
  offer_sent_at: string | null;
  paid_at: string | null;
  completed_at: string | null;
  created_at?: string | null;
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

  /** The road cost of the stops that were finished. See efficiencyOf. */
  avgAddedMinutes: number | null;
  avgAddedMiles: number | null;
  revenuePerAddedHour: number | null;
  revenuePerAddedMile: number | null;
  measuredStops: number;

  /** What came in, what was let go, what is still ahead. */
  requested: number;
  missed: number;
  missedRevenue: number | null;
  upcoming: number;

  bestDay: { label: string; count: number } | null;
  repeatCustomers: number;
  highestValue: number | null;
  weekly: { label: string; value: number }[];
};

/**
 * A stop the CONTRACTOR turned down or let lapse.
 *
 * Deliberately excludes customer_declined and customer_canceled: those are the
 * homeowner's choice, and counting them here would inflate a number whose only
 * job is to be actionable — you cannot go back and win a stop somebody else
 * walked away from.
 */
const MISSED_STATUSES = new Set(['contractor_declined', 'offer_expired']);

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function numeric(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

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
  /** Today, as a date key, for counting what is still ahead. */
  todayKey?: string;
}): QuickStopMetrics {
  const { requests, payments, assignments, crew, fromMs, toMs } = input;
  const todayKey = input.todayKey ?? new Date(toMs).toISOString().slice(0, 10);

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

  // --- the road cost -------------------------------------------------------
  //
  // This is the one thing a Quick Stop can measure that no other job type can:
  // the request records how far off-route it was and how much longer the day
  // got, measured against the last stop already on that day. So "revenue per
  // added hour" here is a real division, not an allocation of overhead.
  //
  // route_extension_minutes is how much LONGER THE DAY GOT, which is not the
  // drive there — a stop on the way home extends the day by less than the
  // detour to reach it. Where it is missing the row is left OUT rather than
  // counted as zero: an unmeasured trip is not a free one, and averaging it in
  // as zero would flatter every rate below it.
  const addedMinutes: number[] = [];
  const addedMiles: number[] = [];
  for (const request of completedRows) {
    const minutes = numeric(request.route_extension_minutes ?? request.offer_visit_minutes);
    if (minutes !== null) addedMinutes.push(minutes);
    const miles = numeric(request.detour_miles);
    if (miles !== null) addedMiles.push(miles);
  }
  const totalAddedMinutes = addedMinutes.reduce((sum, value) => sum + value, 0);
  const totalAddedMiles = addedMiles.reduce((sum, value) => sum + value, 0);
  const addedHours = totalAddedMinutes / 60;

  // --- opportunity ---------------------------------------------------------
  const requestedRows = requests.filter((request) => within(request.created_at ?? null));
  let missed = 0;
  let upcoming = 0;
  for (const request of requests) {
    if (request.status && MISSED_STATUSES.has(request.status)) missed += 1;
    if (!request.completed_at && request.arrival_date && request.arrival_date >= todayKey) upcoming += 1;
  }
  // An ESTIMATE, and null until three stops have actually earned. One or two
  // figures are not a median, and an invented number here is an argument for
  // taking work that might not have been worth taking.
  const earned = [...earning.values()].filter((value) => value > 0);
  const missedRevenue = earned.length >= 3 && missed > 0 ? round2(median(earned) * missed) : null;

  // --- best day ------------------------------------------------------------
  // Null below four completed stops. "Best day: Thursday" off a single Thursday
  // is noise dressed as a finding, and it is exactly the sort of line somebody
  // would rearrange their week around.
  const tally = new Array(7).fill(0);
  for (const request of completedRows) {
    if (request.completed_at) tally[new Date(request.completed_at).getUTCDay()] += 1;
  }
  let bestIndex = 0;
  for (let day = 1; day < 7; day += 1) if (tally[day] > tally[bestIndex]) bestIndex = day;
  const bestDay =
    completedRows.length >= 4 && tally[bestIndex] > 0
      ? { label: WEEKDAYS[bestIndex], count: tally[bestIndex] }
      : null;

  // --- repeat customers ----------------------------------------------------
  const perClient = new Map<string, number>();
  for (const request of completedRows) {
    if (!request.client_id) continue;
    perClient.set(request.client_id, (perClient.get(request.client_id) ?? 0) + 1);
  }
  let repeatCustomers = 0;
  for (const count of perClient.values()) if (count > 1) repeatCustomers += 1;

  // --- weekly trend --------------------------------------------------------
  // Bucketed by the window rather than by calendar week, so the bars always
  // cover exactly the period the page says they do.
  const buckets = 4;
  const width = Math.max(1, (toMs - fromMs) / buckets);
  const weekly = Array.from({ length: buckets }, (_, index) => ({ label: `Week ${index + 1}`, value: 0 }));
  for (const [requestId, value] of earning.entries()) {
    const request = requests.find((row) => row.id === requestId);
    const at = request?.completed_at ? new Date(request.completed_at).getTime() : null;
    if (at === null || !Number.isFinite(at) || at < fromMs || at >= toMs) continue;
    const index = Math.min(buckets - 1, Math.max(0, Math.floor((at - fromMs) / width)));
    weekly[index].value = round2(weekly[index].value + value);
  }

  return {
    avgAddedMinutes: addedMinutes.length ? Math.round(totalAddedMinutes / addedMinutes.length) : null,
    avgAddedMiles: addedMiles.length ? round2(totalAddedMiles / addedMiles.length) : null,
    revenuePerAddedHour: addedHours > 0 ? round2(totalRevenue / addedHours) : null,
    revenuePerAddedMile: totalAddedMiles > 0 ? round2(totalRevenue / totalAddedMiles) : null,
    measuredStops: addedMinutes.length,
    requested: requestedRows.length,
    missed,
    missedRevenue,
    upcoming,
    bestDay,
    repeatCustomers,
    highestValue: earned.length ? round2(Math.max(...earned)) : null,
    weekly,
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
