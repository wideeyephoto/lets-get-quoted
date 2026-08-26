import { describe, expect, it, vi } from 'vitest';
import { GET } from '@/app/api/voice/health/route';

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
  loadVoiceRouteReadiness: vi.fn(async () => ({
    kind: 'ready' as const,
    number: '+12485550100',
    verifiedAt: '2026-08-26T12:00:00Z',
  })),
}));

describe('Voice Health & Latency API Endpoint', () => {
  it('returns healthy status, low latency, active dedicated line, and 8 tools', async () => {
    const res = await GET();
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.status).toBe('healthy');
    expect(json.engine).toBe('SignalWire SWML');
    expect(json.activeNumber).toBe('+12485550100');
    expect(json.toolsActive).toBe(8);
    expect(json.securityGuard).toContain('HMAC-SHA256');
    expect(json.latencyMs).toBeGreaterThanOrEqual(1);
  });
});
