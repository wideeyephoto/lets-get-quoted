import { afterEach, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';

vi.mock('@/lib/auth', () => ({ createAdminClient: () => ({}) }));
vi.mock('@/lib/email-send-policy', () => ({ assertEmailSendAllowed: vi.fn() }));
vi.mock('@/lib/email-brand', async importOriginal => ({ ...await importOriginal<typeof import('@/lib/email-brand')>(), loadEmailBrand: async () => { throw new Error('Use default brand'); } }));
import { assertEmailSendAllowed } from '@/lib/email-send-policy';
import { sendSendingDomainFailedEmail, sendCustomDomainConnectedEmail, type DomainFailureEmailSnapshot } from '@/lib/email';

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.clearAllMocks(); });

it('sends the stable header through the installed SDK without leaking it to another message', async () => {
  vi.stubEnv('RESEND_API_KEY', 'synthetic-offline-key');
  const fetch = vi.fn(async () => new Response(JSON.stringify({ id: 'provider-1' }), { status: 200 }));
  vi.stubGlobal('fetch', fetch);
  const prepareIntent = vi.fn(async (_snapshot: DomainFailureEmailSnapshot) => { expect(fetch).not.toHaveBeenCalled(); });
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
  await sendCustomDomainConnectedEmail({ ...input, siteUrl: 'https://builder.test' });
  const otherOptions = (fetch.mock.calls[1] as unknown as [string, RequestInit])[1];
  expect(new Headers(otherOptions.headers).get('Idempotency-Key')).toBeNull();
  vi.mocked(assertEmailSendAllowed).mockRejectedValueOnce(new Error('blocked'));
  await expect(sendSendingDomainFailedEmail(input)).rejects.toThrow('blocked');
  expect(fetch).toHaveBeenCalledTimes(2);
});

it('never submits when saving the snapshot fails or a delivery block appears during saving', async () => {
  vi.stubEnv('RESEND_API_KEY', 'synthetic-offline-key');
  const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
  vi.mocked(assertEmailSendAllowed).mockResolvedValue(undefined);
  const input = { noticeId: '11111111-1111-4111-8111-111111111111', accountId: 'workspace-a', recipientEmail: 'owner@example.test', businessName: 'Builder', domain: 'builder.test', settingsUrl: 'https://example.test/settings' };
  await expect(sendSendingDomainFailedEmail({ ...input, prepareIntent: async () => { throw new Error('save failed'); } })).rejects.toThrow('save failed');
  await expect(sendSendingDomainFailedEmail({ ...input, prepareIntent: async () => {
    vi.mocked(assertEmailSendAllowed).mockRejectedValueOnce(new Error('new delivery block'));
  } })).rejects.toThrow('new delivery block');
  await expect(sendSendingDomainFailedEmail(input as never)).rejects.toThrow('preparation is required');
  expect(fetch).not.toHaveBeenCalled();
});
