import type { SupabaseClient } from '@supabase/supabase-js';
import { listCrew, listCrewAssignmentsForJobs } from '@/lib/crew';
import { arrivalPermissionsFromCrew } from '@/lib/arrival';
import { createCrewPhotoUrls } from '@/lib/crew-photo-storage';
import { formatMoney, listJobs } from '@/lib/jobs';
import { formatPhoneDashes } from '@/lib/phone';
import { payBasisFromCrew, payRateLabel } from '@/lib/pay-types';
import { fieldAppDetail, fieldAppState } from '@/lib/crew-invite';
import { laborTotalsByCrew } from '@/lib/labor-data';
import { shapeSubcontractorProfile, subDisplayName } from '@/lib/subcontractors';
import type { CrewRow } from '@/app/dashboard/crew/CrewRoster';

/**
 * The roster, shaped for CrewRoster.
 *
 * Lifted out of the crew page so the logged-out demo builds the same rows —
 * see [[demo-renders-real-screens]]. Nothing here writes, so it is safe against
 * the fixture client.
 *
 * Only the ROSTER tab's data. Hours & pay needs the pay-period machinery
 * (approvals, pay events, payroll export config) and is a separate extraction.
 */

function initialsFor(name: string): string {
  return (
    name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('') || '?'
  );
}

export type RosterData = {
  rows: CrewRow[];
  assignableJobs: { id: string; ref: string; clientName: string }[];
  activeCount: number;
  onJobCount: number;
};

export async function loadRosterData(
  supabase: SupabaseClient,
  accountId: string,
  period: { startIso: string; endIso: string },
  options: { withPhotos?: boolean } = {},
): Promise<RosterData> {
  const [crew, jobs] = await Promise.all([listCrew(supabase, accountId), listJobs(supabase, accountId)]);

  // Signed storage URLs cost a round trip per photo and the demo has none —
  // hence the opt-out rather than an unconditional call that returns {}.
  const photoUrls = options.withPhotos === false
    ? {}
    : await createCrewPhotoUrls(
        accountId,
        crew.map((member) => member.photo_path).filter((path): path is string => Boolean(path)),
      );

  const activeCrew = crew.filter((member) => member.active);
  const assignableJobs = jobs.filter((job) => job.status !== 'complete' && job.status !== 'archived');

  // Invert jobId -> crewIds into crewId -> open jobs, so each row can show what
  // the member is on right now (and mark idle active members as available).
  const assignmentsByJob = await listCrewAssignmentsForJobs(supabase, accountId, assignableJobs.map((job) => job.id));
  const jobsById = new Map(assignableJobs.map((job) => [job.id, job]));
  const jobsByCrew: Record<string, { id: string; ref: string; clientName: string }[]> = {};
  for (const [jobId, crewIds] of Object.entries(assignmentsByJob)) {
    const job = jobsById.get(jobId);
    if (!job) continue;
    for (const crewId of crewIds) {
      const bucket = jobsByCrew[crewId] ?? (jobsByCrew[crewId] = []);
      bucket.push({ id: job.id, ref: job.ref, clientName: job.client_name });
    }
  }

  // Hours for the roster's "this pay period" summary. Cheap enough to always
  // load: it's the number that makes a roster row worth reading.
  const totals = await laborTotalsByCrew(supabase, accountId, { startIso: period.startIso, endIso: period.endIso });

  const rows: CrewRow[] = crew.map((member) => {
    const bucket = totals.get(member.id);
    const profile = shapeSubcontractorProfile(member as unknown as Record<string, unknown>);
    return {
      id: member.id,
      name: member.name,
      // The demo roster is employees only — it has no subcontractors and no
      // offer history to derive metrics from. Everything subcontractor-shaped is
      // therefore null rather than an invented zero: "0 jobs offered" against a
      // firm nobody has ever texted is a claim, and this one would be about a
      // firm that does not exist. The worker type is still read off the row, so
      // the demo tells the truth the moment a subcontractor is in the fixture.
      workerType: profile.workerType,
      companyName: profile.companyName,
      displayName: subDisplayName(member.name, profile.companyName),
      subStatus: profile.workerType === 'subcontractor' ? profile.subStatus : null,
      trades: profile.trades,
      compliance: null,
      subMetrics: null,
      subProfile: profile.workerType === 'subcontractor' ? profile : null,
      initials: initialsFor(member.name),
      photoUrl: member.photo_path ? photoUrls[member.photo_path] ?? null : null,
      roleLabel: member.role_label,
      hourlyRate: Number(member.hourly_rate) || 0,
      payType: payBasisFromCrew(member).payType,
      annualSalary: member.annual_salary == null ? null : Number(member.annual_salary),
      dayRate: member.day_rate == null ? null : Number(member.day_rate),
      payrollId: member.payroll_id ?? null,
      // Reads from the pay basis, so a salaried member shows "$72,000.00/yr"
      // rather than the derived hourly figure nobody typed.
      rateLabel: payRateLabel(payBasisFromCrew(member)),
      phone: member.phone || null,
      phoneLabel: member.phone ? formatPhoneDashes(member.phone) : null,
      email: member.email,
      startAddress: member.start_address ?? null,
      permissions: arrivalPermissionsFromCrew(member as unknown as Record<string, unknown>),
      active: member.active,
      // Was `user_id ? 'linked' : email ? 'invitable' : 'no-email'` — three
      // states derived from two booleans, which is why the roster could not
      // tell "never invited" from "invited a month ago and the link died an
      // hour later", and had no word at all for access having been taken away.
      // See lib/crew-invite.
      fieldApp: fieldAppState(member),
      fieldAppDetail: fieldAppDetail(member),
      jobs: jobsByCrew[member.id] ?? [],
      periodHours: bucket?.hours ?? 0,
      periodPay: bucket?.pay ?? 0,
      periodPayLabel: formatMoney(bucket?.pay ?? 0),
      createdAt: member.created_at,
    };
  });

  return {
    rows,
    assignableJobs: assignableJobs.map((job) => ({ id: job.id, ref: job.ref, clientName: job.client_name })),
    activeCount: activeCrew.length,
    onJobCount: activeCrew.filter((member) => (jobsByCrew[member.id]?.length ?? 0) > 0).length,
  };
}
