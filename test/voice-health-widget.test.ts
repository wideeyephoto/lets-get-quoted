import { describe, expect, it, vi, beforeEach } from 'vitest';
import { GET } from '@/app/api/voice/health/route';
import { loadVoiceRouteReadiness } from '@/lib/voice/route-readiness';
import { signalWireVoiceScope } from '@/lib/voice/auth';
import { CUSTOMER_SWAIG_TOOLS } from '@/lib/voice/signalwire';

vi.mock('@/lib/auth', () => ({
  requireOfficeContext: vi.fn(async () => ({
    accountId: 'test-account-123',
    supabase: {},
  })),
  createAdminClient: vi.fn(() => ({
    from: () => ({
      select: () => ({
        eq: () => Promise.resolve({ count: 42, data: [] }),
      }),
    }),
  })),
}));

vi.mock('@/lib/voice/auth', () => ({
  signalWireVoiceScope: vi.fn(() => ({
    projectId: 'proj-123',
    spaceId: 'space-123',
  })),
}));

vi.mock('@/lib/voice/route-readiness', () => ({
  loadVoiceRouteReadiness: vi.fn(),
}));

describe('Voice Health & Latency API Endpoint', () => {
  beforeEach(() => {
    vi.mocked(signalWireVoiceScope).mockReturnValue({
      projectId: 'proj-123',
      spaceId: 'space-123',
    });
  });

  it('returns healthy status, low latency, active dedicated line, and 8 tools when route is ready', async () => {
    vi.mocked(loadVoiceRouteReadiness).mockResolvedValue({
      kind: 'ready',
      number: '+12485550100',
      verifiedAt: '2026-08-26T12:00:00Z',
    });

    const res = await GET();
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.status).toBe('healthy');
    expect(json.engine).toBe('SignalWire SWML');
    expect(json.activeNumber).toBe('+12485550100');
    expect(json.routeState).toBe('ready');
    expect(json.notReadyReason).toBeNull();
    expect(json.toolsActive).toBe(CUSTOMER_SWAIG_TOOLS.length);
    expect(json.securityGuard).toContain('HMAC-SHA256');
    expect(json.latencyMs).toBeGreaterThanOrEqual(1);
  });

  it('returns not_ready status and null activeNumber when workspace has no dedicated number assigned', async () => {
    vi.mocked(loadVoiceRouteReadiness).mockResolvedValue({
      kind: 'not_ready',
      reason: 'missing_number',
      number: null,
    });

    const res = await GET();
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.status).toBe('not_ready');
    expect(json.activeNumber).toBeNull();
    expect(json.routeState).toBe('not_ready');
    expect(json.notReadyReason).toBe('missing_number');
    expect(json.toolsActive).toBe(0);
  });

  it('returns degraded status when SignalWire provider scope is missing', async () => {
    vi.mocked(signalWireVoiceScope).mockReturnValue(null as any);
    vi.mocked(loadVoiceRouteReadiness).mockResolvedValue({
      kind: 'ready',
      number: '+12485550100',
      verifiedAt: '2026-08-26T12:00:00Z',
    });

    const res = await GET();
    const json = await res.json();
    expect(json.status).toBe('degraded');
    expect(json.toolsActive).toBe(0);
  });
});

