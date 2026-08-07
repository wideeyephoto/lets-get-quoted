'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requirePermission } from '@/lib/auth';
import { logAdminAction } from '@/lib/admin';

// Command Center-level actions — not scoped to one account, so this lives
// alongside page.tsx rather than under accounts/[id].

function backTo(query: string): never {
  redirect(`/admin?${query}`);
}

export async function resolveWebhookFailureAction(failureId: string) {
  const ctx = await requirePermission('ops.manage');
  const { admin } = ctx;
  await admin.from('webhook_failures').update({ resolved_at: new Date().toISOString(), resolved_by: ctx.adminEmail }).eq('id', failureId);
  await logAdminAction(admin, ctx, { action: 'webhook_failure_resolve', targetType: 'webhook_failure', targetId: failureId });
  revalidatePath('/admin');
  backTo('done=webhook_resolved');
}
