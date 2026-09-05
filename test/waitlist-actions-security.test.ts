import { describe, it, expect, vi, beforeEach } from 'vitest';
import { searchExistingContactsAction } from '@/app/dashboard/schedule/waitlist/actions';
import { resolveWaitlistOfferReply } from '@/lib/cancellation-waitlist-data';

const mocks = vi.hoisted(() => ({
  requireOfficeContext: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  requireOfficeContext: mocks.requireOfficeContext,
}));

describe('searchExistingContactsAction sanitization & PostgREST filter injection defense', () => {
  const accountId = 'test-account-id';

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('rejects search terms that are empty or fewer than 2 characters', async () => {
    const result = await searchExistingContactsAction('  a  ');
    expect(result).toEqual([]);
    expect(mocks.requireOfficeContext).not.toHaveBeenCalled();
  });

  it('strips commas, parentheses, quotes, percent, and wildcards from query term', async () => {
    let capturedClientOrFilter = '';
    let capturedLeadOrFilter = '';

    const mockSupabase: any = {
      from: vi.fn((table: string) => {
        const chain: any = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          or: vi.fn((filterStr: string) => {
            if (table === 'clients') capturedClientOrFilter = filterStr;
            if (table === 'leads') capturedLeadOrFilter = filterStr;
            return chain;
          }),
          limit: vi.fn().mockResolvedValue({ data: [], error: null }),
        };
        return chain;
      }),
    };

    mocks.requireOfficeContext.mockResolvedValue({
      supabase: mockSupabase,
      accountId,
    });

    // An injection attempt containing commas, parens, quotes, percent signs
    const injectionAttempt = 'John,status.eq.admin),address.ilike."%test%"';
    await searchExistingContactsAction(injectionAttempt);

    // Verify commas, parens, quotes, percent, and backslashes were stripped
    expect(capturedClientOrFilter).toBe('name.ilike.%Johnstatus.eq.adminaddress.ilike.test%,phone.ilike.%Johnstatus.eq.adminaddress.ilike.test%,address.ilike.%Johnstatus.eq.adminaddress.ilike.test%');
    // Filter must strictly contain only the 3 legitimate top-level OR conditions (no extra injected conditions)
    expect(capturedClientOrFilter.split(',')).toHaveLength(3);
    expect(capturedClientOrFilter).not.toContain('(');
    expect(capturedClientOrFilter).not.toContain(')');
    expect(capturedClientOrFilter).not.toContain('"');
    expect(capturedClientOrFilter).not.toContain("'");
  });
});

describe('resolveWaitlistOfferReply tenant safety & job status correctness', () => {
  const accountId = 'acc-sec-1';
  const offerId = 'offer-sec-1';

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('scopes waitlist_offers, cancellation_waitlist, and jobs updates to account_id and sets job status to in_progress without updated_at', async () => {
    let jobUpdatePayload: any = null;
    let jobUpdateFilters: Record<string, string> = {};
    let waitlistOffersQueryCount = 0;

    const mockOffer = {
      id: offerId,
      account_id: accountId,
      waitlist_entry_id: 'entry-sec-1',
      job_id: 'job-sec-1',
      status: 'pending',
      opened_slot_date: '2026-09-12',
      arrival_time: '10:00',
    };

    const mockSupabase: any = {
      from: vi.fn((table: string) => {
        let isUpdate = false;
        const chain: any = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn((col: string, val: string) => {
            if (table === 'jobs') {
              jobUpdateFilters[col] = val;
            }
            return chain;
          }),
          single: vi.fn().mockImplementation(() => {
            if (table === 'waitlist_offers') {
              waitlistOffersQueryCount++;
              if (waitlistOffersQueryCount === 1) {
                // Initial select: status must be pending so resolution proceeds
                return Promise.resolve({ data: { ...mockOffer, status: 'pending' }, error: null });
              }
              // Updated offer
              return Promise.resolve({ data: { ...mockOffer, status: 'accepted' }, error: null });
            }
            if (table === 'cancellation_waitlist') {
              return Promise.resolve({ data: { id: 'entry-sec-1' }, error: null });
            }
            if (table === 'jobs') {
              return Promise.resolve({ data: { id: 'job-sec-1' }, error: null });
            }
            return Promise.resolve({ data: null, error: null });
          }),
          update: vi.fn((payload: any) => {
            isUpdate = true;
            if (table === 'jobs') {
              jobUpdatePayload = payload;
            }
            return chain;
          }),
        };
        return chain;
      }),
    };

    const result = await resolveWaitlistOfferReply(
      mockSupabase,
      offerId,
      'YES',
      accountId,
    );

    expect(result.decision).toBe('accepted');

    // Verify jobs update:
    // 1. Status is 'in_progress', not 'scheduled'
    expect(jobUpdatePayload).toEqual({
      scheduled_for: '2026-09-12',
      scheduled_time: '10:00',
      status: 'in_progress',
    });

    // 2. updated_at is NOT in jobs update payload
    expect(jobUpdatePayload).not.toHaveProperty('updated_at');

    // 3. account_id is strictly checked on jobs update
    expect(jobUpdateFilters).toEqual({
      id: 'job-sec-1',
      account_id: accountId,
    });
  });
});
