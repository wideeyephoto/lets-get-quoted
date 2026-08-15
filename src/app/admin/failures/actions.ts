'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireMfaPermission } from '@/lib/auth';
import { logAdminAction } from '@/lib/admin';

export async function resolveWebhookGroupAction(ids: string[], formData: FormData) {
  const ctx = await requireMfaPermission('ops.manage');
  const reason = String(formData.get('reason') ?? '').trim();
  if (reason.length < 4) redirect('/admin/failures?error=reason#webhooks');
  const safeIds = ids.filter((id) => /^[0-9a-f-]{36}$/i.test(id)).slice(0, 100);
  if (!safeIds.length) redirect('/admin/failures?error=missing#webhooks');
  const resolvedAt = new Date().toISOString();
  const { error } = await ctx.admin.from('webhook_failures').update({ resolved_at: resolvedAt, resolved_by: ctx.adminEmail }).in('id', safeIds);
  if (error) redirect('/admin/failures?error=failed#webhooks');
  await logAdminAction(ctx.admin, ctx, {
    action: 'webhook_failure_group_resolve',
    targetType: 'webhook_failure_group',
    reason,
    after: { resolved_at: resolvedAt },
    meta: { count: safeIds.length, ids: safeIds },
  });
  revalidatePath('/admin');
  revalidatePath('/admin/health');
  revalidatePath('/admin/failures');
  redirect('/admin/failures?done=resolved#webhooks');
}
