import type { SupabaseClient } from '@supabase/supabase-js';
import { backfillJobCoordinates, formatMoney, listJobs } from '@/lib/jobs';
import { backfillLeadCoordinates, formatElapsedTime, getLeadTriage, isLeadSnoozed, listLeads } from '@/lib/leads';
import { listCrew, listCrewAssignmentsForJobs } from '@/lib/crew';
import type { MapPin, MapPinRow } from '@/components/pin-map';

function truncate(text: string, max = 90): string {
  const t = text.trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

// Compact "Aug 3" / "Aug 3 · 9:00 AM" — parsed off the date parts so a date-only
// value never shifts a day by timezone.
function scheduledLabel(dateIso: string, time: string | null): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateIso);
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(dateIso);
  const label = Number.isNaN(d.getTime()) ? dateIso : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return time ? `${label} · ${time}` : label;
}

// Assemble the dashboard map's pins for an account: active leads and jobs that
// have geocoded coordinates, colour-coded by what they need next, each carrying
// a few detail rows for the map card.
//   lead        → a lead awaiting a response (orange)
//   unscheduled → a job/quote with no date yet (gold)
//   scheduled   → a job with a date on the calendar (green)
export async function getMapPins(supabase: SupabaseClient, accountId: string): Promise<MapPin[]> {
  // Self-healing: geocode a small batch of any leads/jobs still missing coords.
  await Promise.all([
    backfillLeadCoordinates(supabase, accountId, 12),
    backfillJobCoordinates(supabase, accountId, 12),
  ]);

  const [leads, jobs] = await Promise.all([listLeads(supabase, accountId), listJobs(supabase, accountId)]);

  // Crew names per mapped, active job (for the job cards).
  const mappedJobIds = jobs
    .filter((j) => j.lat != null && j.lng != null && j.status !== 'complete' && j.status !== 'archived')
    .map((j) => j.id);
  const [assignments, crew] = await Promise.all([
    listCrewAssignmentsForJobs(supabase, accountId, mappedJobIds),
    mappedJobIds.length ? listCrew(supabase, accountId) : Promise.resolve([]),
  ]);
  const crewName = new Map<string, string>(crew.map((c) => [c.id, c.name]));

  const pins: MapPin[] = [];

  for (const lead of leads) {
    if (lead.lat == null || lead.lng == null) continue;
    if (lead.status === 'won' || lead.status === 'lost') continue;
    if (lead.converted_job) continue; // now a job — pinned below instead
    const triage = getLeadTriage(lead);
    if (triage.archived || isLeadSnoozed(triage)) continue;

    const rows: MapPinRow[] = [];
    const detail = lead.project_type || lead.message;
    if (detail) rows.push({ label: 'Job', value: truncate(detail) });
    if (triage.estimate) {
      rows.push({ label: 'AI estimate', value: `$${triage.estimate.min.toLocaleString('en-US')}–$${triage.estimate.max.toLocaleString('en-US')}` });
    }
    rows.push({ label: 'Waiting', value: formatElapsedTime(lead.created_at) });

    pins.push({
      id: `lead-${lead.id}`,
      lat: lead.lat,
      lng: lead.lng,
      kind: 'lead',
      label: lead.name || 'Lead',
      sublabel: lead.address || undefined,
      href: `/dashboard/leads/${lead.id}`,
      rows,
    });
  }

  for (const job of jobs) {
    if (job.lat == null || job.lng == null) continue;
    if (job.status === 'complete' || job.status === 'archived') continue;

    const rows: MapPinRow[] = [];
    if (job.scope) rows.push({ label: 'Job', value: truncate(job.scope) });
    rows.push({ label: 'Scheduled', value: job.scheduled_for ? scheduledLabel(job.scheduled_for, job.scheduled_time) : 'No date set' });
    const names = (assignments[job.id] ?? []).map((id) => crewName.get(id)).filter((n): n is string => Boolean(n));
    rows.push({ label: 'Crew', value: names.length ? names.join(', ') : 'Unassigned' });
    if (job.quoted_amount > 0) rows.push({ label: 'Quoted', value: formatMoney(job.quoted_amount) });

    pins.push({
      id: `job-${job.id}`,
      lat: job.lat,
      lng: job.lng,
      kind: job.scheduled_for ? 'scheduled' : 'unscheduled',
      label: job.client_name || job.ref,
      sublabel: job.address || undefined,
      href: `/dashboard/jobs/${job.id}`,
      rows,
    });
  }

  return pins;
}
