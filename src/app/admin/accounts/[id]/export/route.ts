import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { logAdminAction } from '@/lib/admin';

export const dynamic = 'force-dynamic';

// Full JSON export of an account's data — for honoring a contractor's data-export
// request. Admin-gated (requireAdmin 404s non-staff) and audited. Read-only.
const TABLES = ['accounts', 'sites', 'clients', 'leads', 'jobs', 'invoices', 'payments', 'extra_stop_requests', 'account_credits'] as const;

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const { admin, adminEmail } = await requireAdmin();
  const accountId = params.id;

  const { data: account } = await admin.from('accounts').select('id, account_number').eq('id', accountId).maybeSingle();
  if (!account) return NextResponse.json({ error: 'Account not found' }, { status: 404 });

  const bundle: Record<string, unknown> = { exportedAt: new Date().toISOString(), accountId };
  for (const table of TABLES) {
    const column = table === 'accounts' ? 'id' : 'account_id';
    const value = table === 'accounts' ? accountId : accountId;
    const { data } = await admin.from(table).select('*').eq(column, value);
    bundle[table] = data ?? [];
  }

  await logAdminAction(admin, adminEmail, { action: 'account_export', accountId, targetType: 'account', targetId: accountId });

  const filename = `account-${(account as { account_number: number }).account_number ?? accountId}-export.json`;
  return new NextResponse(JSON.stringify(bundle, null, 2), {
    headers: {
      'content-type': 'application/json',
      'content-disposition': `attachment; filename="${filename}"`,
    },
  });
}
