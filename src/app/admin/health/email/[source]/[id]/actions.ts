'use server';

import { redirect } from 'next/navigation';
import { requireMfaPermission } from '@/lib/auth';
import { createHash } from 'node:crypto';
import { Resend } from 'resend';
import { executeDocumentEmailClaim } from '@/lib/document-email-sends';

export async function resolveEmailSend(source: string, id: string, formData: FormData) {
  const session = await requireMfaPermission('ops.manage');
  const admin = session.admin;
  
  const evidence = formData.get('evidence') as string;
  const providerId = formData.get('provider_id') as string | null;
  
  if (!evidence) {
    throw new Error('Evidence is required');
  }

  if (!['lifecycle', 'document'].includes(source)) throw new Error('Invalid email source');
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
      p_actor: session.adminEmail,
      p_evidence: evidence,
      p_provider_id: providerId || null
    });
  } else {
    result = await admin.rpc('resolve_document_email_send', {
      p_id: id,
      p_account_id: sendData.account_id,
      p_actor: session.adminEmail,
      p_evidence: evidence,
      p_provider_id: providerId || null
    });
  }
  
  if (result.error || result.data !== true) {
    throw new Error(`Resolve failed: ${result.error?.message ?? 'Send is not eligible for closeout'}`);
  }

  redirect(`/admin/health/email/${source}/${id}`);
}

export async function resendDocumentEmail(id: string, formData: FormData) {
  const session = await requireMfaPermission('ops.manage');
  const admin = session.admin;
  
  const { data: sendData } = await admin.from('document_email_sends').select('account_id').eq('id', id).single();
  
  if (!sendData) {
    throw new Error('Original send not found');
  }

  const idempotencyKey = String(formData.get('request_id') ?? '');
  if (!/^[a-f0-9-]{36}$/i.test(idempotencyKey)) throw new Error('Reload before resending');
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('Email provider is not configured');

  const { data, error } = await admin.rpc('submit_document_email_resend', {
    p_original_send_id: id,
    p_account_id: sendData.account_id,
    p_actor: session.adminEmail,
    p_idempotency_key: idempotencyKey,
    p_provider_scope: createHash('sha256').update(key).digest('hex')
  });

  if (error) {
    throw new Error(`Resend failed: ${error.message}`);
  }

  await executeDocumentEmailClaim(admin, new Resend(key), sendData.account_id, data);
  redirect(`/admin/health/email/document/${data.id ?? id}`);
}
