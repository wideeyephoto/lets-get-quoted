import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';

import { createLead } from '@/lib/leads';

const ACCOUNT = '11111111-1111-4111-8111-111111111111';
const EVENT = '22222222-2222-4222-8222-222222222222';

const progressed = {
  id: 'lead-existing',
  account_id: ACCOUNT,
  source_voice_event_id: EVENT,
  source: 'ai_voice',
  status: 'qualified',
  name: 'Staff corrected name',
  phone: '+15551234567',
  email: null,
  address: null,
  project_type: null,
  estimated_hours: null,
  message: 'Staff added follow-up details.',
  photo_paths: [],
  source_page: '/call',
  converted_job: null,
  client_id: 'client-existing',
  triage: { score: 'hot', flags: [], contactPreference: 'phone' },
  created_at: '2026-08-21T12:00:00.000Z',
  updated_at: '2026-08-21T13:00:00.000Z',
};

function client(
  writeResult: { data: unknown; error: unknown } | Error,
  existing: unknown,
) {
  const write = {
    upsert: vi.fn(),
    select: vi.fn(),
    maybeSingle: vi.fn(),
  };
  write.upsert.mockReturnValue(write);
  write.select.mockReturnValue(write);
  if (writeResult instanceof Error) write.maybeSingle.mockRejectedValue(writeResult);
  else write.maybeSingle.mockResolvedValue(writeResult);

  const read = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({ data: existing, error: null }),
  };
  read.select.mockReturnValue(read);
  read.eq.mockReturnValue(read);

  const from = vi.fn()
    .mockReturnValueOnce(write)
    .mockReturnValueOnce(read);
  return {
    supabase: { from } as unknown as SupabaseClient,
    from,
    write,
    read,
  };
}

const input = {
  source: 'ai_voice' as const,
  name: 'AI call — +15551234567',
  phone: '+15551234567',
  message: 'A late replay must not replace staff edits.',
  sourcePage: '/call',
  sourceVoiceEventId: EVENT,
  triage: { score: 'warm' as const, flags: [], contactPreference: 'any' as const },
};

describe('AI Voice lead insert-or-return identity', () => {
  it('returns a progressed existing lead unchanged instead of upserting over it', async () => {
    const { supabase, write, read, from } = client({ data: null, error: null }, progressed);

    await expect(createLead(supabase, ACCOUNT, input)).resolves.toBe(progressed);
    expect(write.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'new',
        message: input.message,
        source_voice_event_id: EVENT,
      }),
      { onConflict: 'source_voice_event_id', ignoreDuplicates: true },
    );
    expect(read.eq.mock.calls).toEqual([
      ['source_voice_event_id', EVENT],
      ['account_id', ACCOUNT],
    ]);
    // Returning from conflict recovery skips client-link/geocoding mutations.
    expect(from).toHaveBeenCalledTimes(2);
    expect(progressed.status).toBe('qualified');
    expect(progressed.message).toBe('Staff added follow-up details.');
  });

  it('recovers the winner after an ambiguous lost insert response', async () => {
    const lost = new Error('connection closed after write');
    const { supabase } = client(lost, progressed);

    await expect(createLead(supabase, ACCOUNT, input)).resolves.toBe(progressed);
  });

  it('recovers the winner if PostgREST still reports a 23505 race', async () => {
    const duplicate = { code: '23505', message: 'duplicate key' };
    const { supabase } = client({ data: null, error: duplicate }, progressed);

    await expect(createLead(supabase, ACCOUNT, input)).resolves.toBe(progressed);
  });

  it('surfaces a transient insert failure when no lead exists yet', async () => {
    const transient = { code: '08006', message: 'connection failure' };
    const { supabase } = client({ data: null, error: transient }, null);

    await expect(createLead(supabase, ACCOUNT, input)).rejects.toBe(transient);
  });
});
