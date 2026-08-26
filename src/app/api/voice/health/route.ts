import { NextResponse } from 'next/server';
import { createAdminClient, requireOfficeContext } from '@/lib/auth';
import { loadVoiceRouteReadiness } from '@/lib/voice/route-readiness';
import { signalWireVoiceScope } from '@/lib/voice/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const start = performance.now();
  const { accountId } = await requireOfficeContext('leads.read');
  const admin = createAdminClient();

  const providerScope = signalWireVoiceScope();
  const routeReadiness = await loadVoiceRouteReadiness(admin, accountId);

  const { count: callCount } = await admin
    .from('voice_calls')
    .select('*', { count: 'exact', head: true })
    .eq('account_id', accountId);

  const elapsedMs = Math.round(performance.now() - start);

  const isScopeConfigured = Boolean(providerScope?.projectId && providerScope?.spaceId);
  const status = isScopeConfigured ? 'healthy' : 'degraded';

  const activeNumber = routeReadiness.kind === 'ready'
    ? routeReadiness.number
    : (routeReadiness.kind === 'not_ready' ? routeReadiness.number : null) ?? 'Assigned Dedicated Line';

  return NextResponse.json({
    ok: true,
    status,
    latencyMs: Math.max(1, elapsedMs),
    engine: 'SignalWire SWML',
    activeNumber,
    routeState: routeReadiness.kind,
    totalCallsLogged: callCount ?? 0,
    toolsActive: 8,
    securityGuard: 'HMAC-SHA256 Admission Permit Guard',
    checkedAt: new Date().toISOString(),
  });
}
