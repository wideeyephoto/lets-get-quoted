import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/founder/feature-request/route';
import { sendFounderFeatureRequestAlert } from '@/lib/founder-alerts';

vi.mock('resend', () => {
  return {
    Resend: class {
      emails = {
        send: vi.fn().mockResolvedValue({ data: { id: 'test-email-id' }, error: null }),
      };
    },
  };
});

describe('POST /api/founder/feature-request', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.RESEND_API_KEY = 're_test_key_123';
    process.env.FOUNDER_ALERT_EMAIL = 'hello@letsgetquoted.com';
  });

  it('rejects empty or whitespace-only feature requests', async () => {
    const req = new NextRequest('http://localhost:3000/api/founder/feature-request', {
      method: 'POST',
      body: JSON.stringify({ feature: '   ' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(data.error).toContain('Please enter a feature description');
  });

  it('accepts valid feature request and returns 200 ok', async () => {
    const req = new NextRequest('http://localhost:3000/api/founder/feature-request', {
      method: 'POST',
      body: JSON.stringify({ feature: 'Automated invoice factoring for completed jobs' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.message).toContain('sent directly to Brett');
  });

  it('handles sendFounderFeatureRequestAlert directly', async () => {
    const result = await sendFounderFeatureRequestAlert({
      feature: 'RoomPlan 3D scan export to QuickBooks',
      contact: 'test@contractor.com',
    });
    expect(result.dispatched).toBe(true);
  });

  it('gracefully handles missing RESEND_API_KEY without throwing', async () => {
    delete process.env.RESEND_API_KEY;
    const result = await sendFounderFeatureRequestAlert({
      feature: 'Offline quote drafts',
    });
    expect(result.dispatched).toBe(false);
  });
});
