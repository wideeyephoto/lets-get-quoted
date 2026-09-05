import { NextResponse } from 'next/server';
import { createAdminClient, requireOfficeContext } from '@/lib/auth';
import { loadVoiceRouteReadiness } from '@/lib/voice/route-readiness';
import { signalWireVoiceScope } from '@/lib/voice/auth';
import { CUSTOMER_SWAIG_TOOLS } from '@/lib/voice/signalwire';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Older provisioned numbers already target this URL for provider POST recovery.
// Keep their signed callback working; dashboard GET still requires its session.
export { handleVoiceProviderFallback as POST } from '@/lib/voice/fallback';

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
  let status: 'healthy' | 'not_ready' | 'degraded' | 'unavailable' = 'healthy';
  if (!isScopeConfigured) {
    status = 'degraded';
  } else if (routeReadiness.kind === 'ready') {
    status = 'healthy';
  } else if (routeReadiness.kind === 'not_ready') {
    status = 'not_ready';
  } else {
    status = 'unavailable';
  }

  const activeNumber = routeReadiness.kind === 'ready'
    ? routeReadiness.number
    : (routeReadiness.kind === 'not_ready' ? routeReadiness.number : null);

  const notReadyReason = routeReadiness.kind === 'not_ready' ? routeReadiness.reason : null;

  return NextResponse.json({
    ok: true,
    status,
    latencyMs: Math.max(1, elapsedMs),
    engine: 'SignalWire SWML',
    activeNumber,
    routeState: routeReadiness.kind,
    notReadyReason,
    totalCallsLogged: callCount ?? 0,
    toolsActive: status === 'healthy' ? CUSTOMER_SWAIG_TOOLS.length : 0,
    securityGuard: 'HMAC-SHA256 Admission Permit Guard',
    checkedAt: new Date().toISOString(),
  });
}

