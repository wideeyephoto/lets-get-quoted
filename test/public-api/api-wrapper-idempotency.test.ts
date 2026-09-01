import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { publicApiRoute } from '@/lib/public-api/api-wrapper';

describe('Public API Wrapper - Auth & Idempotency', () => {
  it('returns 401 when Authorization Bearer header is missing', async () => {
    const handler = publicApiRoute(async () => {
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });

    const req = new NextRequest('https://api.letsgetquoted.com/v1/leads', {
      method: 'GET',
    });

    const res = await handler(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe('invalid_api_key');
    expect(body.error.message).toContain('Authorization');
  });

  it('returns 401 when token format is invalid', async () => {
    const handler = publicApiRoute(async () => {
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });

    const req = new NextRequest('https://api.letsgetquoted.com/v1/leads', {
      method: 'GET',
      headers: {
        authorization: 'Bearer bad_token_123',
      },
    });

    const res = await handler(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe('invalid_api_key');
  });
});
