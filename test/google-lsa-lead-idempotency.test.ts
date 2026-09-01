import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { createLead } from '@/lib/leads';

const ACCOUNT = '11111111-1111-4111-8111-111111111111';
const RESOURCE = 'customers/1234567890/localServicesLeads/987654321';

function replayClient(existing: Record<string, unknown>) {
  const write = { upsert: vi.fn(), select: vi.fn(), maybeSingle: vi.fn() };
  write.upsert.mockReturnValue(write);
  write.select.mockReturnValue(write);
  write.maybeSingle.mockResolvedValue({ data: null, error: null });
  const read = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() };
  read.select.mockReturnValue(read);
  read.eq.mockReturnValue(read);
  read.maybeSingle.mockResolvedValue({ data: existing, error: null });
  return {
    supabase: { from: vi.fn().mockReturnValueOnce(write).mockReturnValueOnce(read) } as unknown as SupabaseClient,
    write,
    read,
  };
}

describe('Google Local Services CRM projection identity', () => {
  it('returns the progressed CRM lead without overwriting it on an overlapping poll', async () => {
    const progressed = {
      id: 'lead-existing', account_id: ACCOUNT, source: 'google_lsa', status: 'won',
      source_google_lsa_resource: RESOURCE, name: 'Name corrected by staff',
      phone: '+15551234567', email: null, address: null, project_type: 'Roof repair',
      estimated_hours: null, quote_visit: null, message: 'Staff notes survive.', photo_paths: [],
      source_page: 'google-local-services-ads', converted_job: 'job-1', client_id: null,
      triage: { score: 'hot', flags: [] }, lat: null, lng: null, geocoded_at: null,
      created_at: '2026-08-01T12:00:00.000Z', updated_at: '2026-08-20T12:00:00.000Z',
    };
    const { supabase, write, read } = replayClient(progressed);
    const result = await createLead(supabase, ACCOUNT, {
      source: 'google_lsa',
      name: 'Older Google name',
      phone: '+15550000000',
      message: 'A replay must not replace staff notes.',
      sourceGoogleLsaResource: RESOURCE,
      createdAt: '2026-08-01T12:00:00.000Z',
    });

    expect(result).toBe(progressed);
    expect(write.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'new', source_google_lsa_resource: RESOURCE }),
      { onConflict: 'account_id,source_google_lsa_resource', ignoreDuplicates: true },
    );
    expect(read.eq.mock.calls).toEqual([
      ['source_google_lsa_resource', RESOURCE],
      ['account_id', ACCOUNT],
    ]);
    expect(progressed.status).toBe('won');
    expect(progressed.message).toBe('Staff notes survive.');
  });
});
