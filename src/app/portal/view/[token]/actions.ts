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
