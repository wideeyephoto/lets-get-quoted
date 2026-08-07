import { cronRoute } from '@/lib/cron-runs';
import { syncAllAccounts } from '@/lib/quickbooks/sync';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Nightly push of invoices and payments into every linked QuickBooks company.
//
// Safe to re-run: every create carries the row's uuid as Intuit's idempotency
// key, and a row that made it across has qbo_id set and is never picked up
// again.
export const GET = cronRoute('quickbooks-sync', syncAllAccounts);
