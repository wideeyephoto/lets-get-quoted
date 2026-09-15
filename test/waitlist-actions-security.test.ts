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

    // Two defences now, in this order: the action still strips the dangerous
    // characters from the term, and ilikeAcross then quotes what is left so a
    // character that ever slipped through could not be read as grammar.
    const needle = '"%Johnstatus.eq.adminaddress.ilike.test%"';
    expect(capturedClientOrFilter).toBe(
      `name.ilike.${needle},phone.ilike.${needle},address.ilike.${needle}`,
    );

    // The property that matters: exactly the three conditions the caller wrote,
    // and none the search term smuggled in. Counting occurrences of "ilike"
    // would not show that — the stripped term still CONTAINS that word, which
    // is the whole reason the value has to be quoted rather than trusted.
    // Quoted segments are the odd-indexed pieces of a split on the delimiter,
    // so three of them means three conditions.
    const insideQuotes = capturedClientOrFilter.split('"').filter((_, i) => i % 2 === 1);
    expect(insideQuotes).toHaveLength(3);

    // Outside the quoted values, the only structure is `column.ilike.` joined
    // by commas: three columns, two separators, nothing else.
    const structure = capturedClientOrFilter.split('"').filter((_, i) => i % 2 === 0).join('');
    expect(structure).toBe('name.ilike.,phone.ilike.,address.ilike.');
    for (const value of insideQuotes) {
      expect(value).not.toContain('(');
      expect(value).not.toContain(')');
      expect(value).not.toContain(',');
      expect(value).not.toContain("'");
    }
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
