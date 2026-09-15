import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-admin';
import { recoverExpiredRuns } from '@/lib/photo-estimate/worker';

export const maxDuration = 60; // Wait, maybe we don't need maxDuration if it's just a cron
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  
  if (
    process.env.NODE_ENV !== 'development' &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();
  
  try {
    await recoverExpiredRuns(supabase);
    return NextResponse.json({ ok: true, recovered: true });
  } catch (error) {
    console.error('Photo estimate recovery cron error:', error);
    return NextResponse.json({ ok: false, error: 'Recovery failed' }, { status: 500 });
  }
}
