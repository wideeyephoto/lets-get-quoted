import { describe, it, expect, vi, beforeEach } from 'vitest';

const processMobileApprovalCallback = vi.fn();

vi.mock('@/lib/auth', () => ({ createAdminClient: vi.fn(() => ({})) }));
vi.mock('@/lib/ai-operator/approval-bridge', () => ({
  processMobileApprovalCallback: (...args: unknown[]) => processMobileApprovalCallback(...args),
}));

import { GET } from '@/app/api/webhooks/operator-approval/route';

const XSS = '<script>alert(document.domain)</script>';

function callbackUrl(params: Record<string, string>): string {
  const qs = new URLSearchParams(params).toString();
  return `https://app.letsgetquoted.com/api/webhooks/operator-approval?${qs}`;
}

describe('operator approval callback: HTML escaping', () => {
  beforeEach(() => {
    processMobileApprovalCallback.mockReset();
  });

  // This endpoint answers text/html, and the middleware matcher skips /api, so
  // no CSP is set on the response. Escaping is the whole defence.
  it('escapes actionId on the rejected-signature path', async () => {
    processMobileApprovalCallback.mockResolvedValue({
      success: false,
      error: 'Invalid cryptographic signature or token has expired.',
    });

    const res = await GET(new Request(callbackUrl({
      actionId: XSS,
      decision: 'approved',
      expires: '99999999999',
      token: 'bogus',
    })));
    const body = await res.text();

    expect(res.headers.get('content-type')).toContain('text/html');
    expect(body).not.toContain(XSS);
    expect(body).not.toContain('<script>alert');
    expect(body).toContain('&lt;script&gt;');
  });

  // Reachable with no token at all — the cheapest version of the same link.
  it('escapes actionId on the missing-parameter path', async () => {
    const res = await GET(new Request(callbackUrl({
      actionId: XSS,
      decision: 'approved',
    })));
    const body = await res.text();

    expect(res.status).toBe(400);
    expect(body).not.toContain(XSS);
    expect(body).toContain('&lt;script&gt;');
    expect(processMobileApprovalCallback).not.toHaveBeenCalled();
  });

  it('escapes an error message echoed back from the approval bridge', async () => {
    processMobileApprovalCallback.mockResolvedValue({
      success: false,
      error: `Execution failed for ${XSS}`,
    });

    const res = await GET(new Request(callbackUrl({
      actionId: 'act_1',
      decision: 'rejected',
      expires: '99999999999',
      token: 'bogus',
    })));
    const body = await res.text();

    expect(body).not.toContain(XSS);
    expect(body).toContain('&lt;script&gt;');
  });

  it('does not break out of the attribute-free text nodes with quotes', async () => {
    processMobileApprovalCallback.mockResolvedValue({ success: false, error: 'nope' });

    const res = await GET(new Request(callbackUrl({
      actionId: `"><img src=x onerror=alert(1)>`,
      decision: 'approved',
      expires: '99999999999',
      token: 'bogus',
    })));
    const body = await res.text();

    expect(body).not.toContain('<img src=x');
    expect(body).toContain('&lt;img');
  });

  it('still renders the real action id readably on the success path', async () => {
    processMobileApprovalCallback.mockResolvedValue({ success: true });

    const res = await GET(new Request(callbackUrl({
      actionId: 'act_7f3a',
      decision: 'approved',
      expires: '99999999999',
      token: 'good',
    })));
    const body = await res.text();

    expect(res.status).toBe(200);
    expect(body).toContain('act_7f3a');
    expect(body).toContain('Action Approved');
  });
});
