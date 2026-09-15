'use server';

import { revalidatePath } from 'next/cache';
import { requirePermission } from '@/lib/auth';
import { resolvePrivacyRequest } from '@/lib/privacy-requests';

export async function resolvePlatformPrivacyRequestAction(formData: FormData) {
  const ctx = await requirePermission('privacy.manage');
  const requestId = String(formData.get('request_id') ?? '').trim();
  const resolutionNotes = String(formData.get('resolution_notes') ?? '').trim();
  if (!requestId) {
    throw new Error('Missing request_id');
  }
  if (!resolutionNotes) {
    throw new Error('Operational resolution notes are required to resolve a privacy request.');
  }

  await resolvePrivacyRequest(ctx.admin, ctx, requestId, resolutionNotes);
  revalidatePath('/admin/privacy-requests');
  revalidatePath('/admin');
}
