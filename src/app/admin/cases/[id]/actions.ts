'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth';
import {
  addSupportCaseNote,
  updateSupportCaseStatus,
  assignSupportCase,
  getSupportCase,
  isCaseStatus,
  visibilityFromForm,
} from '@/lib/support-cases';
import { sendSupportCaseCustomerEmail } from '@/lib/email';

function backTo(id: string, query: string): never {
  redirect(`/admin/cases/${id}?${query}`);
}

export async function addNoteAction(caseId: string, formData: FormData) {
  const { admin, adminEmail } = await requireAdmin();
  const body = String(formData.get('body') ?? '').trim();
  if (!body) backTo(caseId, 'error=note');

  // Falls back to 'internal'. The harmless outcome of a malformed submit is a
  // note only staff can see; the harmful one is working notes reaching the
  // customer they are about.
  const visibility = visibilityFromForm(String(formData.get('visibility') ?? ''));
  await addSupportCaseNote(admin, adminEmail, caseId, body, visibility);

  if (visibility === 'customer') {
    // Nobody watches a support page waiting for a reply to appear — the email
    // is what actually brings them back. Failure is logged, never surfaced as
    // a failure of the reply, which is already saved.
    const supportCase = await getSupportCase(admin, caseId);
    const to = supportCase?.requester_email;
    if (to) {
      try {
        await sendSupportCaseCustomerEmail({ kind: 'reply', to, caseId, subject: supportCase.subject, body });
      } catch (err) {
        console.error('support case reply email failed:', err);
      }
    }
  }

  revalidatePath(`/admin/cases/${caseId}`);
  backTo(caseId, visibility === 'customer' ? 'done=replied' : 'done=noted');
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
