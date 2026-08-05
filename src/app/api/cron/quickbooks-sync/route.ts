import { NextResponse } from 'next/server';
import { syncAllAccounts } from '@/lib/quickbooks/sync';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Nightly push of invoices and payments into every linked QuickBooks company.
//
// Safe to re-run: every create carries the row's uuid as Intuit's idempotency
// key, and a row that made it across has qbo_id set and is never picked up
// again. Same CRON_SECRET auth as the other sweeps.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get('authorization');
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const summary = await syncAllAccounts();
    return NextResponse.json(summary);
  } catch (error) {
    console.error('QuickBooks sync cron failed:', error);
    return NextResponse.json({ error: 'QuickBooks sync failed' }, { status: 500 });
  }
}
