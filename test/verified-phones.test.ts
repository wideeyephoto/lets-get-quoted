import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { loadVerifiedPhoneOptions } from '@/lib/verified-phones';

const ACCOUNT_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

function createMockSupabase(responses: {
  account?: { phone?: string | null; alert_phone?: string | null; call_forward_number?: string | null } | null;
  crew?: Array<{ name?: string | null; phone?: string | null }>;
  consent?: Array<{ phone_number?: string | null; status?: string | null }>;
}) {
  const from = vi.fn((table: string) => {
    if (table === 'accounts') {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: responses.account ?? null, error: null }),
      };
    }
    if (table === 'crew') {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        is: vi.fn().mockResolvedValue({ data: responses.crew ?? [], error: null }),
      };
    }
    if (table === 'sms_consent') {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockImplementation((col, val) => {
          return {
            eq: vi.fn().mockResolvedValue({ data: responses.consent ?? [], error: null }),
          };
        }),
      };
    }
    throw new Error(`Unexpected table: ${table}`);
  });

  return { from } as unknown as SupabaseClient;
}

describe('loadVerifiedPhoneOptions', () => {
  it('aggregates owner alert, business phone, and forwarding numbers with priority labels', async () => {
    const mockClient = createMockSupabase({
      account: {
        alert_phone: '8103042061',
        phone: '2485550100',
        call_forward_number: '2485550199',
      },
      crew: [],
      consent: [],
    });

    const result = await loadVerifiedPhoneOptions(mockClient, ACCOUNT_ID);
    expect(result).toHaveLength(3);

    expect(result[0]).toEqual({
      number: '+18103042061',
      label: '(810) 304-2061 — Owner Mobile (Verified)',
      source: 'owner_alert',
    });
    expect(result[1]).toEqual({
      number: '+12485550100',
      label: '(248) 555-0100 — Main Business Line',
      source: 'business_phone',
    });
    expect(result[2]).toEqual({
      number: '+12485550199',
      label: '(248) 555-0199 — Call Forwarding Line',
      source: 'call_forward',
    });
  });

  it('deduplicates when owner alert phone matches business phone', async () => {
    const mockClient = createMockSupabase({
      account: {
        alert_phone: '+18103042061',
        phone: '(810) 304-2061',
        call_forward_number: null,
      },
      crew: [],
      consent: [],
    });

    const result = await loadVerifiedPhoneOptions(mockClient, ACCOUNT_ID);
    expect(result).toHaveLength(1);
    expect(result[0].number).toBe('+18103042061');
    expect(result[0].source).toBe('owner_alert');
  });

  it('includes active crew members and consented phones', async () => {
    const mockClient = createMockSupabase({
      account: {
        alert_phone: '+18103042061',
      },
      crew: [
        { name: 'Mike D.', phone: '3135550111' },
      ],
      consent: [
        { phone_number: '+18103042061', status: 'opted_in' }, // Already exists as owner alert
        { phone_number: '+15865550122', status: 'opted_in' }, // New verified
      ],
    });

    const result = await loadVerifiedPhoneOptions(mockClient, ACCOUNT_ID);
    expect(result).toHaveLength(3);

    expect(result.find((p) => p.number === '+18103042061')?.source).toBe('owner_alert');
    expect(result.find((p) => p.number === '+13135550111')?.label).toBe('(313) 555-0111 — Mike D. (Crew)');
    expect(result.find((p) => p.number === '+15865550122')?.label).toBe('(586) 555-0122 — Verified Phone');
  });

  it('preserves existing configured transfer and alert numbers if not in database records', async () => {
    const mockClient = createMockSupabase({
      account: null,
      crew: [],
      consent: [],
    });

    const result = await loadVerifiedPhoneOptions(
      mockClient,
      ACCOUNT_ID,
      '248-555-9999',
      '313-555-8888',
    );

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      number: '+12485559999',
      label: '(248) 555-9999 — Current Transfer Line',
      source: 'current_configured',
    });
    expect(result[1]).toEqual({
      number: '+13135558888',
      label: '(313) 555-8888 — Current Alert Mobile',
      source: 'current_configured',
    });
  });
});
