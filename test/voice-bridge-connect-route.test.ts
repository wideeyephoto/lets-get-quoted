import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const admin = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth', () => ({ createAdminClient: admin }));
import { POST } from '@/app/api/voice/bridge-connect/route';
const origin = 'https://app.letsgetquoted.com';
function request(digits = '1', to = '+18105550100', signed = true) {
  const url = origin + '/api/voice/bridge-connect?leadId=lead-123&expires=' + (Math.floor(Date.now()/1000)+300);
  const body = new URLSearchParams({ Digits: digits, To: to, CallSid: 'CA123' });
  const sorted = [...body].sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => k+v).join('');
  return new Request(url, { method: 'POST', body, headers: signed ? { 'x-twilio-signature': createHmac('sha1','secret').update(url+sorted).digest('base64') } : {} });
}
beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_APP_URL',origin); vi.stubEnv('NEXT_PUBLIC_ROOT_DOMAIN','letsgetquoted.com');
  vi.stubEnv('TWILIO_AUTH_TOKEN','secret'); vi.stubEnv('SIGNALWIRE_WEBHOOK_ORIGIN',origin);
  admin.mockReset().mockReturnValue({ from: (table: string) => {
    const chain: any = { select: () => chain, eq: () => chain, maybeSingle: async () => ({ error: null, data:
      table === 'leads' ? { phone: '+18105550199', account_id: 'acc' } : table === 'accounts' ? { phone: '+18105550100' } : { e164_number: '+18105559999' } }) };
    return chain;
  } });
});
afterEach(() => vi.unstubAllEnvs());
it('rejects unsigned requests before reading homeowner information', async () => {
  expect((await POST(request('1',undefined,false))).status).toBe(403); expect(admin).not.toHaveBeenCalled();
});
it('cancels a signed request when contractor does not press 1', async () => {
  const response = await POST(request('2')); expect(response.status).toBe(200); expect(await response.text()).toContain('Connection cancelled');
});
it('connects only a signed callback to a phone belonging to the lead account', async () => {
  const response = await POST(request()); expect(response.status).toBe(200); expect(await response.text()).toContain('<Number>+18105550199</Number>');
});
it('rejects a signed callback to a different contractor phone', async () => {
  const response = await POST(request('1','+18105550999')); expect(response.status).toBe(403); expect(await response.text()).not.toContain('+18105550199');
});
