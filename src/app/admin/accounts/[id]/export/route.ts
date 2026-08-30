import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { requirePermission } from '@/lib/auth';
import { logAdminAction } from '@/lib/admin';

export const dynamic = 'force-dynamic';

const ACCOUNT_DIRECT_TABLES = [
  'accounts',
  'sites',
  'clients',
  'leads',
  'jobs',
  'job_tasks',
  'job_milestones',
  'job_feed',
  'change_orders',
  'warranties',
  'services',
  'crew',
  'time_entries',
  'invoices',
  'payments',
  'scheduled_payments',
  'payment_plans',
  'extra_stop_requests',
  'account_credits',
  'voice_calls',
  'sms_messages',
  'sms_consent',
  'sms_consent_scopes',
  'review_invites',
  'email_suppression',
  'messaging_registrations',
  'office_invitations',
] as const;

const TABLE_PRIMARY_KEYS: Record<string, string[]> = {
  messaging_registrations: ['account_id'],
  quickbooks_connections: ['account_id'],
  sms_consent_scopes: ['phone_number', 'consent_scope'],
};

async function fetchAllRows(admin: SupabaseClient, table: string, column: string, value: string): Promise<unknown[]> {
  const rows: unknown[] = [];
  const BATCH = 500;
  let lastId: string | null = null;
  let hasMore = true;

  while (hasMore) {
    let query = admin
      .from(table)
      .select('*')
      .eq(column, value);

    if (table === 'sms_consent_scopes') {
      // Offset pagination fallback for composite primary key
      query = query.order('phone_number', { ascending: true }).order('consent_scope', { ascending: true });
      const { data, error } = await query.range(rows.length, rows.length + BATCH - 1);
      if (error) {
        if (error.code === '42P01') return [];
        throw new Error(`Export failed on table ${table}: ${error.message}`);
      }
      if (data && data.length > 0) {
        rows.push(...data);
        if (data.length < BATCH) hasMore = false;
      } else {
        hasMore = false;
      }
    } else {
      // Keyset cursor pagination on id
      query = query.order('id', { ascending: true }).limit(BATCH);
      if (lastId) {
        query = query.gt('id', lastId);
      }

      const { data, error } = await query;
      if (error) {
        if (error.code === '42P01') return [];
        console.error(`Export table ${table} failed at cursor ${lastId}:`, error.message);
        throw new Error(`Export failed on table ${table}: ${error.message}`);
      }

      if (data && data.length > 0) {
        rows.push(...data);
        lastId = (data[data.length - 1] as { id?: string })?.id ?? null;
        if (data.length < BATCH || !lastId) {
          hasMore = false;
        }
      } else {
        hasMore = false;
      }
    }
  }

  return rows;
}

async function fetchInvoiceItemsForInvoices(admin: SupabaseClient, invoiceIds: string[]): Promise<unknown[]> {
  if (invoiceIds.length === 0) return [];
  const rows: unknown[] = [];
  const BATCH_SIZE = 50;
  const PAGE_SIZE = 500;

  for (let i = 0; i < invoiceIds.length; i += BATCH_SIZE) {
    const chunk = invoiceIds.slice(i, i + BATCH_SIZE);
    let lastId: string | null = null;
    let hasMore = true;

    while (hasMore) {
      let query = admin
        .from('invoice_items')
        .select('*')
        .in('invoice_id', chunk)
        .order('id', { ascending: true })
        .limit(PAGE_SIZE);

      if (lastId) {
        query = query.gt('id', lastId);
      }

      const { data, error } = await query;

      if (error) {
        if (error.code === '42P01') break;
        console.error('Export invoice_items failed:', error.message);
        throw new Error(`Export failed on table invoice_items: ${error.message}`);
      }

      if (data && data.length > 0) {
        rows.push(...data);
        lastId = (data[data.length - 1] as { id?: string })?.id ?? null;
        if (data.length < PAGE_SIZE || !lastId) {
          hasMore = false;
        }
      } else {
        hasMore = false;
      }
    }
  }

  return rows;
}

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const ctx = await requirePermission('account.export');
  const { admin } = ctx;
  const accountId = params.id;

  const { data: account, error: accountError } = await admin
    .from('accounts')
    .select('id, account_number, business_name')
    .eq('id', accountId)
    .maybeSingle();

  if (accountError) {
    console.error('Account export lookup failed:', accountError);
    return NextResponse.json({ error: 'Database query failed' }, { status: 500 });
  }

  if (!account) {
    return NextResponse.json({ error: 'Account not found' }, { status: 404 });
  }

  const tableCounts: Record<string, number> = {};
  const dataBundle: Record<string, unknown[]> = {};

  try {
    for (const table of ACCOUNT_DIRECT_TABLES) {
      const column = table === 'accounts' ? 'id' : 'account_id';
      const rows = await fetchAllRows(admin, table, column, accountId);
      dataBundle[table] = rows;
      tableCounts[table] = rows.length;
    }

    // invoice_items has no direct account_id; query via parent invoices
    const invoiceRows = (dataBundle['invoices'] ?? []) as Array<{ id: string }>;
    const invoiceIds = invoiceRows.map((inv) => inv.id).filter(Boolean);
    const invoiceItemRows = await fetchInvoiceItemsForInvoices(admin, invoiceIds);
    dataBundle['invoice_items'] = invoiceItemRows;
    tableCounts['invoice_items'] = invoiceItemRows.length;
  } catch (error) {
    console.error('Export data collection failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to collect full data export' },
      { status: 500 },
    );
  }

  const rawJson = JSON.stringify(dataBundle);
  const checksumSha256 = createHash('sha256').update(rawJson).digest('hex');

  const bundle = {
    exportedAt: new Date().toISOString(),
    accountId,
    accountNumber: (account as { account_number: number }).account_number ?? null,
    businessName: (account as { business_name: string }).business_name ?? null,
    tableCounts,
    checksumSha256,
    data: dataBundle,
  };

  await logAdminAction(admin, ctx, {
    action: 'account_export',
    accountId,
    targetType: 'account',
    targetId: accountId,
    meta: { tableCounts, checksumSha256 },
  });

  const filename = `account-${(account as { account_number: number }).account_number ?? accountId}-export.json`;
  return new NextResponse(JSON.stringify(bundle, null, 2), {
    headers: {
      'content-type': 'application/json',
      'content-disposition': `attachment; filename="${filename}"`,
    },
  });
}
