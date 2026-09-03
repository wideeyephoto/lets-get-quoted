import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  countUnreadMessages,
  loadConversationMessages,
  loadConversations,
  markThreadRead,
} from '../src/lib/messages';
import {
  runSmsInboxVisibleQuery,
} from '../src/lib/sms-inbox-visibility';

type CapturedQuery = {
  table: string;
  operation: 'select' | 'update';
  columns: string | null;
  equals: Array<[string, unknown]>;
};

function inboxClient(options: {
  missingVisibilityColumn?: boolean;
  filteredQueryError?: unknown;
} = {}): { api: SupabaseClient; captured: CapturedQuery[] } {
  const captured: CapturedQuery[] = [];
  const api = {
    from(table: string) {
      const entry: CapturedQuery = { table, operation: 'select', columns: null, equals: [] };
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      const result = () => {
        if (table === 'sms_sender_numbers' || table === 'sms_events' || table === 'jobs' || table === 'leads' || table === 'clients') {
          return { data: [], error: null };
        }
        if (table !== 'sms_messages') return { data: [], error: null };

        const isFiltered = entry.equals.some(([column, value]) => column === 'inbox_visible' && value === true);
        if (isFiltered && options.missingVisibilityColumn) {
          return {
            data: null,
            count: null,
            error: {
              code: '42703',
              message: 'column sms_messages.inbox_visible does not exist',
            },
          };
        }
        if (isFiltered && options.filteredQueryError) {
          return { data: null, count: null, error: options.filteredQueryError };
        }
        return {
          data: entry.operation === 'update' ? [{ id: 'message-1' }] : [],
          count: 0,
          error: null,
        };
      };

      Object.assign(chain, {
        select(columns: string) {
          entry.columns = columns;
          if (table === 'sms_messages' && !captured.includes(entry)) captured.push(entry);
          return chain;
        },
        update() {
          entry.operation = 'update';
          if (table === 'sms_messages' && !captured.includes(entry)) captured.push(entry);
          return chain;
        },
        eq(column: string, value: unknown) {
          entry.equals.push([column, value]);
          return chain;
        },
        is: self,
        in: self,
        not: self,
        or: self,
        lte: self,
        order: self,
        limit: self,
        then(resolveResult: (value: unknown) => unknown, rejectResult?: (reason: unknown) => unknown) {
          return Promise.resolve(result()).then(resolveResult, rejectResult);
        },
      });
      return chain;
    },
  } as unknown as SupabaseClient;
  return { api, captured };
}

describe('sms customer-inbox visibility boundary', () => {
  it('filters the list, open thread, unread badge, and mark-read update in the query', async () => {
    const { api, captured } = inboxClient();

    await loadConversations(api, 'acct-1');
    await loadConversationMessages(api, 'acct-1', '+18103042061');
    await countUnreadMessages(api, 'acct-1');
    await markThreadRead(api, 'acct-1', '+18103042061');

    const messageQueries = captured.filter((query) => query.table === 'sms_messages');
    expect(messageQueries).toHaveLength(4);
    for (const query of messageQueries) {
      expect(query.equals).toContainEqual(['inbox_visible', true]);
    }
  });

  it('fails closed when the visibility migration is missing', async () => {
    const { api, captured } = inboxClient({ missingVisibilityColumn: true });

    await expect(loadConversationMessages(api, 'acct-1', '+18103042061'))
      .resolves.toEqual({ kind: 'unavailable', data: [] });

    const attempts = captured.filter((query) => query.table === 'sms_messages');
    expect(attempts).toHaveLength(1);
    expect(attempts[0].equals).toContainEqual(['inbox_visible', true]);
  });

  it('does not turn an unrelated database failure into an unfiltered retry', async () => {
    const { api, captured } = inboxClient({
      filteredQueryError: { code: '42501', message: 'permission denied for table sms_messages' },
    });

    await expect(loadConversationMessages(api, 'acct-1', '+18103042061'))
      .resolves.toEqual({ kind: 'unavailable', data: [] });
    expect(captured.filter((query) => query.table === 'sms_messages')).toHaveLength(1);
  });

  it('always requests the visibility predicate on a successful query', async () => {
    const attempts: boolean[] = [];
    const result = await runSmsInboxVisibleQuery((includeVisibilityFilter) => {
      attempts.push(includeVisibilityFilter);
      return Promise.resolve({ data: ['visible-row'], error: null });
    });
    expect(attempts).toEqual([true]);
    expect(result).toEqual({ data: ['visible-row'], error: null });
  });

  it('returns a missing-column error without offering an unfiltered fallback', async () => {
    const attempts: boolean[] = [];
    const result = await runSmsInboxVisibleQuery((includeVisibilityFilter) => {
      attempts.push(includeVisibilityFilter);
      return Promise.resolve({
        data: null,
        error: { code: '42703', message: 'column inbox_visible does not exist' },
      });
    });
    expect(attempts).toEqual([true]);
    expect(result).toEqual({
      data: null,
      error: { code: '42703', message: 'column inbox_visible does not exist' },
    });
  });
});

describe('every customer-facing direct sms_messages read', () => {
  const expectedFilters = new Map([
    ['src/lib/messages.ts', 4],
    ['src/app/dashboard/messages/actions.ts', 1],
    ['src/lib/client-portal-data.ts', 1],
    ['src/lib/dashboard/system-status-loader.ts', 1],
  ]);

  for (const [path, expectedCount] of expectedFilters) {
    it(`${path} applies inbox_visible = true through the guarded compatibility reader`, () => {
      const source = readFileSync(resolve(process.cwd(), path), 'utf8');
      expect(source).toContain('runSmsInboxVisibleQuery');
      expect(source.match(/\.eq\('inbox_visible', true\)/g) ?? []).toHaveLength(expectedCount);
    });
  }
});
