import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Resend } from 'resend';
import { sendLifecycleMessage } from '@/lib/contractor-lifecycle-sends';

const message = { from: 'LGQ <hello@letsgetquoted.com>', to: 'owner@example.com', subject: 'Original', html: '<p>Welcome</p>' };
const claim = () => ({ action: 'send', id: 'send-one', token: 'lease-one', key: 'contractor-lifecycle/account/welcome_day0',
  payload: { ...message, tags: [{ name: 'lifecycle_send_id', value: 'send-one' }] }, retry_before: '2026-09-15T12:00:00Z' });
const rpc = vi.fn();
const fetchRequest = vi.fn();
const admin = { rpc } as unknown as SupabaseClient;
const resend = { key: 'synthetic-key', fetchRequest } as unknown as Resend;

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-14T13:00:00Z'));
  rpc.mockReset().mockResolvedValueOnce({ data: claim(), error: null }).mockResolvedValue({ data: true, error: null });
  fetchRequest.mockReset().mockResolvedValue({ data: { id: 'provider-one' }, error: null });
});
afterEach(() => vi.useRealTimers());

describe('durable lifecycle send transport', () => {
  it('sends the stored snapshot and only succeeds after durable acceptance', async () => {
    const result = await sendLifecycleMessage(admin, resend, { ...message, subject: 'Changed template' }, 'account', 'welcome_day0');
    expect(result).toEqual({ data: { id: 'provider-one' }, error: null });
    const [path, options] = fetchRequest.mock.calls[0];
    expect(path).toBe('/emails');
    expect(JSON.parse(options.body)).toEqual(claim().payload);
    expect(options.headers['Idempotency-Key']).toBe(claim().key);
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(rpc.mock.calls[1]).toEqual(['finish_contractor_lifecycle_send', {
      p_id: 'send-one', p_account_id: 'account', p_token: 'lease-one', p_provider_id: 'provider-one', p_error: null,
    }]);
    expect(rpc.mock.invocationCallOrder[0]).toBeLessThan(fetchRequest.mock.invocationCallOrder[0]);
    expect(fetchRequest.mock.invocationCallOrder[0]).toBeLessThan(rpc.mock.invocationCallOrder[1]);
  });

  it.each(['already_sent', 'busy', 'blocked'])('does not send or write completion for %s', async action => {
    rpc.mockReset().mockResolvedValue({ data: { action }, error: null });
    expect(await sendLifecycleMessage(admin, resend, message, 'account', 'welcome_day0')).toMatchObject({ skipped: action });
    expect(fetchRequest).not.toHaveBeenCalled(); expect(rpc).toHaveBeenCalledOnce();
  });

  it('surfaces manual review as an operational error', async () => {
    rpc.mockReset().mockResolvedValue({ data: { action: 'review', reason: 'retry_window_or_attempt_limit' }, error: null });
    const result = await sendLifecycleMessage(admin, resend, message, 'account', 'welcome_day0');
    expect(result.error?.message).toContain('requires review');
    expect(fetchRequest).not.toHaveBeenCalled();
  });

  it.each([
    { data: null, error: { message: 'migration missing' } },
    { data: { action: 'unexpected' }, error: null },
    { data: { ...claim(), retry_before: 'invalid' }, error: null },
  ])('fails closed on a missing or malformed claim', async response => {
    rpc.mockReset().mockResolvedValue(response);
    await expect(sendLifecycleMessage(admin, resend, message, 'account', 'welcome_day0')).rejects.toThrow(/claim/);
    expect(fetchRequest).not.toHaveBeenCalled();
  });

  it('checks the deadline again before provider submission', async () => {
    rpc.mockReset().mockResolvedValueOnce({ data: { ...claim(), retry_before: '2026-09-14T12:59:59Z' }, error: null })
      .mockResolvedValue({ data: true, error: null });
    const result = await sendLifecycleMessage(admin, resend, message, 'account', 'welcome_day0');
    expect(result.error?.message).toContain('window expired');
    expect(fetchRequest).not.toHaveBeenCalled();
    expect(rpc.mock.calls[1][1].p_provider_id).toBeNull();
  });

  it('records a thrown timeout without switching sender or blindly retrying', async () => {
    fetchRequest.mockRejectedValue(new Error('timeout'));
    expect(await sendLifecycleMessage(admin, resend, message, 'account', 'welcome_day0')).toMatchObject({ error: { message: 'timeout' } });
    expect(fetchRequest).toHaveBeenCalledOnce();
    expect(rpc.mock.calls[1][1]).toMatchObject({ p_provider_id: null, p_error: 'timeout' });
  });

  it.each([{ data: false, error: null }, { data: null, error: { message: 'database unavailable' } }])('never reports success when the acceptance write fails', async response => {
    rpc.mockReset().mockResolvedValueOnce({ data: claim(), error: null }).mockResolvedValue(response);
    await expect(sendLifecycleMessage(admin, resend, message, 'account', 'welcome_day0')).rejects.toThrow('requires reconciliation');
    expect(fetchRequest).toHaveBeenCalledOnce();
  });

  it('treats an empty provider response as an uncertain outcome', async () => {
    fetchRequest.mockResolvedValue({ data: null, error: null });
    const result = await sendLifecycleMessage(admin, resend, message, 'account', 'welcome_day0');
    expect(result.error?.message).toBe('Provider did not confirm an email ID');
    expect(rpc.mock.calls[1][1].p_provider_id).toBeNull();
  });
});
