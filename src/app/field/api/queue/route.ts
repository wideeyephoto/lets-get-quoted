import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/auth';
import { loadCrewContext } from '@/lib/crew-auth';
import { isJobAssignedToCrew } from '@/lib/crew';
import { createCost } from '@/lib/jobs';
import { createJobFeedEvent } from '@/lib/job-feed';
import { resolveCrewBurdenPct } from '@/lib/cost-truth-data';
import { clockIn, clockOut, getOpenShift } from '@/lib/time-clock-data';
import {
  claimSubmission,
  releaseSubmission,
  resolveOfflineTime,
  withOfflineNote,
  type SubmissionKind,
} from '@/lib/field-submissions';

/**
 * The one endpoint the service worker is allowed to replay.
 *
 * WHY IT EXISTS AT ALL. The field app's writes are server actions, and a server
 * action is a POST whose identifier changes every deploy and whose response is
 * an RSC stream. Holding one in IndexedDB for four hours and replaying it after
 * a deploy replays a request the server no longer recognises — so the offline
 * path could not be "queue whatever the form was going to send". It had to be a
 * plain, versionless, JSON contract, and this is it.
 *
 * Everything here is the same code the online path runs. That is the point: an
 * entry logged in a dead spot and one logged in the yard have to become
 * identical rows, or the owner ends up with two grades of truth in one
 * timesheet.
 *
 * IDEMPOTENT BY CONSTRUCTION. Every submission carries a key generated on the
 * phone before its first send, and the ledger insert is the lock — see
 * lib/field-submissions. The worker retries anything it never got an answer to,
 * and a lost reply is indistinguishable from a lost request.
 */

export const dynamic = 'force-dynamic';

type Payload = {
  kind?: string;
  key?: string;
  jobId?: string;
  /** When it happened, by the phone's clock. */
  at?: string;
  hours?: number;
  amount?: number;
  description?: string;
  body?: string;
  share?: boolean;
  note?: string;
};

const KINDS: SubmissionKind[] = ['clock-in', 'clock-out', 'time', 'material', 'note'];

function bad(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function POST(request: Request) {
  const resolved = await loadCrewContext();
  if (!resolved.ok) {
    // 401/409, never a redirect. A 302 to an HTML sign-in page arriving in
    // answer to a background replay looks like a 200 to a naive worker, and the
    // queued clock-out would be dropped as delivered.
    const status = resolved.reason === 'choose-business' ? 409 : 401;
    return NextResponse.json({ ok: false, error: resolved.reason }, { status });
  }
  const { supabase, accountId, crew, timeClockMode } = resolved.context;

  let payload: Payload;
  try {
    payload = (await request.json()) as Payload;
  } catch {
    return bad('Malformed submission.');
  }

  const kind = payload.kind as SubmissionKind;
  if (!KINDS.includes(kind)) return bad('Unknown submission kind.');

  const jobId = String(payload.jobId ?? '').trim();
  if (!jobId) return bad('Missing job.');
  if (!(await isJobAssignedToCrew(supabase, accountId, jobId, crew.id))) {
    return bad('You are not assigned to this job.', 403);
  }

  const admin = createAdminClient();
  const key = String(payload.key ?? '').trim();
  const claim = await claimSubmission(admin, accountId, crew.id, key, kind);
  if (claim === 'duplicate') {
    // Already done. Success, because from the phone's point of view it WAS
    // successful — it just never heard so.
    return NextResponse.json({ ok: true, duplicate: true });
  }

  const when = resolveOfflineTime(payload.at);

  try {
    switch (kind) {
      case 'clock-in': {
        if (timeClockMode === 'off') return bad('The time clock is switched off for this business.', 409);
        await clockIn(supabase, accountId, crew.id, jobId, Number(crew.hourly_rate) || 0, when.at);
        break;
      }

      case 'clock-out': {
        const entry = await getOpenShift(supabase, accountId, crew.id);
        // Nothing open means this shift was already closed — by a replay that
        // did land, or by the owner. Not an error; there is simply nothing left
        // to do, and saying "no open shift" to a worker would strand the queue.
        if (!entry || entry.job_id !== jobId) break;
        const note = withOfflineNote(String(payload.note ?? '').trim() || null, when.fromPhone);
        // Never before the shift started: a phone whose clock is behind would
        // otherwise close a shift into negative hours.
        const endedAt = Date.parse(when.at) > Date.parse(entry.started_at) ? when.at : new Date().toISOString();
        await clockOut(supabase, accountId, entry, { endedAt, crewName: crew.name, note });
        break;
      }

      case 'time': {
        if (timeClockMode === 'required') {
          return bad('Clock in and out to log time on this job.', 409);
        }
        const hours = Number(payload.hours);
        if (!Number.isFinite(hours) || hours <= 0) return bad('Enter hours greater than 0.');
        const typed = String(payload.description ?? '').trim();
        await createCost(supabase, accountId, jobId, {
          type: 'labor',
          description: withOfflineNote(typed || `${crew.name} — labor`, when.fromPhone) as string,
          crewId: crew.id,
          hours,
          // The owner's rate, never the caller's. Same rule as the online form,
          // and the database refuses anything else (crew_costs_guard).
          rate: Number(crew.hourly_rate) || 0,
          source: 'estimated',
          burdenPct: await resolveCrewBurdenPct(supabase, accountId, crew.id),
        });
        break;
      }

      case 'material': {
        const description = String(payload.description ?? '').trim();
        const amount = Number(payload.amount);
        if (!description || !Number.isFinite(amount) || amount < 0) return bad('Add what it was and a valid amount.');
        await createCost(supabase, accountId, jobId, {
          type: 'material',
          description,
          amount,
          crewId: crew.id,
          source: 'receipt',
        });
        break;
      }

      case 'note': {
        const body = String(payload.body ?? '').trim();
        if (!body) return bad('Write something first.');
        const share = payload.share === true;
        await createJobFeedEvent(supabase, accountId, jobId, {
          kind: 'job_update',
          title: share ? `Update from ${crew.name}` : `Field note from ${crew.name}`,
          body,
          visibility: share ? 'client' : 'internal',
          author: crew.name,
        });
        break;
      }
    }
  } catch (error) {
    // The claim is given back, or the retry that should fix this would be
    // answered "already handled" and the entry would be lost for good.
    if (claim === 'claimed') await releaseSubmission(admin, crew.id, key);
    const message = error instanceof Error ? error.message : 'Could not save that.';
    console.error(`Field queue ${kind} failed for job ${jobId}:`, message);
    // 5xx on purpose: the worker keeps a 5xx and tries again, which is right —
    // this is our failure, not a malformed request.
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
