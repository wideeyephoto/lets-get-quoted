import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase-server', () => ({
  createSupabaseServerClient: vi.fn(),
}));

vi.mock('@/lib/permit-intel', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/permit-intel')>();
  return {
    ...actual,
    processInboundPermitWebhook: vi.fn().mockImplementation(async (_s, provider, payload, secret) => {
      if (secret === 'bad-secret') {
        throw new Error('Unauthorized permit webhook secret.');
      }
      return {
        success: true,
        message: 'Webhook processed successfully.',
        jobId: payload.jobId,
      };
    }),
  };
});

import { createSupabaseServerClient } from '@/lib/supabase-server';
import { POST } from '../src/app/api/webhooks/permits/[provider]/route';

describe('Permit Inbound Webhook API Route - POST /api/webhooks/permits/:provider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects unauthorized webhook when secret header fails verification', async () => {
    vi.mocked(createSupabaseServerClient).mockReturnValue({} as any);

    const res = await POST(
      new Request('http://localhost/api/webhooks/permits/bsa', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-permit-webhook-secret': 'bad-secret',
        },
        body: JSON.stringify({ jobId: 'job-1', status: 'issued' }),
      }),
      { params: { provider: 'bsa' } },
    );

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toContain('Unauthorized');
  });

  it('successfully processes valid municipal webhook notification', async () => {
    vi.mocked(createSupabaseServerClient).mockReturnValue({} as any);

    const res = await POST(
      new Request('http://localhost/api/webhooks/permits/bsa', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ jobId: 'job-1', permitNumber: 'PB26-0899', status: 'issued' }),
      }),
      { params: { provider: 'bsa' } },
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.jobId).toBe('job-1');
  });
});
