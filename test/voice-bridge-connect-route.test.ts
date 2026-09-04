import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCreateAdminClient = vi.fn();
vi.mock('@/lib/auth', () => ({
  createAdminClient: () => mockCreateAdminClient(),
}));

import { POST } from '@/app/api/voice/bridge-connect/route';

describe('/api/voice/bridge-connect route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('cancels if Digits is not 1', async () => {
    const formData = new FormData();
    formData.append('Digits', '2');
    const req = new Request('https://lgq.test/api/voice/bridge-connect?leadId=lead-123', {
      method: 'POST',
      body: formData,
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('Connection cancelled');
    expect(text).toContain('<Hangup/>');
  });

  it('dials the homeowner when Digits is 1 and lead exists', async () => {
    const mockAdmin = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'leads') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { phone: '(810) 555-0199', account_id: 'acc-123', name: 'Bob' },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === 'signalwire_phone_numbers') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { e164_number: '+18105559999' },
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }
        return {};
      }),
    };
    mockCreateAdminClient.mockReturnValue(mockAdmin);

    const formData = new FormData();
    formData.append('Digits', '1');
    const req = new Request('https://lgq.test/api/voice/bridge-connect?leadId=lead-123', {
      method: 'POST',
      body: formData,
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('Connecting you now to the homeowner');
    expect(text).toContain('<Dial');
    expect(text).toContain('+18105550199');
    expect(text).toContain('callerId="+18105559999"');
  });
});
