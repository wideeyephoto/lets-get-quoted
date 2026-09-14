import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { runEmailRecovery, retryAfterSeconds, recoveryProvider } from '@/lib/email-recovery-worker';

const rpc = vi.fn();
const admin = { rpc } as unknown as SupabaseClient;
const fetcher = vi.fn();
const work = { source: 'document', send_id: 'intent', account_id: 'account', work: 'resume' };
const claim = () => ({ action: 'send', id: 'intent', account_id: 'account', token: 'lease', phase: 'primary',
  key: 'original-key', payload: { from: 'Builder <quotes@builder.example>', to: 'client@example.test', subject: 'Saved',
    html: 'saved-link', attachments: [{ filename: 'invoice.pdf', content: 'cGRm' }] },
  retry_before: new Date(Date.now() + 3_600_000).toISOString() });
const options = () => ({ fetcher: fetcher as typeof fetch, sleep: vi.fn().mockResolvedValue(undefined) });
beforeEach(() => {
  vi.stubEnv('EMAIL_RECOVERY_ENABLED', 'true'); vi.stubEnv('RESEND_API_KEY', 'test-key');
  rpc.mockReset().mockImplementation(async (name: string) => ({ error: null, data:
    name === 'begin_email_recovery_run' ? 'run' : name === 'due_email_recovery_work' ? [work]
      : name === 'claim_email_recovery_send' ? claim() : name === 'reconcile_email_recovery_acceptance' ? false : true }));
  fetcher.mockReset().mockResolvedValue(new Response(JSON.stringify({ id: 'provider-id' }), { status: 200 }));
});
afterEach(() => vi.unstubAllEnvs());

