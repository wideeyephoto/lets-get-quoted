import { afterEach, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';

vi.mock('@/lib/auth', () => ({ createAdminClient: () => ({}) }));
vi.mock('@/lib/email-send-policy', () => ({ assertEmailSendAllowed: vi.fn() }));
vi.mock('@/lib/email-brand', async importOriginal => ({ ...await importOriginal<typeof import('@/lib/email-brand')>(), loadEmailBrand: async () => { throw new Error('Use default brand'); } }));
import { assertEmailSendAllowed } from '@/lib/email-send-policy';
import { sendSendingDomainFailedEmail, sendCustomDomainConnectedEmail, sendSendingDomainRestoredEmail, sendOwnerEventNoticeEmail, type DurableOwnerEmailSnapshot } from '@/lib/email';

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.clearAllMocks(); });

it('keeps each owner notice key and snapshot independent through the installed SDK', async () => {
  vi.stubEnv('RESEND_API_KEY', 'synthetic-offline-key');
  const fetch = vi.fn(async () => new Response(JSON.stringify({ id: 'provider-1' }), { status: 200 }));
  vi.stubGlobal('fetch', fetch);
  const prepareIntent = vi.fn(async (_snapshot: DurableOwnerEmailSnapshot) => { expect(fetch).not.toHaveBeenCalled(); });
  const input = { prepareIntent, noticeId: '11111111-1111-4111-8111-111111111111', accountId: 'workspace-a', recipientEmail: 'owner@example.test', businessName: 'Builder', domain: 'builder.test', settingsUrl: 'https://example.test/settings' };
  await expect(sendSendingDomainFailedEmail(input)).resolves.toBe('provider-1');
  const [url, options] = fetch.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toMatch(/\/emails$/);
  expect(options.method).toBe('POST');
  const headers = new Headers(options.headers);
  expect(headers.get('Idempotency-Key')).toBe(`domain-failure:v1:${input.noticeId}`);
  expect(headers.get('Authorization')).toBe('Bearer synthetic-offline-key');
  expect(JSON.parse(options.body as string).tags).toContainEqual({ name: 'account_id', value: 'workspace-a' });
  expect(prepareIntent.mock.calls[0][0]).toEqual({
    payload: JSON.parse(options.body as string), idempotencyKey: headers.get('Idempotency-Key'),
    providerFingerprint: createHash('sha256').update('synthetic-offline-key').digest('hex'),
  });
  expect(assertEmailSendAllowed).toHaveBeenCalledTimes(2);
  const websiteSnapshot = vi.fn(async (_snapshot: DurableOwnerEmailSnapshot) => { expect(fetch).toHaveBeenCalledTimes(1); });
  await sendCustomDomainConnectedEmail({ ...input, prepareIntent: websiteSnapshot, siteUrl: 'https://builder.test' });
  const otherOptions = (fetch.mock.calls[1] as unknown as [string, RequestInit])[1];
  expect(new Headers(otherOptions.headers).get('Idempotency-Key')).toBe(`website-domain-connected:v1:${input.noticeId}`);
  expect(websiteSnapshot.mock.calls[0][0].payload).toEqual(JSON.parse(otherOptions.body as string));
  expect(websiteSnapshot.mock.calls[0][0].providerFingerprint).toBe(prepareIntent.mock.calls[0][0].providerFingerprint);
  const restoredSnapshot = vi.fn(async (_snapshot: DurableOwnerEmailSnapshot) => { expect(fetch).toHaveBeenCalledTimes(2); });
  await sendSendingDomainRestoredEmail({ ...input, prepareIntent: restoredSnapshot });
  const restoredOptions = (fetch.mock.calls[2] as unknown as [string, RequestInit])[1];
  expect(new Headers(restoredOptions.headers).get('Idempotency-Key')).toBe('domain-restored:v1:' + input.noticeId);
  expect(restoredSnapshot.mock.calls[0][0].payload).toEqual(JSON.parse(restoredOptions.body as string));
  expect(restoredSnapshot.mock.calls[0][0].payload.tags).toContainEqual({ name: 'kind', value: 'sending_domain_restored' });
  expect(JSON.parse(restoredOptions.body as string).html).toContain('does not resend earlier messages');
  vi.mocked(assertEmailSendAllowed).mockRejectedValueOnce(new Error('blocked'));
  await expect(sendSendingDomainFailedEmail(input)).rejects.toThrow('blocked');
  expect(fetch).toHaveBeenCalledTimes(3);
});

it.each([sendSendingDomainFailedEmail, sendCustomDomainConnectedEmail, sendSendingDomainRestoredEmail])('never submits when saving the snapshot fails or a delivery block appears during saving (%s)', async sendNotice => {
  vi.stubEnv('RESEND_API_KEY', 'synthetic-offline-key');
  const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
  vi.mocked(assertEmailSendAllowed).mockResolvedValue(undefined);
  const input = { noticeId: '11111111-1111-4111-8111-111111111111', accountId: 'workspace-a', recipientEmail: 'owner@example.test', businessName: 'Builder', domain: 'builder.test', settingsUrl: 'https://example.test/settings', siteUrl: 'https://builder.test' };
  await expect(sendNotice({ ...input, prepareIntent: async () => { throw new Error('save failed'); } })).rejects.toThrow('save failed');
  await expect(sendNotice({ ...input, prepareIntent: async () => {
    vi.mocked(assertEmailSendAllowed).mockRejectedValueOnce(new Error('new delivery block'));
  } })).rejects.toThrow('new delivery block');
  await expect(sendNotice(input as never)).rejects.toThrow('preparation is required');
  expect(fetch).not.toHaveBeenCalled();
});

it('saves an owner event message before the exact keyed HTTP request and refuses failed preparation', async () => {
  vi.stubEnv('RESEND_API_KEY', 'synthetic-offline-key');
  const fetch = vi.fn(async () => new Response(JSON.stringify({ id: 'owner-provider' }), { status: 200 }));
  vi.stubGlobal('fetch', fetch);
  const prepareIntent = vi.fn(async (_snapshot: DurableOwnerEmailSnapshot) => { expect(fetch).not.toHaveBeenCalled(); });
  const input = { accountId:'account-a', noticeId:'11111111-1111-4111-8111-111111111111', recipientEmail:'owner@example.test', businessName:'Builder', subject:'Question', heading:'Question', bodyLines:['Original question'], ctaLabel:'Open job', ctaUrl:'https://example.test/dashboard/jobs/job-1', prepareIntent };
  expect(await sendOwnerEventNoticeEmail(input)).toBe('owner-provider');
  const options = (fetch.mock.calls[0] as unknown as [string,RequestInit])[1];
  expect(new Headers(options.headers).get('Idempotency-Key')).toBe('owner-event:v1:'+input.noticeId);
  expect(prepareIntent.mock.calls[0][0].payload).toEqual(JSON.parse(options.body as string));
  expect(prepareIntent.mock.calls[0][0].payload.tags).toContainEqual({name:'owner_event_notice_id',value:input.noticeId});
  expect(assertEmailSendAllowed).toHaveBeenCalledTimes(2);
  await expect(sendOwnerEventNoticeEmail({...input,prepareIntent:async()=>{throw new Error('save failed');}})).rejects.toThrow('save failed');
  expect(fetch).toHaveBeenCalledTimes(1);
});
