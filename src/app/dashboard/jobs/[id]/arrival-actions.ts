'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireOwnerContext } from '@/lib/auth';
import { createAdminClient } from '@/lib/auth';
import { MAX_ETA_MINUTES, MIN_ETA_MINUTES, type ArrivalStatus } from '@/lib/arrival';
import { applyArrivalStatus, sendArrival } from '@/lib/arrival-send';

// The owner (or whoever is in the office) sending an arrival update on a
// tech's behalf — the dispatcher case, and the one-person-business case where
// there is no separate field user at all.
//
// Same orchestration as the field app, different identity: an owner has every
// permission by definition, so there is nothing to look up.

const OWNER_PERMISSIONS = { send: true, shareLocation: true, viewContact: true, reschedule: true };

export async function sendArrivalOwnerAction(jobId: string, formData: FormData) {
  const { accountId, businessName } = await ownerActor();

  const etaMinutes = Math.round(Number(formData.get('eta')));
  if (!Number.isFinite(etaMinutes) || etaMinutes < MIN_ETA_MINUTES || etaMinutes > MAX_ETA_MINUTES) {
    redirect(`/dashboard/jobs/${jobId}?arrival=bad-eta`);
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
  if (!result.ok) redirect(`/dashboard/jobs/${jobId}?arrival=${result.reason}`);
  redirect(`/dashboard/jobs/${jobId}?arrival=${result.mode}&sms=${result.sms.status}`);
}

export async function setArrivalStatusOwnerAction(jobId: string, formData: FormData) {
  const { accountId, businessName } = await ownerActor();

  const status = String(formData.get('status') ?? '') as ArrivalStatus;
  if (!['arrived', 'no_access', 'rescheduled', 'cancelled'].includes(status)) {
    redirect(`/dashboard/jobs/${jobId}`);
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
  if (!result.ok) redirect(`/dashboard/jobs/${jobId}?arrival=${result.reason}`);
  redirect(`/dashboard/jobs/${jobId}?arrival=${status}`);
}

async function ownerActor(): Promise<{ accountId: string; businessName: string }> {
  const { supabase, accountId } = await requireOwnerContext();
  const [{ data: site }, { data: account }] = await Promise.all([
    supabase.from('sites').select('company_name').eq('account_id', accountId).limit(1).maybeSingle(),
    supabase.from('accounts').select('business_name').eq('id', accountId).maybeSingle(),
  ]);
  return {
    accountId,
    businessName: (site?.company_name as string | undefined) || (account?.business_name as string | undefined) || 'Your contractor',
  };
}
