import { expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { countFailedEmailEvents, getFailedEmailEvents } from '@/lib/admin-alerts';

it('uses the same delivery failure scope for displayed rows and total count', async () => {
  const records = ['bounced', 'complained', 'failed', 'suppressed', 'delivered'].map(status => ({ id: status, status }));
  const scopes: string[][] = [];
  const admin = { from: vi.fn(() => {
    let selected = records;
    const query = {
      select: vi.fn().mockReturnThis(), is: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(),
      in: (_column: string, values: string[]) => { scopes.push(values); selected = records.filter(r => values.includes(r.status)); return query; },
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: selected, count: selected.length, error: null }).then(resolve),
    };
    return query;
  }) } as unknown as SupabaseClient;
  const rows = await getFailedEmailEvents(admin);
  const count = await countFailedEmailEvents(admin);
  expect(rows.map(r => r.status)).toEqual(['bounced', 'complained', 'failed', 'suppressed']);
  expect(count).toBe(rows.length);
  expect(scopes[0]).toEqual(scopes[1]);
});
