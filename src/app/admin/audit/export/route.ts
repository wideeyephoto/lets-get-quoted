import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { queryAdminActions } from '@/lib/admin';

export const dynamic = 'force-dynamic';

function escapeCsv(val: any): string {
  if (val === null || val === undefined) return '';
  const str = typeof val === 'object' ? JSON.stringify(val) : String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

export async function GET(req: Request) {
  const { admin } = await requireAdmin();
  const url = new URL(req.url);
  
  const actor = url.searchParams.get('actor') || undefined;
  const action = url.searchParams.get('action') || undefined;
  const from = url.searchParams.get('from') || undefined;
  const to = url.searchParams.get('to') || undefined;
  
  const { rows } = await queryAdminActions(admin, {
    actor, action, from, to,
    page: 1,
    pageSize: 5000 // Just export up to 5000 rows
  });

  const headers = ['Time', 'Actor', 'Action', 'Account', 'Target', 'Target ID', 'Reason', 'Before', 'After'];
  
  const csvRows = [headers.join(',')];
  for (const row of rows) {
    csvRows.push([
      row.created_at,
      row.admin_email,
      row.action,
      row.account_id,
      row.target_type,
      row.target_id,
      row.reason,
      row.before_value ? JSON.stringify(row.before_value) : '',
      row.after_value ? JSON.stringify(row.after_value) : ''
    ].map(escapeCsv).join(','));
  }
  
  return new NextResponse(csvRows.join('\n'), {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': 'attachment; filename="audit-export.csv"'
    }
  });
}
