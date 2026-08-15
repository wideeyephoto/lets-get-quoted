'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requirePermission } from '@/lib/auth';
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
  const ctx = await requirePermission('account.support');
  const { admin } = ctx;
  const body = String(formData.get('body') ?? '').trim();
  if (!body) backTo(caseId, 'error=note');

  // Falls back to 'internal'. The harmless outcome of a malformed submit is a
  // note only staff can see; the harmful one is working notes reaching the
  // customer they are about.
  const visibility = visibilityFromForm(String(formData.get('visibility') ?? ''));
  const saved = await addSupportCaseNote(admin, ctx, caseId, body, visibility);
  if (!saved) backTo(caseId, 'error=save');

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
  const ctx = await requirePermission('account.support');
  const { admin } = ctx;
  const status = String(formData.get('status') ?? '').trim();
  if (!isCaseStatus(status)) backTo(caseId, 'error=status');
  const saved = await updateSupportCaseStatus(admin, ctx, caseId, status);
  if (!saved) backTo(caseId, 'error=save');
  revalidatePath(`/admin/cases/${caseId}`);
  backTo(caseId, 'done=status');
}

export async function assignCaseAction(caseId: string, formData: FormData) {
  const ctx = await requirePermission('account.support');
  const { admin } = ctx;
  const assignedTo = String(formData.get('assigned_to') ?? '').trim() || null;
  if (assignedTo) {
    const { data, error } = await admin.from('staff').select('id').ilike('email', assignedTo).eq('active', true).maybeSingle();
    if (error || !data) backTo(caseId, 'error=assignee');
  }
  const saved = await assignSupportCase(admin, ctx, caseId, assignedTo);
  if (!saved) backTo(caseId, 'error=save');
  revalidatePath(`/admin/cases/${caseId}`);
  backTo(caseId, 'done=assigned');
}
