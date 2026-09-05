import { NextResponse } from 'next/server';
import { requireOfficeContext } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { supabase, accountId } = await requireOfficeContext('leads.read');
    const url = new URL(request.url);
    const sinceParam = url.searchParams.get('since');

    const sinceIso = sinceParam && !Number.isNaN(new Date(sinceParam).getTime())
      ? new Date(sinceParam).toISOString()
      : new Date(Date.now() - 60_000).toISOString();

    const [newCallsResult, activeCallsResult] = await Promise.all([
      supabase
        .from('voice_calls')
        .select('id, started_at', { count: 'exact', head: true })
        .eq('account_id', accountId)
        .gte('started_at', sinceIso),
      supabase
        .from('voice_calls')
        .select('id', { count: 'exact', head: true })
        .eq('account_id', accountId)
        .or('is_provisional.eq.true,outcome.eq.in_progress'),
    ]);

    const newCallsCount = newCallsResult.count ?? 0;
    const hasActiveCalls = (activeCallsResult.count ?? 0) > 0;

    return NextResponse.json({
      ok: true,
      newCallsCount,
      hasActiveCalls,
      polledAt: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: 'Poll failed' }, { status: 500 });
  }
}
