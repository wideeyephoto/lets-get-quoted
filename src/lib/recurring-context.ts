import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * The operational facts a recurring plan card needs but the plan row does not
 * hold: who is doing the next visit, how long it takes, and whether the last one
 * actually happened and got paid.
 *
 * All of it already exists — a plan's visits ARE jobs (`jobs.recurring_plan_id`),
 * crew comes from `crew_assignments`, and payments carry `job_id`. None of it
 * needed a migration; it needed joining up.
 *
 * Batched on purpose. A card-by-card lookup would be four queries per plan, and
 * a contractor with thirty plans would pay for it on every page load. This is a
 * fixed four queries regardless of how many plans there are.
 */

export type PlanContext = {
  /** The job for the next scheduled visit, if one has been materialised yet. */
  nextVisitJobId: string | null;
  /**
   * The day that job currently sits on. Not the same as the plan's
   * next_run_date once a visit has been moved: the visit date is what bills and
   * never moves, `scheduled_for` is when somebody actually turns up.
   */
  nextVisitScheduledFor: string | null;
  estimatedHours: number | null;
  crewNames: string[];
  /** Same crew, by id — what a picker needs to show its checkboxes ticked. */
  crewIds: string[];
  /** Null when there is no visit job yet — NOT the same as "nobody assigned". */
  nextVisitAssigned: boolean | null;
  lastCompletedDate: string | null;
  lastCompletedPaid: number | null;
  /**
   * Where the plan's visits actually happen, taken from its most recently dated
   * geocoded job.
   *
   * A plan carries an `address` but no coordinates, and geocoding thirty of them
   * on every page load would be both slow and billable. Its visits ARE jobs, and
   * jobs are geocoded already — so the plan pins at the place the work happened,
   * which beats the address anyway: a landlord's plan billed to an out-of-state
   * office still pins on the house somebody drives to.
   *
   * Null when no visit has been geocoded yet. Not 0,0 — that is Null Island, and
   * a plan drawn in the Atlantic is worse than one left off the map.
   */
  lat: number | null;
  lng: number | null;
};

export const EMPTY_PLAN_CONTEXT: PlanContext = {
  nextVisitJobId: null,
  nextVisitScheduledFor: null,
  estimatedHours: null,
  crewNames: [],
  crewIds: [],
  nextVisitAssigned: null,
  lastCompletedDate: null,
  lastCompletedPaid: null,
  lat: null,
  lng: null,
};

type PlanRef = { id: string; next_run_date: string };

