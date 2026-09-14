'use server';

import { redirect } from 'next/navigation';
import { requireAdminSession } from '@/lib/admin-session';
import { getAdminSupabaseClient } from '@/lib/supabase-admin';
import { randomUUID } from 'crypto';

export async function resolveEmailSend(source: string, id: string, formData: FormData) {
  const session = await requireAdminSession();
  const admin = getAdminSupabaseClient();
  
  const evidence = formData.get('evidence') as string;
  const providerId = formData.get('provider_id') as string | null;
  
  if (!evidence) {
    throw new Error('Evidence is required');
  }

  const table = source === 'lifecycle' ? 'contractor_lifecycle_sends' : 'document_email_sends';
  const { data: sendData } = await admin.from(table).select('account_id').eq('id', id).single();
  
  if (!sendData) {
    throw new Error('Send not found');
  }

  let result;
  if (source === 'lifecycle') {
    result = await admin.rpc('resolve_contractor_lifecycle_send', {
      p_id: id,
      p_account_id: sendData.account_id,
      p_actor: session.user.email,
      p_evidence: evidence,
      p_provider_id: providerId || null
    });
  } else {
    result = await admin.rpc('resolve_document_email_send', {
      p_id: id,
      p_account_id: sendData.account_id,
      p_actor: session.user.email,
      p_evidence: evidence,
      p_provider_id: providerId || null
    });
  }
  
  if (result.error) {
    throw new Error(`Resolve failed: ${result.error.message}`);
  }

  redirect(`/admin/health/email/${source}/${id}`);
}

export async function resendDocumentEmail(id: string) {
  const session = await requireAdminSession();
  const admin = getAdminSupabaseClient();
  
  const { data: sendData } = await admin.from('document_email_sends').select('account_id').eq('id', id).single();
  
  if (!sendData) {
    throw new Error('Original send not found');
  }

  const idempotencyKey = randomUUID();

  const { data, error } = await admin.rpc('submit_document_email_resend', {
    p_original_send_id: id,
    p_account_id: sendData.account_id,
    p_actor: session.user.email,
    p_idempotency_key: idempotencyKey
  });

  if (error) {
    throw new Error(`Resend failed: ${error.message}`);
  }

  redirect(`/admin/health/email/document/${data}`);
}
