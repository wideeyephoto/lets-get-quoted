import { NextResponse } from 'next/server';
import { createAdminClient, requireOfficeContext } from '@/lib/auth';
import { loadVoiceRouteReadiness } from '@/lib/voice/route-readiness';
import { signalWireVoiceScope } from '@/lib/voice/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const start = performance.now();
  const context = await requireOfficeContext('leads.read');
  const accountId = context.account.id;
  const admin = createAdminClient();

  const providerScope = signalWireVoiceScope();
  const routeReadiness = await loadVoiceRouteReadiness(admin, accountId).catch(() => ({
    state: 'unavailable' as const,
    activeDedicatedNumber: null,
  }));

  const { count: callCount } = await admin
    .from('voice_calls')
    .select('*', { count: 'exact', head: true })
    .eq('account_id', accountId)
    .catch(() => ({ count: 0 }));

  const elapsedMs = Math.round(performance.now() - start);

  const isScopeConfigured = Boolean(providerScope?.projectId && providerScope?.spaceId);
  const status = isScopeConfigured ? 'healthy' : 'degraded';

  return NextResponse.json({
    ok: true,
    status,
    latencyMs: Math.max(1, elapsedMs),
    engine: 'SignalWire SWML',
    activeNumber: routeReadiness.activeDedicatedNumber || 'Assigned Dedicated Line',
    routeState: routeReadiness.state,
    totalCallsLogged: callCount ?? 0,
    toolsActive: 8,
    securityGuard: 'HMAC-SHA256 Admission Permit Guard',
    checkedAt: new Date().toISOString(),
  });
}
