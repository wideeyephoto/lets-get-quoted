'use server';

import { revalidatePath } from 'next/cache';
import { requirePermission } from '@/lib/auth';
import { resolvePrivacyRequest } from '@/lib/privacy-requests';

export async function resolvePlatformPrivacyRequestAction(formData: FormData) {
  const ctx = await requirePermission('privacy.manage');
  const requestId = String(formData.get('request_id') ?? '').trim();
  if (!requestId) {
    throw new Error('Missing request_id');
  }

  await resolvePrivacyRequest(ctx.admin, ctx, requestId);
  revalidatePath('/admin/privacy-requests');
  revalidatePath('/admin');
}
