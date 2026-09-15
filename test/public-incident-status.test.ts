import { describe, expect, it, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { getPublicIncidentStatus } from '@/lib/public-incident-status';

function transport(failure?: 'active' | 'history' | 'network') {
  const requests: URL[] = [];
  const client = createClient('http://localhost:54321', 'test-anon', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: vi.fn(async (input) => {
      if (failure === 'network') throw new DOMException('request timed out', 'AbortError');
      const url = new URL(String(input));
      requests.push(url);
      const kind = url.searchParams.has('or') ? 'history' : 'active';
      const failed = kind === failure;
      return new Response(JSON.stringify(failed ? { code: '42501', message: 'denied' } : [{ id: kind }]), {
        status: failed ? 403 : 200, headers: { 'Content-Type': 'application/json' },
      });
    }) },
  });
  return { client, requests };
}

describe('public status reads', () => {
  it('fetches all current incidents separately from the latest ten history entries', async () => {
    const { client, requests } = transport();
    expect(await getPublicIncidentStatus(client)).toEqual({ available: true, active: [{ id: 'active' }], history: [{ id: 'history' }] });
    const active = requests.find((url) => !url.searchParams.has('or'))!;
    const history = requests.find((url) => url.searchParams.has('or'))!;
    expect(active.searchParams.get('resolved_at')).toBe('is.null');
    expect(active.searchParams.get('kind')).toBe('eq.incident');
    expect(history.searchParams.get('limit')).toBe('10');
    for (const url of requests) {
      expect(url.searchParams.get('published')).toBe('eq.true');
      expect(url.searchParams.get('select')).not.toMatch(/\*|owner|created_by|root_cause|external_url/);
    }
  });
  for (const failure of ['active', 'history', 'network'] as const) {
    it(`${failure} errors return unavailable rather than an all-clear`, async () => {
      expect(await getPublicIncidentStatus(transport(failure).client)).toEqual({ available: false, active: [], history: [] });
    });
  }
});
