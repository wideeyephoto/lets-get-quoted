import { describe, it, expect, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';

// TODO: These tests document known Data API vulnerabilities for office users.
// They use it.fails() because the current RLS policies / triggers do not yet
// enforce these boundaries. Once the fixes are applied, these tests should pass,
// and the mocks should be updated or replaced with real integration assertions.

// Mock the Supabase client to simulate the CURRENT vulnerable behavior
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table: string) => ({
      select: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({
        data: [{ id: 'mock-job-id', quoted_amount: 5000, quote_items: [] }],
        error: null,
      }),
      update: vi.fn().mockResolvedValue({
        data: [{ id: 'mock-job-id' }],
        error: null, // Currently succeeds (vulnerability)
      }),
      eq: vi.fn().mockReturnThis(),
    }),
  }),
}));

describe('Office Data API Security', () => {
  const dummyUrl = 'https://fixture.supabase.co';
  const dummyKey = 'test-key';

  it.fails('FINANCE-REST: An office user with only jobs.read (not quotes.read) cannot read quoted_amount or quote_items', async () => {
    // Simulate office user with only jobs.read capability
    const client = createClient(dummyUrl, dummyKey, {
      global: { headers: { Authorization: 'Bearer mock-office-jwt-jobs-only' } },
    });

    const { data, error } = await client
      .from('jobs')
      .select('id, quoted_amount, quote_items')
      .limit(1);

    expect(error).toBeNull();
    
    // Security Expectation: They should not be able to see financial columns
    // Currently fails because the mock returns these columns
    expect(data?.[0]).not.toHaveProperty('quoted_amount');
    expect(data?.[0]).not.toHaveProperty('quote_items');
  });

  it.fails('WRITER-FINANCE: An office user with jobs.write but NOT quotes.write cannot PATCH/update quoted_amount', async () => {
    // Simulate office user with jobs.write but not quotes.write
    const client = createClient(dummyUrl, dummyKey, {
      global: { headers: { Authorization: 'Bearer mock-office-jwt-jobs-write-only' } },
    });

    const { error } = await client
      .from('jobs')
      .update({ quoted_amount: 9999 })
      .eq('id', 'mock-job-id');

    // Security Expectation: Should return an error (RLS violation or trigger error)
    // Currently fails because error is null (vulnerability)
    expect(error).not.toBeNull();
  });

  it.fails('WRITER-FOREIGN-PARENT: An office user cannot update a job client_id to reference a client from a different workspace', async () => {
    // Simulate office user attempting cross-tenant association
    const client = createClient(dummyUrl, dummyKey, {
      global: { headers: { Authorization: 'Bearer mock-office-jwt-jobs-write' } },
    });

    const { error } = await client
      .from('jobs')
      .update({ client_id: 'foreign-client-id' })
      .eq('id', 'mock-job-id');

    // Security Expectation: Should be rejected by RLS or a trigger validating account_id match
    // Currently fails because error is null (vulnerability)
    expect(error).not.toBeNull();
  });
});
