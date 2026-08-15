'use server';

import { redirect } from 'next/navigation';
import { requirePermission } from '@/lib/auth';
import { addSupportCaseNote, createSupportCase, defaultCaseSla, isCasePriority } from '@/lib/support-cases';

export async function createCaseAction(formData: FormData) {
  const ctx = await requirePermission('account.support');
  const { admin } = ctx;
  const subject = String(formData.get('subject') ?? '').trim();
  const accountId = String(formData.get('account_id') ?? '').trim() || null;
  const priorityRaw = String(formData.get('priority') ?? '').trim();
  const assignedTo = String(formData.get('assigned_to') ?? '').trim() || null;
  const slaDueAtRaw = String(formData.get('sla_due_at') ?? '').trim();
  const body = String(formData.get('body') ?? '').trim();

  if (!subject) redirect('/admin/cases/new?error=subject');
  if (accountId && !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(accountId)) redirect('/admin/cases/new?error=account');
  if (assignedTo && !/^\S+@\S+\.\S+$/.test(assignedTo)) redirect('/admin/cases/new?error=assignee');
  if (assignedTo) {
    const { data: assignee, error } = await admin.from('staff').select('id').ilike('email', assignedTo).eq('active', true).maybeSingle();
    if (error || !assignee) redirect('/admin/cases/new?error=assignee');
  }

  const priority = isCasePriority(priorityRaw) ? priorityRaw : 'normal';
  const parsedSla = slaDueAtRaw ? new Date(`${slaDueAtRaw}Z`) : null;
  if (parsedSla && !Number.isFinite(parsedSla.getTime())) redirect('/admin/cases/new?error=sla');
  let created;
  try {
    created = await createSupportCase(admin, ctx, {
      accountId,
      subject,
      priority,
      assignedTo,
      slaDueAt: parsedSla ? parsedSla.toISOString() : defaultCaseSla(priority),
    });
  } catch (error) {
    console.error('createCaseAction failed:', error);
    redirect('/admin/cases/new?error=failed');
  }

  if (body && !(await addSupportCaseNote(admin, ctx, created.id, body, 'internal'))) {
    redirect(`/admin/cases/${created.id}?error=initial_note`);
  }

  redirect(`/admin/cases/${created.id}?done=created`);
}
