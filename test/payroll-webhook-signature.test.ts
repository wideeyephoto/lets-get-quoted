import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import { verifyPayrollWebhookSignature } from '@/lib/payroll-api-integration';
import { POST } from '@/app/api/payroll/webhook/route';

const SECRET = 'payroll-callback-secret';
const BODY = JSON.stringify({ event_type: 'payroll.paid', payroll_id: 'pr_1', total_net: 4200 });

const sign = (body: string, encoding: 'hex' | 'base64' = 'hex') =>
  createHmac('sha256', SECRET).update(body, 'utf8').digest(encoding);

function post(opts: { body?: string; signature?: string | null; header?: string; provider?: string }) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (opts.signature) headers[opts.header ?? 'x-gusto-signature'] = opts.signature;
  return new Request(`https://app.letsgetquoted.com/api/payroll/webhook?provider=${opts.provider ?? 'gusto'}`, {
    method: 'POST',
    headers,
    body: opts.body ?? BODY,
  });
}

const saved = { ...process.env };
beforeEach(() => { process.env = { ...saved, PAYROLL_WEBHOOK_SECRET: SECRET }; vi.restoreAllMocks(); });
afterEach(() => { process.env = { ...saved }; });

describe('payroll webhook signature verification', () => {
  it('accepts a correctly signed callback', async () => {
    const res = await POST(post({ signature: sign(BODY) }));
    expect(res.status).toBe(200);
  });

  it('accepts a base64 signature and a sha256= prefix', async () => {
    expect((await POST(post({ signature: sign(BODY, 'base64') }))).status).toBe(200);
    expect((await POST(post({ signature: `sha256=${sign(BODY)}` }))).status).toBe(200);
  });

  it('rejects an unsigned callback', async () => {
    const res = await POST(post({ signature: null }));
    expect(res.status).toBe(401);
  });

  it('rejects a signature computed over different bytes', async () => {
    // The signature must cover what was actually sent, not a re-serialization.
    const res = await POST(post({ body: JSON.stringify({ event_type: 'payroll.paid', payroll_id: 'pr_2' }), signature: sign(BODY) }));
    expect(res.status).toBe(401);
  });

  it('rejects a signature made with the wrong secret', async () => {
    const forged = createHmac('sha256', 'not-the-secret').update(BODY, 'utf8').digest('hex');
    expect((await POST(post({ signature: forged }))).status).toBe(401);
  });

  it('does not accept a valid signature presented in another provider\'s header', async () => {
    // provider picks how the body is read, never whether it is trusted.
    const res = await POST(post({ provider: 'gusto', header: 'x-adp-signature', signature: sign(BODY) }));
    expect(res.status).toBe(401);
  });

  it('fails closed in production when the secret is unconfigured', async () => {
    delete process.env.PAYROLL_WEBHOOK_SECRET;
    process.env.VERCEL_ENV = 'production';
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await POST(post({ signature: null }));
    expect(res.status).toBe(500);
  });

  it('verifier rejects when no secret is configured at all', () => {
    delete process.env.PAYROLL_WEBHOOK_SECRET;
    expect(verifyPayrollWebhookSignature({
      provider: 'gusto', headers: { 'x-gusto-signature': sign(BODY) }, rawBody: BODY,
    })).toBe(false);
  });
});
