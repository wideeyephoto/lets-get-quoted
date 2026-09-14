import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Resend } from 'resend';
import { sendDocumentEmail } from '@/lib/document-email-sends';

const context = { accountId: 'account', jobId: 'job', jobRevision: 'revision' };
const payload = { from: 'Builder <quotes@builder.example>', to: 'client@example.com', subject: 'Quote', html: '<p>Original link</p>',
  tags: [{ name: 'kind', value: 'client_quote' }] };
const saved = () => ({ action: 'send', id: 'intent', token: 'lease', key: 'document-email/intent/primary', phase: 'primary',
  retry_before: new Date(Date.now() + 3_600_000).toISOString(), payload });
const accepted = { data: { id: 'provider-id' }, error: null };
const rejected = { data: null, error: { name: 'validation_error', message: 'The builder.example domain is not verified.' } };
const rpc = vi.fn(); const fetchRequest = vi.fn();
const admin = { rpc } as unknown as SupabaseClient;
const resend = { key: 'synthetic-key', fetchRequest } as unknown as Resend;
beforeEach(() => {
  rpc.mockReset().mockResolvedValueOnce({ data: saved(), error: null }).mockResolvedValue({ data: true, error: null });
  fetchRequest.mockReset().mockResolvedValue(accepted);
});

describe('document email durable transport', () => {
  it('uses saved content and encodes PDF bytes before claiming', async () => {
    expect(await sendDocumentEmail(admin, resend, context, { ...payload, html: 'Regenerated link',
      attachments: [{ filename: 'invoice.pdf', content: Buffer.from('PDF bytes') }] })).toEqual({ id: 'provider-id', alreadyAccepted: false });
    expect(rpc.mock.calls[0][1].p_payload.attachments[0].content).toBe(Buffer.from('PDF bytes').toString('base64'));
    expect(JSON.parse(fetchRequest.mock.calls[0][1].body)).toEqual(payload);
    expect(fetchRequest.mock.calls[0][1].headers['Idempotency-Key']).toBe(saved().key);
    expect(rpc.mock.invocationCallOrder[0]).toBeLessThan(fetchRequest.mock.invocationCallOrder[0]);
    expect(rpc.mock.calls[1][0]).toBe('finish_document_email_send');
  });
  it('returns durable previous acceptance without contacting Resend', async () => {
    rpc.mockReset().mockResolvedValue({ data: { action: 'already_sent', provider_id: 'old-id' }, error: null });
    expect(await sendDocumentEmail(admin, resend, context, payload)).toEqual({ id: 'old-id', alreadyAccepted: true });
    expect(fetchRequest).not.toHaveBeenCalled();
  });
  it.each(['busy', 'blocked', 'review', 'invalid'])('does not submit for %s', async action => {
    rpc.mockReset().mockResolvedValue({ data: { action }, error: null });
    await expect(sendDocumentEmail(admin, resend, context, payload)).rejects.toThrow();
    expect(fetchRequest).not.toHaveBeenCalled();
  });
  it('fails closed on a missing migration or document revision', async () => {
    await expect(sendDocumentEmail(admin, resend, { ...context, jobRevision: undefined }, payload)).rejects.toThrow('revision');
    expect(rpc).not.toHaveBeenCalled();
    rpc.mockReset().mockResolvedValue({ data: null, error: { message: 'missing RPC' } });
    await expect(sendDocumentEmail(admin, resend, context, payload)).rejects.toThrow('record is unavailable');
    expect(fetchRequest).not.toHaveBeenCalled();
  });
  it('persists the fallback phase before using its distinct key and stored content', async () => {
    const fallback = { ...saved(), phase: 'fallback', key: 'document-email/intent/fallback', payload: { ...payload, from: 'Builder <hello@letsgetquoted.com>' } };
    rpc.mockReset().mockResolvedValueOnce({ data: saved(), error: null }).mockResolvedValueOnce({ data: fallback, error: null })
      .mockResolvedValue({ data: true, error: null });
    fetchRequest.mockResolvedValueOnce(rejected).mockResolvedValueOnce(accepted);
    await sendDocumentEmail(admin, resend, context, payload);
    expect(rpc.mock.calls[1][0]).toBe('fallback_document_email_send');
    expect(rpc.mock.invocationCallOrder[1]).toBeLessThan(fetchRequest.mock.invocationCallOrder[1]);
    expect(fetchRequest.mock.calls[1][1].headers['Idempotency-Key']).toBe(fallback.key);
    expect(JSON.parse(fetchRequest.mock.calls[1][1].body)).toEqual(fallback.payload);
  });
  it('resumes a saved fallback without submitting the original sender again', async () => {
    rpc.mockReset().mockResolvedValueOnce({ data: { ...saved(), phase: 'fallback', key: 'fallback-key' }, error: null })
      .mockResolvedValue({ data: true, error: null });
    fetchRequest.mockResolvedValue(rejected);
    await expect(sendDocumentEmail(admin, resend, context, payload)).rejects.toThrow('not confirmed');
    expect(fetchRequest).toHaveBeenCalledOnce();
    expect(rpc.mock.calls.map(call => call[0])).not.toContain('fallback_document_email_send');
  });
  it.each(['rate_limit_exceeded', 'application_error', 'restricted_api_key'])('does not change sender after %s', async name => {
    fetchRequest.mockResolvedValue({ data: null, error: { name, message: 'failed' } });
    await expect(sendDocumentEmail(admin, resend, context, payload)).rejects.toThrow('not confirmed');
    expect(fetchRequest).toHaveBeenCalledOnce();
    expect(rpc.mock.calls[1][0]).toBe('finish_document_email_send');
  });
  it('records ambiguous timeouts and does not resend automatically', async () => {
    fetchRequest.mockRejectedValue(new Error('timeout'));
    await expect(sendDocumentEmail(admin, resend, context, payload)).rejects.toThrow('not confirmed');
    expect(fetchRequest).toHaveBeenCalledOnce();
    expect(rpc.mock.calls[1][1]).toMatchObject({ p_provider_id: null, p_error: 'timeout' });
  });
  it('does not proceed if the fallback transition cannot be saved', async () => {
    fetchRequest.mockResolvedValue(rejected);
    rpc.mockReset().mockResolvedValueOnce({ data: saved(), error: null }).mockResolvedValue({ data: null, error: { message: 'offline' } });
    await expect(sendDocumentEmail(admin, resend, context, payload)).rejects.toThrow('reconciliation');
    expect(fetchRequest).toHaveBeenCalledOnce();
  });
  it('refuses success when provider acceptance cannot be saved', async () => {
    rpc.mockReset().mockResolvedValueOnce({ data: saved(), error: null }).mockResolvedValue({ data: false, error: null });
    await expect(sendDocumentEmail(admin, resend, context, payload)).rejects.toThrow('reconciliation');
  });
  it('rechecks the fixed expiry before submission', async () => {
    rpc.mockReset().mockResolvedValueOnce({ data: { ...saved(), retry_before: '2020-01-01T00:00:00Z' }, error: null })
      .mockResolvedValue({ data: true, error: null });
    await expect(sendDocumentEmail(admin, resend, context, payload)).rejects.toThrow('not confirmed');
    expect(fetchRequest).not.toHaveBeenCalled();
  });
});
