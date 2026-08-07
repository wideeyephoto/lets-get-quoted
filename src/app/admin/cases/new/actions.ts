'use server';

import { redirect } from 'next/navigation';
import { requirePermission } from '@/lib/auth';
import { createSupportCase, isCasePriority } from '@/lib/support-cases';

export async function createCaseAction(formData: FormData) {
  const ctx = await requirePermission('account.support');
  const { admin } = ctx;
  const subject = String(formData.get('subject') ?? '').trim();
  const accountId = String(formData.get('account_id') ?? '').trim() || null;
  const priorityRaw = String(formData.get('priority') ?? '').trim();
  const assignedTo = String(formData.get('assigned_to') ?? '').trim() || null;
  const slaDueAtRaw = String(formData.get('sla_due_at') ?? '').trim();

  if (!subject) redirect('/admin/cases/new?error=subject');

  const created = await createSupportCase(admin, ctx, {
    accountId,
    subject,
    priority: isCasePriority(priorityRaw) ? priorityRaw : 'normal',
    assignedTo,
    slaDueAt: slaDueAtRaw ? new Date(slaDueAtRaw).toISOString() : null,
  });

  redirect(`/admin/cases/${created.id}?done=created`);
}