export async function planContexts(
  supabase: SupabaseClient,
  accountId: string,
  plans: PlanRef[],
  /** Today, so "last completed" can never be a date in the future. */
  todayKey?: string,
): Promise<Map<string, PlanContext>> {
  const out = new Map<string, PlanContext>();
  if (!plans.length) return out;
  const planIds = plans.map((plan) => plan.id);

  const { data: jobRows } = await supabase
    .from('jobs')
    .select('id, recurring_plan_id, recurring_visit_date, estimated_hours, status, scheduled_for, lat, lng')
    .eq('account_id', accountId)
    .in('recurring_plan_id', planIds);

  const jobs = jobRows ?? [];
  const jobIds = jobs.map((job) => job.id as string);

  const [{ data: assignmentRows }, { data: crewRows }, { data: paymentRows }] = await Promise.all([
    jobIds.length
      ? supabase.from('crew_assignments').select('job_id, crew_id').eq('account_id', accountId).in('job_id', jobIds)
      : Promise.resolve({ data: [] as { job_id: string; crew_id: string }[] }),
    supabase.from('crew').select('id, name').eq('account_id', accountId),
    jobIds.length
      ? supabase
          .from('payments')
          .select('job_id, amount, refunded_amount')
          .eq('account_id', accountId)
          .eq('status', 'paid')
          .in('job_id', jobIds)
      : Promise.resolve({ data: [] as { job_id: string; amount: number; refunded_amount: number }[] }),
  ]);

  const crewName = new Map<string, string>();
  for (const member of crewRows ?? []) {
    crewName.set(member.id as string, ((member.name as string) ?? '').trim() || 'Unnamed');
  }

  const crewByJob = new Map<string, string[]>();
  const crewIdsByJob = new Map<string, string[]>();
  for (const row of assignmentRows ?? []) {
    const list = crewByJob.get(row.job_id) ?? [];
    list.push(crewName.get(row.crew_id) ?? 'Unnamed');
    crewByJob.set(row.job_id, list);
    const ids = crewIdsByJob.get(row.job_id) ?? [];
    ids.push(row.crew_id);
    crewIdsByJob.set(row.job_id, ids);
  }

  const paidByJob = new Map<string, number>();
  for (const row of paymentRows ?? []) {
    if (!row.job_id) continue;
    const net = (Number(row.amount) || 0) - (Number(row.refunded_amount) || 0);
    if (net <= 0) continue;
    paidByJob.set(row.job_id, (paidByJob.get(row.job_id) ?? 0) + net);
  }

  for (const plan of plans) {
    const mine = jobs.filter((job) => job.recurring_plan_id === plan.id);

    // The job for the next visit, matched on the visit DATE rather than "the
    // newest job" — a visit created early sits at a different date than the one
    // the plan is now pointing at, and picking the newest would describe the
    // wrong visit.
    const nextJob = mine.find((job) => (job.recurring_visit_date ?? job.scheduled_for) === plan.next_run_date) ?? null;

    // A visit dated in the future cannot be the LAST COMPLETED one, whatever its
    // status says. Visits are materialised ahead of time and one can be marked
    // complete early, which put "Last completed Nov 1" on a card in August —
    // a sentence that reads as a bug in the reader's data, not in ours.
    const completed = mine
      .filter((job) => job.status === 'complete')
      .filter((job) => {
        if (!todayKey) return true;
        const when = (job.recurring_visit_date ?? job.scheduled_for) as string | null;
        return !when || when <= todayKey;
      })
      .sort((a, b) =>
        String(b.recurring_visit_date ?? b.scheduled_for ?? '').localeCompare(
          String(a.recurring_visit_date ?? a.scheduled_for ?? ''),
        ),
      );
    const last = completed[0] ?? null;

    const crewNames = nextJob ? crewByJob.get(nextJob.id as string) ?? [] : [];

    // Newest geocoded visit wins — a plan whose address changed should pin
    // where it is now, not where it started.
    let pin: { lat: number; lng: number; at: string } | null = null;
    for (const job of mine) {
      const lat = Number(job.lat);
      const lng = Number(job.lng);
      // A `numeric` column that survived a bad import can hold anything, and a
      // failed geocode writes 0,0 when nobody checks.
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      if (lat === 0 && lng === 0) continue;
      const at = String(job.recurring_visit_date ?? job.scheduled_for ?? '');
      if (!pin || at > pin.at) pin = { lat, lng, at };
    }
    out.set(plan.id, {
      nextVisitJobId: (nextJob?.id as string) ?? null,
      nextVisitScheduledFor: (nextJob?.scheduled_for as string) ?? (nextJob?.recurring_visit_date as string) ?? null,
      estimatedHours: nextJob?.estimated_hours != null ? Number(nextJob.estimated_hours) : null,
      crewNames,
      crewIds: nextJob ? crewIdsByJob.get(nextJob.id as string) ?? [] : [],
      // Null, not false, when there is no job yet: nobody can be assigned to a
      // visit that does not exist, and flagging that as unassigned would put a
      // warning on every healthy plan whose next visit is still a week out.
      nextVisitAssigned: nextJob ? crewNames.length > 0 : null,
      lastCompletedDate: (last?.recurring_visit_date as string) ?? (last?.scheduled_for as string) ?? null,
      lastCompletedPaid: last ? paidByJob.get(last.id as string) ?? null : null,
      lat: pin?.lat ?? null,
      lng: pin?.lng ?? null,
    });
  }

  return out;
}

/** "1 hr 30 min", "45 min", "2 hrs" — never "1.5". */
export function formatDuration(hours: number | null): string | null {
  if (hours === null || !Number.isFinite(hours) || hours <= 0) return null;
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m} min`;
  const hourPart = `${h} hr${h === 1 ? '' : 's'}`;
  return m === 0 ? hourPart : `${hourPart} ${m} min`;
}
