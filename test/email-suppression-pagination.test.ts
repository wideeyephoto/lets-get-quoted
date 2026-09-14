import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { loadSuppressedEmails } from '@/lib/email-suppression';

type Row = { id: string; email: string; account_id: string };
const row = (n: number, account_id = 'workspace-a'): Row => ({ id: `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`, email: `person${n}@example.com`, account_id });

// Use the installed query builder against a local HTTP response fixture. Apply
// its actual filters/order/limit to catch lost scope or incorrect cursor syntax.
function fixture(rows: Row[], cap = 500, override?: (call: number, rows: Row[]) => Response | undefined) {
  const requests: URL[] = [];
  const admin = createClient('https://suppression-fixture.supabase.co', 'synthetic-secret', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input, init) => {
      const request = new Request(input, init);
      const url = new URL(request.url);
      requests.push(url);
      expect(request.method).toBe('GET');
      expect(url.pathname).toBe('/rest/v1/email_suppression');
      expect(url.searchParams.get('select')).toBe('id,email');
      expect(url.searchParams.get('order')).toBe('id.asc');
      const replaced = override?.(requests.length, rows);
      if (replaced) return replaced;
      const scope = url.searchParams.get('account_id')?.slice(3);
      const after = url.searchParams.get('id')?.slice(3) ?? '';
      const matching = rows.filter(r => r.account_id === scope && r.id > after)
        .sort((a, b) => a.id.localeCompare(b.id)).slice(0, Math.min(cap, Number(url.searchParams.get('limit'))));
      return Response.json(matching.map(({ id, email }) => ({ id, email })));
    } },
  });
  return { admin, requests };
}

describe('complete workspace suppression scans', () => {
  it('reads past 1,000 rows with exact workspace scope and a terminal empty page', async () => {
    const rows = Array.from({ length: 1201 }, (_, i) => row(i + 1));
    const { admin, requests } = fixture([...rows, row(2000, 'workspace-b')]);
    const result = await loadSuppressedEmails(admin, 'workspace-a');
    expect(result.size).toBe(1201);
    expect(result.has('person1201@example.com')).toBe(true);
    expect(result.has('person2000@example.com')).toBe(false);
    expect(requests).toHaveLength(4);
    expect(requests[1].searchParams.get('id')).toBe(`gt.${row(500).id}`);
    expect(requests.every(url => url.searchParams.get('account_id') === 'eq.workspace-a')).toBe(true);
  });
  it('continues after short pages caused by a lower configured API cap', async () => {
    const { admin, requests } = fixture(Array.from({ length: 8 }, (_, i) => row(i + 1)), 3);
    expect((await loadSuppressedEmails(admin, 'workspace-a')).size).toBe(8);
    expect(requests).toHaveLength(4);
  });
  it('does not skip a row when an earlier page is deleted', async () => {
    const rows = [row(1), row(2), row(3), row(4)];
    const { admin } = fixture(rows, 2, call => { if (call === 2) rows.shift(); return undefined; });
    expect(await loadSuppressedEmails(admin, 'workspace-a')).toEqual(new Set(rows.map(r => r.email).concat('person1@example.com')));
  });
  it('normalizes addresses and handles an empty workspace', async () => {
    const { admin } = fixture([{ ...row(1), email: ' PERSON1@Example.com ' }]);
    expect(await loadSuppressedEmails(admin, 'workspace-a')).toEqual(new Set(['person1@example.com']));
    expect(await loadSuppressedEmails(admin, 'workspace-b')).toEqual(new Set());
  });
  it('discards partial results if a later page fails', async () => {
    const { admin } = fixture([row(1), row(2)], 1, call => call === 2
      ? Response.json({ message: 'lookup unavailable', code: 'fixture' }, { status: 400 }) : undefined);
    await expect(loadSuppressedEmails(admin, 'workspace-a')).rejects.toThrow('lookup unavailable');
  });
  it.each([null, [{ id: 'missing-email' }], [{ id: '', email: 'person@example.com' }]])('rejects unavailable or malformed data', async data => {
    const { admin } = fixture([], 500, () => Response.json(data));
    await expect(loadSuppressedEmails(admin, 'workspace-a')).rejects.toThrow('unavailable or incomplete');
  });
  it('stops a repeated page instead of looping or returning a partial set', async () => {
    const { admin, requests } = fixture([], 500, () => Response.json([row(1)]));
    await expect(loadSuppressedEmails(admin, 'workspace-a')).rejects.toThrow('unavailable or incomplete');
    expect(requests).toHaveLength(2);
  });
  it('stops at the scan budget without returning partial data', async () => {
    const { admin, requests } = fixture([], 500, call => Response.json([row(call)]));
    await expect(loadSuppressedEmails(admin, 'workspace-a')).rejects.toThrow('scan limit');
    expect(requests).toHaveLength(200);
  });
  it('requires a workspace before querying', async () => {
    const { admin, requests } = fixture([]);
    await expect(loadSuppressedEmails(admin, '')).rejects.toThrow('workspace is required');
    expect(requests).toHaveLength(0);
  });
});
