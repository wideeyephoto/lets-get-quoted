'use server';

import { createAdminClient } from '@/lib/auth';
import { resolvePortalAccess } from '@/lib/client-portal';
import { submitPortalMessage } from '@/lib/client-portal-data';
import { revalidatePath } from 'next/cache';

export async function sendPortalMessageAction(
  token: string,
  formData: FormData,
): Promise<{ ok: boolean; message?: string }> {
  const body = String(formData.get('message') ?? '').trim();
  const jobId = (formData.get('jobId') as string | null) || null;

  if (!body) {
    return { ok: false, message: 'Please write a message before sending.' };
  }

  const admin = createAdminClient();
  const access = await resolvePortalAccess(admin, token);
  if (!access) {
    return { ok: false, message: 'Your link has expired. Please request a fresh one.' };
  }

  const result = await submitPortalMessage(admin, {
    accountId: access.accountId,
    clientId: access.clientId,
    body,
    jobId,
  });

  if (result.ok) {
    revalidatePath(`/portal/view/${token}`);
  }

  return result;
}

export async function customerTogglePlanAction(
  token: string,
  planId: string,
  active: boolean,
): Promise<void> {
  const admin = createAdminClient();
  const access = await resolvePortalAccess(admin, token);
  if (!access) {
    throw new Error('Your link has expired. Please request a fresh one.');
  }

  const { data: plan, error: planError } = await admin
    .from('recurring_plans')
    .select('id, client_id, title')
    .eq('account_id', access.accountId)
    .eq('id', planId)
    .maybeSingle();

  if (planError || !plan || plan.client_id !== access.clientId) {
    throw new Error('Plan not found or unauthorized.');
  }

  const { setRecurringPlanActive } = await import('@/lib/recurring');
  await setRecurringPlanActive(admin, access.accountId, planId, active);

  revalidatePath(`/portal/view/${token}`);
}

