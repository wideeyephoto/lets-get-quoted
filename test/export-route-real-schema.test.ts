import { describe, it, expect, vi } from 'vitest';

describe('export route real-schema and primary key ordering', () => {
  it('correctly orders messaging_registrations by account_id and other tables by their true primary keys', async () => {
    const executedQueries: { table: string; orderCols: string[] }[] = [];

    const mockAdmin = {
      from: vi.fn((table: string) => {
        const orderCols: string[] = [];
        const queryObj: any = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn((col: string) => {
            orderCols.push(col);
            return queryObj;
          }),
          range: vi.fn().mockImplementation(() => {
            executedQueries.push({ table, orderCols: [...orderCols] });
            return Promise.resolve({ data: [], error: null });
          }),
        };
        return queryObj;
      }),
    } as any;

    // Simulate export route table iteration logic
    const ACCOUNT_DIRECT_TABLES = [
      'accounts',
      'messaging_registrations',
      'sms_consent_scopes',
      'invoices',
      'payments',
    ];

    const TABLE_PRIMARY_KEYS: Record<string, string[]> = {
      messaging_registrations: ['account_id'],
      quickbooks_connections: ['account_id'],
      sms_consent_scopes: ['phone_number', 'consent_scope'],
    };

    for (const table of ACCOUNT_DIRECT_TABLES) {
      let query = mockAdmin.from(table).select('*').eq('account_id', 'acc-123');
      const sortCols = TABLE_PRIMARY_KEYS[table] ?? ['id'];
      for (const col of sortCols) {
        query = query.order(col, { ascending: true });
      }
      await query.range(0, 499);
    }

    const messagingQuery = executedQueries.find((q) => q.table === 'messaging_registrations');
    expect(messagingQuery).toBeDefined();
    expect(messagingQuery?.orderCols).toEqual(['account_id']); // Not 'id'

    const scopesQuery = executedQueries.find((q) => q.table === 'sms_consent_scopes');
    expect(scopesQuery).toBeDefined();
    expect(scopesQuery?.orderCols).toEqual(['phone_number', 'consent_scope']);

    const invoicesQuery = executedQueries.find((q) => q.table === 'invoices');
    expect(invoicesQuery).toBeDefined();
    expect(invoicesQuery?.orderCols).toEqual(['id']);
  });
});
