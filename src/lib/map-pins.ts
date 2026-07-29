import type { SupabaseClient } from '@supabase/supabase-js';
import { backfillJobCoordinates, listJobs } from '@/lib/jobs';
import { backfillLeadCoordinates, getLeadTriage, isLeadSnoozed, listLeads } from '@/lib/leads';
import type { MapPin } from '@/components/pin-map';

// Assemble the dashboard map's pins for an account: active leads and jobs that
// have geocoded coordinates, colour-coded by what they need next.
//   lead        → a lead awaiting a response (orange)
//   unscheduled → a job/quote with no date yet (gold)
//   scheduled   → a job with a date on the calendar (green)
export async function getMapPins(supabase: SupabaseClient, accountId: string): Promise<MapPin[]> {
  // Self-healing: geocode a small batch of any leads/jobs still missing coords
  // (created before geocoding existed, or a prior imprecise attempt). Awaited so
  // freshly geocoded rows appear this render; a no-op once everything is mapped.
  await Promise.all([
    backfillLeadCoordinates(supabase, accountId, 12),
    backfillJobCoordinates(supabase, accountId, 12),
  ]);

  const [leads, jobs] = await Promise.all([listLeads(supabase, accountId), listJobs(supabase, accountId)]);

  const pins: MapPin[] = [];

  for (const lead of leads) {
    if (lead.lat == null || lead.lng == null) continue;
    if (lead.status === 'won' || lead.status === 'lost') continue;
    if (lead.converted_job) continue; // now a job — pinned below instead
    const triage = getLeadTriage(lead);
    if (triage.archived || isLeadSnoozed(triage)) continue;
    pins.push({
      id: `lead-${lead.id}`,
      lat: lead.lat,
      lng: lead.lng,
      kind: 'lead',
      label: lead.name || 'Lead',
      sublabel: lead.address || lead.project_type || undefined,
      href: `/dashboard/leads/${lead.id}`,
    });
  }

  for (const job of jobs) {
    if (job.lat == null || job.lng == null) continue;
    if (job.status === 'complete' || job.status === 'archived') continue;
    pins.push({
      id: `job-${job.id}`,
      lat: job.lat,
      lng: job.lng,
      kind: job.scheduled_for ? 'scheduled' : 'unscheduled',
      label: job.client_name || job.ref,
      sublabel: job.address || undefined,
      href: `/dashboard/jobs/${job.id}`,
    });
  }

  return pins;
}
