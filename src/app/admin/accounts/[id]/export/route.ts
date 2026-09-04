import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, requirePermission } from '@/lib/auth';
import { logAdminAction } from '@/lib/admin';
import type { SupabaseClient } from '@supabase/supabase-js';
import { DATA_DISPOSITION_REGISTRY, getExportableTables } from '@/lib/data-disposition-registry';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const TABLE_PRIMARY_KEYS: Record<string, string[]> = {
  accounts: ['id'],
  day_plan_prefs: ['account_id'],
  workspace_entitlements: ['account_id'],
  quickbooks_connections: ['account_id'],
  billing_subscription_customers: ['account_id'],
  workspace_overage_settings: ['account_id'],
  voice_settings: ['account_id'],
  messaging_registrations: ['account_id'],
  google_lsa_connections: ['account_id'],
  sms_consent_scopes: ['account_id', 'phone_number', 'consent_scope'],
  crew_assignments: ['job_id', 'crew_id'],
};

function sanitizeRows(table: string, rawRows: unknown[]): unknown[] {
  const disposition = DATA_DISPOSITION_REGISTRY[table];
  if (!disposition) return rawRows;

  let rows = rawRows;
  if (table === 'support_case_notes') {
    // Only export customer-visible notes; internal staff comments are strictly omitted
    rows = (rows as Array<Record<string, unknown>>).filter((n) => n.visibility === 'customer');
  }

  if (!disposition.exportRedactions || disposition.exportRedactions.length === 0) {
    return rows;
  }

  const redactFields = new Set(disposition.exportRedactions);
  return (rows as Array<Record<string, unknown>>).map((r) => {
    if (!r || typeof r !== 'object') return r;
    const copy = { ...r };
    for (const field of redactFields) {
      if (field in copy && copy[field] !== null && copy[field] !== undefined) {
        copy[field] = '[REDACTED]';
      }
    }
    return copy;
  });
}

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

async function fetchChildRowsByParentIds(
  admin: SupabaseClient,
  table: string,
  foreignKeyCol: string,
  parentIds: string[],
): Promise<unknown[]> {
  if (parentIds.length === 0) return [];
  const rows: unknown[] = [];
  const BATCH_SIZE = 50;
  const PAGE_SIZE = 500;

  for (let i = 0; i < parentIds.length; i += BATCH_SIZE) {
    const chunk = parentIds.slice(i, i + BATCH_SIZE);
    let lastId: string | null = null;
    let hasMore = true;

    while (hasMore) {
      let query = admin
        .from(table)
        .select('*')
        .in(foreignKeyCol, chunk)
        .order('id', { ascending: true })
        .limit(PAGE_SIZE);

      if (lastId) {
        query = query.gt('id', lastId);
      }

      const { data, error } = await query;

      if (error) {
        if (error.code === '42P01') break;
        console.error(`Export child table ${table} failed:`, error.message);
        throw new Error(`Export failed on table ${table}: ${error.message}`);
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
      format_version: '2026-09-04',
    },
    account: sanitizeRows('accounts', [account])[0] ?? account,
  };

  try {
    const exportableTables = getExportableTables().filter((t) => t !== 'accounts');
    const directTables = exportableTables.filter(
      (t) => DATA_DISPOSITION_REGISTRY[t]?.relationship === 'direct_account_id',
    );

    for (const table of directTables) {
      const rawRows = await fetchAllRows(admin, table, 'account_id', accountId);
      exportPayload[table] = sanitizeRows(table, rawRows);
    }

    // Secondary FK-chained tables
    const invoices = (exportPayload.invoices as Array<{ id: string }>) ?? [];
    const invoiceIds = invoices.map((inv) => inv.id).filter(Boolean);
    const invoiceItems = await fetchChildRowsByParentIds(admin, 'invoice_items', 'invoice_id', invoiceIds);
    exportPayload.invoice_items = sanitizeRows('invoice_items', invoiceItems);

    const selections = (exportPayload.job_selections as Array<{ id: string }>) ?? [];
    const selectionIds = selections.map((s) => s.id).filter(Boolean);
    const selectionOptions = await fetchChildRowsByParentIds(admin, 'selection_options', 'selection_id', selectionIds);
    exportPayload.selection_options = sanitizeRows('selection_options', selectionOptions);

    const warranties = (exportPayload.warranties as Array<{ id: string }>) ?? [];
    const warrantyIds = warranties.map((w) => w.id).filter(Boolean);
    const warrantyClaims = await fetchChildRowsByParentIds(admin, 'warranty_claims', 'warranty_id', warrantyIds);
    exportPayload.warranty_claims = sanitizeRows('warranty_claims', warrantyClaims);

    const cases = (exportPayload.support_cases as Array<{ id: string }>) ?? [];
    const caseIds = cases.map((c) => c.id).filter(Boolean);
    const caseNotes = await fetchChildRowsByParentIds(admin, 'support_case_notes', 'case_id', caseIds);
    exportPayload.support_case_notes = sanitizeRows('support_case_notes', caseNotes);

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
