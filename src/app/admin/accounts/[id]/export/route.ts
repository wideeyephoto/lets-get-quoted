import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, requirePermission } from '@/lib/auth';
import { logAdminAction } from '@/lib/admin';
import type { SupabaseClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const EXPORT_TABLES = [
  'accounts',
  'sites',
  'clients',
  'leads',
  'jobs',
  'job_tasks',
  'job_feed',
  'estimate_offers',
  'client_job_access',
  'route_stops',
  'saved_places',
  'crew',
  'time_entries',
  'invoices',
  'payments',
  'scheduled_payments',
  'extra_stop_requests',
  'voice_calls',
  'sms_messages',
  'sms_consent',
  'sms_consent_scopes',
  'review_invites',
  'email_suppression',
  'messaging_registrations',
  'messaging_registration_applications',
  'office_invitations',
] as const;

const TABLE_PRIMARY_KEYS: Record<string, string[]> = {
  accounts: ['id'],
  messaging_registrations: ['account_id'],
  quickbooks_connections: ['account_id'],
  sms_consent_scopes: ['phone_number', 'consent_scope'],
  crew_assignments: ['job_id', 'crew_id'],
};

async function fetchAllRows(admin: SupabaseClient, table: string, column: string, value: string): Promise<unknown[]> {
  const rows: unknown[] = [];
  const BATCH = 500;
  const pks = TABLE_PRIMARY_KEYS[table] ?? ['id'];

  if (pks.length === 1 && pks[0] === 'account_id') {
    // 1:1 account tables
    const { data, error } = await admin.from(table).select('*').eq(column, value);
    if (error) {
      if (error.code === '42P01') return [];
      throw new Error(`Export failed on table ${table}: ${error.message}`);
    }
    return data ?? [];
  }

  if (pks.length > 1) {
    // Composite primary key pagination fallback
    let offset = 0;
    let hasMore = true;
    while (hasMore) {
      let query = admin.from(table).select('*').eq(column, value);
      for (const col of pks) {
        query = query.order(col, { ascending: true });
      }
      const { data, error } = await query.range(offset, offset + BATCH - 1);
      if (error) {
        if (error.code === '42P01') return [];
        throw new Error(`Export failed on table ${table}: ${error.message}`);
      }
      if (data && data.length > 0) {
        rows.push(...data);
        if (data.length < BATCH) hasMore = false;
        else offset += BATCH;
      } else {
        hasMore = false;
      }
    }
    return rows;
  }

  // Standard keyset pagination on 'id'
  let lastId: string | null = null;
  let hasMore = true;

  while (hasMore) {
    let query = admin
      .from(table)
      .select('*')
      .eq(column, value)
      .order('id', { ascending: true })
      .limit(BATCH);

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

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // Enforce staff authentication and account.export permission
  const actor = await requirePermission('account.export');

  const { id: accountId } = await params;
  if (!accountId) {
    return NextResponse.json({ error: 'Missing account ID' }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: account, error: accountErr } = await admin
    .from('accounts')
    .select('*')
    .eq('id', accountId)
    .single();

  if (accountErr || !account) {
    return NextResponse.json({ error: 'Account not found' }, { status: 404 });
  }

  const exportPayload: Record<string, unknown> = {
    export_metadata: {
      account_id: accountId,
      exported_at: new Date().toISOString(),
      exported_by: actor.adminEmail,
      format_version: '2026-08-30',
    },
    account,
  };

  try {
    for (const table of EXPORT_TABLES) {
      if (table === 'accounts') continue;
      exportPayload[table] = await fetchAllRows(admin, table, 'account_id', accountId);
    }

    const invoices = (exportPayload.invoices as Array<{ id: string }>) ?? [];
    const invoiceIds = invoices.map((inv) => inv.id).filter(Boolean);
    exportPayload.invoice_items = await fetchInvoiceItemsForInvoices(admin, invoiceIds);

    // Record audit trail
    await logAdminAction(admin, actor, {
      action: 'account.export',
      accountId,
      targetType: 'account',
      targetId: accountId,
      reason: 'Staff full account export download',
    });

    const filename = `account-export-${accountId}-${new Date().toISOString().slice(0, 10)}.json`;

    return new NextResponse(JSON.stringify(exportPayload, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error(`Export failed for account ${accountId}:`, err);
    return NextResponse.json(
      { error: 'Export failed', details: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

