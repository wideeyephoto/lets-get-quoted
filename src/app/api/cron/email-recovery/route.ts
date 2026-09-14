import { NextResponse } from 'next/server';
import { cronRoute } from '@/lib/cron-runs';
import { runEmailRecovery } from '@/lib/email-recovery-worker';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;
const live = cronRoute('email-recovery', () => runEmailRecovery());

export async function GET(request: Request) {
  if (new URL(request.url).searchParams.get('dryRun') !== 'true') return live(request);
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try { return NextResponse.json(await runEmailRecovery(undefined, { dryRun: true })); }
  catch { return NextResponse.json({ error: 'Email recovery preview unavailable' }, { status: 500 }); }
}
