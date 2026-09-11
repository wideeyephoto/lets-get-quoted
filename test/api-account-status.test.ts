import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from '@/app/api/account/status/route';
import { NAV_VISIBILITY_COOKIE } from '@/lib/nav-visibility-client';

// Mock dependencies
vi.mock('@/lib/supabase-server', () => ({
  createSupabaseServerClient: vi.fn(() => ({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user_1' } } }) },
  })),
}));

vi.mock('@/lib/auth', () => ({
  createAdminClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(),
      is: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
    })),
  })),
  getCurrentMembership: vi.fn().mockResolvedValue({ accountId: 'acct_1', role: 'owner' }),
  loadHeldCapabilities: vi.fn().mockResolvedValue([]),
}));

vi.mock('@/lib/leads', () => ({
  expireStaleLeads: vi.fn(),
  getLeadTriage: vi.fn((l) => l?.triage || { flags: [] }),
}));

vi.mock('@/lib/lead-queue', () => ({
  isLeadActive: vi.fn(() => true),
  needsResponse: vi.fn(() => true),
}));

vi.mock('@/lib/lead-summary', () => ({
  leadRailTitle: vi.fn(() => '1 Open Lead'),
  leadSummary: vi.fn(() => ({ open: 1, hot: 0, new: 1, actionNeeded: 1, unreadCount: 0 })),
}));

vi.mock('@/lib/jobs', () => ({
  listJobs: vi.fn().mockResolvedValue([
    { id: 'job_1', status: 'new_lead', created_at: '2023-01-01T00:00:00Z' },
    { id: 'job_2', status: 'in_progress', scheduled_for: null, created_at: '2023-01-02T00:00:00Z' },
  ]),
}));

vi.mock('@/lib/quick-stop', () => ({
  QUICK_STOP_SETTINGS_COLUMNS: 'settings',
  quickStopSettingsFromAccount: vi.fn(() => ({ enabled: true, locked: false, maxFeeCents: 5000, weekdays: [1,2], maxPerDay: 5 })),
}));

vi.mock('@/lib/booking-availability', () => ({
  bookingAvailabilityFromAccount: vi.fn(() => ({ enabled: true, weekdays: [1], windowTimes: ['AM'] })),
}));

vi.mock('@/lib/messages', () => ({
  countUnreadMessages: vi.fn().mockResolvedValue(2),
}));

vi.mock('@/lib/quick-stop-state', () => ({
  quickStopNavState: vi.fn(() => 'on'),
  quickStopState: vi.fn(),
}));

vi.mock('@/lib/business-name', () => ({
  pickBusinessName: vi.fn(() => 'Test Biz'),
}));

vi.mock('@/lib/test-records', () => ({
  applyTestRecordFilter: vi.fn((q) => q),
}));

vi.mock('@/lib/field-intake-leads', () => ({
  loadTextToJobStatus: vi.fn().mockResolvedValue({ count: 1, newestCreatedAt: '2023-01-01T00:00:00Z' }),
}));

vi.mock('@/lib/nav-server', () => ({
  resolveServerNavDecision: vi.fn().mockResolvedValue({ allowed: true }),
}));

vi.mock('@/lib/nav-visibility', () => ({
  isNavPersonaEnabled: vi.fn(() => true),
}));

describe('Account Status API Route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns false for loggedIn if user is missing', async () => {
    const { createSupabaseServerClient } = await import('@/lib/supabase-server');
    vi.mocked(createSupabaseServerClient).mockReturnValueOnce({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    } as any);

    const res = await GET();
    const json = await res.json();
    expect(json.loggedIn).toBe(false);
  });

  it('returns onboarded false if membership has no accountId', async () => {
    const { getCurrentMembership } = await import('@/lib/auth');
    vi.mocked(getCurrentMembership).mockResolvedValueOnce({ accountId: null, role: 'owner' } as any);

    const res = await GET();
    const json = await res.json();
    expect(json.loggedIn).toBe(true);
    expect(json.onboarded).toBe(false);
  });

  it('returns expected status payload for valid user', async () => {
    const { createAdminClient } = await import('@/lib/auth');
    const mockAdminClient = {
      from: vi.fn((table: string) => {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          is: vi.fn().mockReturnThis(),
          not: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: table === 'sites' ? { published: true, custom_domain: 'example.com', custom_domain_verified_at: '2023-01-01T00:00:00Z', logo_url: 'logo.png' } : { connect_onboarded: true },
          }),
          then: vi.fn((cb: any) => {
            if (table === 'extra_stop_requests') {
              return cb({ count: 3 });
            }
            return cb({ data: [] });
          }),
        };
      })
    };
    vi.mocked(createAdminClient).mockReturnValue(mockAdminClient as any);

    const res = await GET();
    const json = await res.json();
    
    expect(json.loggedIn).toBe(true);
    expect(json.sitePublished).toBe(true);
    expect(json.businessName).toBe('Test Biz');
    expect(json.siteUrl).toBe('https://example.com');
    expect(json.jobsNeedingAttentionCount).toBe(1);
    expect(json.unscheduledJobCount).toBe(1);
    expect(json.unreadMessageCount).toBe(2);
    expect(json.bookingState).toBe('on');
    
    // Check for cookie
    const cookie = res.cookies.get(NAV_VISIBILITY_COOKIE);
    expect(cookie).toBeDefined();
    expect(JSON.parse(cookie!.value)).toEqual({ allowed: true });
  });
});
