import { NextRequest, NextResponse } from 'next/server';
import { runPurgeWorker } from '@/lib/purge-worker';
import { cronRoute } from '@/lib/cron-runs';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const authenticatedGET = cronRoute('purge-expired', async () => {
  return runPurgeWorker();
});

export async function GET(request: Request): Promise<NextResponse> {
  return authenticatedGET(request);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await runPurgeWorker();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error('Purge expired cron worker failure:', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
