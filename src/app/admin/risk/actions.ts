'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireMfaPermission } from '@/lib/auth';
import { logAdminAction } from '@/lib/admin';
import { isRiskDisposition } from '@/lib/risk-reviews';

export async function setRiskDispositionAction(accountId: string, formData: FormData) {
  const ctx = await requireMfaPermission('account.enforce');
  const disposition = String(formData.get('disposition') ?? '');
  const note = String(formData.get('note') ?? '').trim();
  const reviewOn = String(formData.get('review_on') ?? '').trim() || null;
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(accountId)) redirect('/admin/risk?error=account');
  if (!isRiskDisposition(disposition)) redirect('/admin/risk?error=disposition');
  if (note.length < 4) redirect('/admin/risk?error=note');
  if (reviewOn && (!/^\d{4}-\d{2}-\d{2}$/.test(reviewOn) || !Number.isFinite(Date.parse(`${reviewOn}T00:00:00Z`)))) redirect('/admin/risk?error=date');
  const { error } = await ctx.admin.from('risk_reviews').insert({ account_id: accountId, disposition, note, review_on: reviewOn, created_by: ctx.adminEmail });
  if (error) redirect('/admin/risk?error=failed');
  await logAdminAction(ctx.admin, ctx, { action: 'risk_disposition', accountId, targetType: 'account', targetId: accountId, reason: note, after: { disposition, review_on: reviewOn } });
  revalidatePath('/admin/risk');
  redirect('/admin/risk?done=reviewed');
}
