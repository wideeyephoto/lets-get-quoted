import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from '@/app/api/dashboard/crew/locations/route';

vi.mock('@/lib/auth', () => ({
  requireOfficeContext: vi.fn(),
}));

vi.mock('@/lib/crew-location', () => ({
  loadCrewLocationMapSnapshot: vi.fn(),
}));

describe('Crew Locations API Route', () => {
  let requireOfficeContextMock: any;
  let loadCrewLocationMapSnapshotMock: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    
    requireOfficeContextMock = (await import('@/lib/auth')).requireOfficeContext;
    requireOfficeContextMock.mockResolvedValue({
      supabase: {},
      accountId: 'acct_123',
      role: 'admin',
      capabilities: new Set(['crew.read']),
    });

    loadCrewLocationMapSnapshotMock = (await import('@/lib/crew-location')).loadCrewLocationMapSnapshot;
    loadCrewLocationMapSnapshotMock.mockResolvedValue({ users: [], jobs: [] });
  });

  it('returns snapshot successfully', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.snapshot).toEqual({ users: [], jobs: [] });
    
    expect(requireOfficeContextMock).toHaveBeenCalledWith('crew.read');
    expect(loadCrewLocationMapSnapshotMock).toHaveBeenCalledWith(
      expect.any(Object),
      'acct_123',
      { canViewPay: false }
    );
  });

  it('allows owner to view pay', async () => {
    requireOfficeContextMock.mockResolvedValue({
      supabase: {},
      accountId: 'acct_123',
      role: 'owner',
      capabilities: new Set(['crew.read']),
    });

    await GET();
    
    expect(loadCrewLocationMapSnapshotMock).toHaveBeenCalledWith(
      expect.any(Object),
      'acct_123',
      { canViewPay: true }
    );
  });

  it('allows user with crew_pay.read capability to view pay', async () => {
    requireOfficeContextMock.mockResolvedValue({
      supabase: {},
      accountId: 'acct_123',
      role: 'manager',
      capabilities: new Set(['crew.read', 'crew_pay.read']),
    });

    await GET();
    
    expect(loadCrewLocationMapSnapshotMock).toHaveBeenCalledWith(
      expect.any(Object),
      'acct_123',
      { canViewPay: true }
    );
  });

  it('returns 401 on Unauthorized errors', async () => {
    requireOfficeContextMock.mockRejectedValue(new Error('Unauthorized'));
    
    const res = await GET();
    expect(res.status).toBe(401);
    
    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(data.error).toBe('Unauthorized');
  });
});
