import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth', () => ({
  createAdminClient: vi.fn(),
}));

vi.mock('@/lib/voice/auth', () => ({
  voiceReceiptAuthorization: vi.fn().mockReturnValue({
    username: 'test-user',
    password: 'test-password',
  }),
}));

import { createAdminClient } from '@/lib/auth';
import { POST } from '../src/app/api/voice/swaig/route';

describe('Voice SWAIG Permitting Tools - POST /api/voice/swaig', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const authHeader = 'Basic ' + Buffer.from('test-user:test-password').toString('base64');

  it('handles check_permit_requirement with city and trade', async () => {
    const req = new Request('http://localhost/api/voice/swaig?account_id=acc-1', {
      method: 'POST',
      headers: {
        authorization: authHeader,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        function: 'check_permit_requirement',
        argument: {
          parsed: [
            {
              city_or_address: 'Royal Oak',
              trade: 'roofing',
              project_description: 'Full roof tear off and replacement',
            },
          ],
        },
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.response).toContain('City of Royal Oak');
    expect(json.response).toContain('building and trade permit is required');
    expect(json.response).toContain('Building Inspection');
  });

  it('handles check_inspection_status finding matching job and permit case', async () => {
    const mockMaybeSingleJob = vi.fn().mockResolvedValue({
      data: {
        id: 'job-1',
        ref: 'JOB-101',
        client_name: 'John Doe',
        property_street: '211 S Williams St',
        property_city: 'Royal Oak',
      },
      error: null,
    });

    const mockMaybeSinglePermitCase = vi.fn().mockResolvedValue({
      data: {
        application_status: 'issued',
        external_permit_number: 'PB-2026-101',
      },
      error: null,
    });

    const mockOrderInspections = vi.fn().mockResolvedValue({
      data: [
        {
          type: 'Rough Roofing Inspection',
          status: 'scheduled',
          scheduled_date: '2026-08-28',
        },
      ],
      error: null,
    });

    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'jobs') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                or: vi.fn().mockReturnValue({
                  order: vi.fn().mockReturnValue({
                    limit: vi.fn().mockReturnValue({
                      maybeSingle: mockMaybeSingleJob,
                    }),
                  }),
                }),
              }),
            }),
          };
        }
        if (table === 'job_permit_cases') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: mockMaybeSinglePermitCase,
                }),
              }),
            }),
          };
        }
        if (table === 'job_permit_inspections') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  order: mockOrderInspections,
                }),
              }),
            }),
          };
        }
        return {};
      }),
    } as any);

    const req = new Request('http://localhost/api/voice/swaig?account_id=acc-1', {
      method: 'POST',
      headers: {
        authorization: authHeader,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        function: 'check_inspection_status',
        argument: {
          customer_name_or_address: '211 S Williams St',
        },
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.response).toContain('211 S Williams St');
    expect(json.response).toContain('approved and issued');
    expect(json.response).toContain('PB-2026-101');
    expect(json.response).toContain('Rough Roofing Inspection is scheduled for 2026-08-28');
  });
});