describe('bounded saved-email recovery', () => {
  it('is disabled without an explicit environment flag and makes no database/provider call', async () => {
    vi.stubEnv('EMAIL_RECOVERY_ENABLED', 'false');
    expect((await runEmailRecovery(admin, options())).disabled).toBe(true);
    expect(rpc).not.toHaveBeenCalled(); expect(fetcher).not.toHaveBeenCalled();
  });
  it('previews due work without claims, heartbeats or a provider key', async () => {
    vi.stubEnv('RESEND_API_KEY', '');
    const result = await runEmailRecovery(admin, { ...options(), dryRun: true });
    expect(result).toMatchObject({ dryRun: true, selected: 1, due: 1, accepted: 0 });
    expect(rpc.mock.calls.map(c => c[0])).toEqual(['due_email_recovery_work']);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('fails visibly on an unavailable preview', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'private details' } });
    await expect(runEmailRecovery(admin, { dryRun: true })).rejects.toThrow('preview unavailable');
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('does not run when the database is paused, cooling down, or already leased', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    expect((await runEmailRecovery(admin, options())).deferred).toBe(1);
    expect(rpc).toHaveBeenCalledOnce(); expect(fetcher).not.toHaveBeenCalled();
  });
  it('submits the exact snapshot and key, records acceptance and releases the run', async () => {
    expect((await runEmailRecovery(admin, options())).accepted).toBe(1);
    expect(fetcher).toHaveBeenCalledOnce();
    const [url, request] = fetcher.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    expect(JSON.parse(request.body)).toEqual(claim().payload);
    expect(request.headers['Idempotency-Key']).toBe('original-key');
    expect(request.redirect).toBe('error');
    expect(rpc).toHaveBeenCalledWith('finish_email_recovery_send', expect.objectContaining({ p_token: 'lease', p_provider_id: 'provider-id', p_run_token: 'run' }));
    expect(rpc.mock.calls.at(-1)?.[0]).toBe('end_email_recovery_run');
  });
  it('rechecks pause and recipient eligibility immediately before HTTP submission', async () => {
    const original = rpc.getMockImplementation()!;
    rpc.mockImplementation((name: string, ...args: unknown[]) => name === 'validate_email_recovery_submission'
      ? Promise.resolve({ data: false, error: null }) : original(name, ...args));
    expect((await runEmailRecovery(admin, options())).failed).toBe(1);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('resumes a saved fallback without trying the original sender', async () => {
    const original = rpc.getMockImplementation()!;
    rpc.mockImplementation((name: string, ...args: unknown[]) => name === 'claim_email_recovery_send'
      ? Promise.resolve({ data: { ...claim(), phase: 'fallback', key: 'fallback-key' }, error: null }) : original(name, ...args));
    await runEmailRecovery(admin, options());
    expect(fetcher.mock.calls[0][1].headers['Idempotency-Key']).toBe('fallback-key');
    expect(rpc.mock.calls.map(c => c[0])).not.toContain('fallback_document_email_send');
  });
  it('persists a definitive fallback and revalidates before its second request', async () => {
    const original = rpc.getMockImplementation()!;
    rpc.mockImplementation((name: string, ...args: unknown[]) => name === 'fallback_document_email_send'
      ? Promise.resolve({ data: { ...claim(), phase: 'fallback', key: 'fallback-key',
        payload: { ...claim().payload, from: 'Builder <hello@letsgetquoted.com>' } }, error: null }) : original(name, ...args));
    fetcher.mockResolvedValueOnce(new Response(JSON.stringify({ name: 'validation_error', message: 'The builder.example domain is not verified.' }), { status: 403 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'fallback-provider' }), { status: 200 }));
    expect((await runEmailRecovery(admin, options())).accepted).toBe(1);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[1][1].headers['Idempotency-Key']).toBe('fallback-key');
    expect(rpc.mock.calls.filter(c => c[0] === 'validate_email_recovery_submission')).toHaveLength(2);
  });
  it('records provider Retry-After and stops the batch on a quota error', async () => {
    const original = rpc.getMockImplementation()!;
    rpc.mockImplementation((name: string, ...args: unknown[]) => name === 'due_email_recovery_work'
      ? Promise.resolve({ data: [work, { ...work, send_id: 'second-intent' }], error: null }) : original(name, ...args));
    fetcher.mockResolvedValue(new Response(JSON.stringify({ name: 'daily_quota_exceeded', message: 'Quota' }), { status: 429, headers: { 'Retry-After': '7200' } }));
    expect(await runEmailRecovery(admin, options())).toMatchObject({ failed: 1, deferred: 1 });
    expect(rpc).toHaveBeenCalledWith('finish_email_recovery_send', expect.objectContaining({ p_error_name: 'daily_quota_exceeded', p_retry_seconds: 7200, p_provider_id: null }));
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it('preserves ambiguous timeouts without reporting acceptance', async () => {
    fetcher.mockRejectedValue(new Error('timeout'));
    const result = await runEmailRecovery(admin, options());
    expect(result).toMatchObject({ failed: 1, accepted: 0 });
    expect(rpc).toHaveBeenCalledWith('finish_email_recovery_send', expect.objectContaining({ p_provider_id: null }));
  });
  it('repairs accepted invoice bookkeeping without a provider call', async () => {
    const original = rpc.getMockImplementation()!;
    rpc.mockImplementation((name: string, ...args: unknown[]) => name === 'due_email_recovery_work'
      ? Promise.resolve({ data: [{ ...work, work: 'reconcile' }], error: null })
      : name === 'reconcile_email_recovery_acceptance' ? Promise.resolve({ data: true, error: null }) : original(name, ...args));
    expect((await runEmailRecovery(admin, options())).reconciled).toBe(1);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('refuses a mismatched claimed identity and releases its lease', async () => {
    const original = rpc.getMockImplementation()!;
    rpc.mockImplementation((name: string, ...args: unknown[]) => name === 'claim_email_recovery_send'
      ? Promise.resolve({ data: { ...claim(), account_id: 'another-workspace' }, error: null }) : original(name, ...args));
    await expect(runEmailRecovery(admin, options())).rejects.toThrow('identity');
    expect(fetcher).not.toHaveBeenCalled(); expect(rpc.mock.calls.at(-1)?.[0]).toBe('end_email_recovery_run');
  });
  it('defers work when insufficient run time remains', async () => {
    const now = vi.fn().mockReturnValueOnce(0).mockReturnValue(51_000);
    expect((await runEmailRecovery(admin, { ...options(), now })).deferred).toBe(1);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('paces requests and checks the hold again after waiting', async () => {
    const sequence: string[] = [];
    const provider = recoveryProvider('key', fetcher as typeof fetch, () => 0,
      async () => { sequence.push('wait'); }, async () => { sequence.push('check'); });
    await provider.fetchRequest('/emails', {}); await provider.fetchRequest('/emails', {});
    expect(sequence).toEqual(['check', 'wait', 'check']);
  });
  it('bounds Retry-After seconds and supports HTTP dates', () => {
    expect(retryAfterSeconds('1', 0)).toBe(300);
    expect(retryAfterSeconds('999999999', 0)).toBe(82800);
    expect(retryAfterSeconds('Thu, 01 Jan 1970 01:00:00 GMT', 0)).toBe(3600);
    expect(retryAfterSeconds('bad', 0)).toBeUndefined();
  });
});
