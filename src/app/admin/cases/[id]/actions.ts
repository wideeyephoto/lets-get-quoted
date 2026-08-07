'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth';
import { addSupportCaseNote, updateSupportCaseStatus, assignSupportCase, isCaseStatus } from '@/lib/support-cases';

function backTo(id: string, query: string): never {
  redirect(`/admin/cases/${id}?${query}`);
}

export async function addNoteAction(caseId: string, formData: FormData) {
  const { admin, adminEmail } = await requireAdmin();
  const body = String(formData.get('body') ?? '').trim();
  if (!body) backTo(caseId, 'error=note');
  await addSupportCaseNote(admin, adminEmail, caseId, body);
  revalidatePath(`/admin/cases/${caseId}`);
  backTo(caseId, 'done=noted');
}

export async function changeStatusAction(caseId: string, formData: FormData) {
  const { admin, adminEmail } = await requireAdmin();
  const status = String(formData.get('status') ?? '').trim();
  if (!isCaseStatus(status)) backTo(caseId, 'error=status');
  await updateSupportCaseStatus(admin, adminEmail, caseId, status);
  revalidatePath(`/admin/cases/${caseId}`);
  backTo(caseId, 'done=status');
}

export async function assignCaseAction(caseId: string, formData: FormData) {
  const { admin, adminEmail } = await requireAdmin();
  const assignedTo = String(formData.get('assigned_to') ?? '').trim() || null;
  await assignSupportCase(admin, adminEmail, caseId, assignedTo);
  revalidatePath(`/admin/cases/${caseId}`);
  backTo(caseId, 'done=assigned');
}
