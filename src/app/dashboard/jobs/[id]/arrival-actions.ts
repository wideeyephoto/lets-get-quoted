'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createAdminClient, requireOfficeContext } from '@/lib/auth';
import { MAX_ETA_MINUTES, MIN_ETA_MINUTES, type ArrivalStatus } from '@/lib/arrival';
import { applyArrivalStatus, sendArrival } from '@/lib/arrival-send';

// The owner (or whoever is in the office) sending an arrival update on a
// tech's behalf — the dispatcher case, and the one-person-business case where
// there is no separate field user at all.
//
// Same orchestration as the field app, different identity: an owner has every
// permission by definition, so there is nothing to look up.

const OWNER_PERMISSIONS = { send: true, shareLocation: true, viewContact: true, reschedule: true };

/**
 * Where to land afterwards.
 *
 * The job screen is not the only place an owner sends one of these from any
 * more — "Plan my day" has the same button on every stop, and redirecting that
 * to the job page would take somebody out of the route they were working
 * through to look at a page they did not ask for. The bound path is validated
 * rather than trusted: it comes from our own code, but it ends up in a Location
 * header, and an open redirect is not worth the convenience.
 */
function safeReturn(path: string | null | undefined, fallback: string): string {
  if (!path) return fallback;
  // One leading slash and no second one — "//evil.com" and "/\evil.com" are
  // both protocol-relative URLs that leave the site.
  return /^\/[^/\\]/.test(path) ? path : fallback;
}

export async function sendArrivalOwnerAction(jobId: string, formData: FormData) {
  return sendArrivalOwnerTo(null, jobId, formData);
}

export async function setArrivalStatusOwnerAction(jobId: string, formData: FormData) {
  return setArrivalStatusOwnerTo(null, jobId, formData);
}

export async function sendArrivalOwnerTo(returnTo: string | null, jobId: string, formData: FormData) {
  const { accountId, businessName } = await ownerActor();
  const home = safeReturn(returnTo, `/dashboard/jobs/${jobId}`);
  const join = home.includes('?') ? '&' : '?';

  const etaMinutes = Math.round(Number(formData.get('eta')));
  if (!Number.isFinite(etaMinutes) || etaMinutes < MIN_ETA_MINUTES || etaMinutes > MAX_ETA_MINUTES) {
    redirect(`${home}${join}arrival=bad-eta`);
  }

  // No location: this is being sent from a desk, and attaching the OFFICE's
  // coordinates to "where your tech is right now" would be a lie on a map.
  const override = String(formData.get('message') ?? '').trim();
  const result = await sendArrival(createAdminClient(), {
    accountId,
    jobId,
    actor: { crewId: null, name: businessName },
    permissions: OWNER_PERMISSIONS,
    etaMinutes,
    shareLocation: false,
    techLoc: null,
    override: override || null,
    confirmedResend: formData.get('confirm') === 'on',
  });

  revalidatePath(`/dashboard/jobs/${jobId}`);
  if (home !== `/dashboard/jobs/${jobId}`) revalidatePath(home.split('?')[0]);
  if (!result.ok) redirect(`${home}${join}arrival=${result.reason}`);
  redirect(`${home}${join}arrival=${result.mode}&sms=${result.sms.status}`);
}

export async function setArrivalStatusOwnerTo(returnTo: string | null, jobId: string, formData: FormData) {
  const { accountId, businessName } = await ownerActor();
  const home = safeReturn(returnTo, `/dashboard/jobs/${jobId}`);
  const join = home.includes('?') ? '&' : '?';

  const status = String(formData.get('status') ?? '') as ArrivalStatus;
  if (!['arrived', 'no_access', 'rescheduled', 'cancelled'].includes(status)) {
    redirect(home);
  }

  const result = await applyArrivalStatus(createAdminClient(), {
    accountId,
    jobId,
    actor: { crewId: null, name: businessName },
    permissions: OWNER_PERMISSIONS,
    status: status as 'arrived' | 'no_access' | 'rescheduled' | 'cancelled',
    note: String(formData.get('note') ?? '').trim() || null,
    // Undefined when the box wasn't ticked (or wasn't offered) — the per-status
    // default lives in applyArrivalStatus so both send paths share it.
    notify: formData.get('notify') === 'on' ? true : undefined,
  });

  revalidatePath(`/dashboard/jobs/${jobId}`);
  if (home !== `/dashboard/jobs/${jobId}`) revalidatePath(home.split('?')[0]);
  if (!result.ok) redirect(`${home}${join}arrival=${result.reason}`);
  redirect(`${home}${join}arrival=${status}`);
}

async function ownerActor(): Promise<{ accountId: string; businessName: string }> {
  const { supabase, accountId } = await requireOfficeContext('jobs.write');
  const [{ data: site }, { data: account }] = await Promise.all([
    supabase.from('sites').select('company_name').eq('account_id', accountId).limit(1).maybeSingle(),
    supabase.from('accounts').select('business_name').eq('id', accountId).maybeSingle(),
  ]);
  return {
    accountId,
    businessName: (site?.company_name as string | undefined) || (account?.business_name as string | undefined) || 'Your contractor',
  };
}
