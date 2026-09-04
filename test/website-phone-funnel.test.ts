import { describe, expect, it, vi } from 'vitest';
import { withPublicContact, type Site } from '@/lib/sites';
import { toggleWebsitePhoneFunnelAction } from '@/app/dashboard/voice-calls/actions';

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

const mockRequireOfficeContext = vi.fn();
const mockCreateAdminClient = vi.fn();
vi.mock('@/lib/auth', () => ({
  requireOfficeContext: (...args: unknown[]) => mockRequireOfficeContext(...args),
  createAdminClient: (...args: unknown[]) => mockCreateAdminClient(...args),
}));

const mockLoadVoiceEntitlement = vi.fn();
vi.mock('@/lib/voice/entitlement', () => ({
  loadVoiceEntitlement: (...args: unknown[]) => mockLoadVoiceEntitlement(...args),
}));

const mockLoadVoiceRouteReadiness = vi.fn();
vi.mock('@/lib/voice/route-readiness', () => ({
  loadVoiceRouteReadiness: (...args: unknown[]) => mockLoadVoiceRouteReadiness(...args),
}));

const mockGetOrCreateSite = vi.fn();
vi.mock('@/lib/sites', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/sites')>();
  return {
    ...actual,
    getOrCreateSite: (...args: unknown[]) => mockGetOrCreateSite(...args),
  } as unknown as Site;
});

describe('Website Inbound Lead Funnel: withPublicContact', () => {
  const baseSite = {
    id: 'site-123',
    account_id: 'acc-123',
    company_name: 'Apex Plumbing',
    template: 'fixit',
    header_font: 'inter',
    button_style: 'pill',
    accent_override: null,
    headline: 'Reliable Local Plumbing',
    tagline: 'Fast Service Guaranteed',
    phone: '(810) 320-2687',
    license: 'MI-PLUMB-999',
    hours: '24/7',
    service_area: 'Metro Detroit',
    logo_url: null,
    hero_url: null,
    subdomain: 'apexplumbing',
    custom_domain: null,
    portal_mode: 'light',
    published: true,
    content: {
      phonePublic: true,
    },
    seo_title: null,
    seo_description: null,
  } as unknown as Site;

  it('keeps phone intact on public site render when phonePublic is true (Phone Funnel Active)', () => {
    const publicSite = withPublicContact({
      ...baseSite,
      content: { phonePublic: true },
    });

    expect(publicSite.phone).toBe('(810) 320-2687');
  });

  it('nulls out phone on public site render when phonePublic is false (Online Forms Funnel Active)', () => {
    const publicSite = withPublicContact({
      ...baseSite,
      content: { phonePublic: false },
    });

    expect(publicSite.phone).toBeNull();
  });

  it('defaults to true if phonePublic is omitted from content', () => {
    const publicSite = withPublicContact({
      ...baseSite,
      content: {},
    });

    expect(publicSite.phone).toBe('(810) 320-2687');
  });
});

describe('Website Inbound Lead Funnel: toggleWebsitePhoneFunnelAction', () => {
  it('updates sites row with phonePublic: false when switching to online forms funnel', async () => {
    const updateSpy = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    });

    const mockSupabase = {
      from: vi.fn((table: string) => {
        if (table === 'sites') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                id: 'site-123',
                phone: '(810) 320-2687',
                content: { phonePublic: true, quoteForm: { enabled: true } },
                subdomain: 'brokepipes',
              },
            }),
            update: updateSpy,
          } as unknown as Site;
        }
        throw new Error(`Unexpected table ${table}`);
      }),
    } as unknown as Site;

    mockRequireOfficeContext.mockResolvedValue({
      supabase: mockSupabase,
      accountId: 'acc-123',
    });

    const result = await toggleWebsitePhoneFunnelAction(false);

    expect(result.success).toBe(true);
    expect(result.phonePublic).toBe(false);
    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.objectContaining({
          phonePublic: false,
          quoteForm: { enabled: true },
        }),
      })
    );
  });

  it('updates sites row with phonePublic: true, preserves original phone, and uses dedicated AI number when switching to phone funnel', async () => {
    mockLoadVoiceEntitlement.mockResolvedValue({ available: true, enabled: true });
    mockLoadVoiceRouteReadiness.mockResolvedValue({ kind: 'ready' });

    const updateSpy = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    });

    const mockAdmin = {
      from: vi.fn((table: string) => {
        if (table === 'voice_settings') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: { status: 'active' },
            }),
          };
        }
        if (table === 'accounts') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                call_tracking_number: '+18103202687',
                alert_phone: '+18103042061',
              },
            }),
          };
        }
        throw new Error(`Unexpected table ${table}`);
      }),
    };
    mockCreateAdminClient.mockReturnValue(mockAdmin);

    const mockSupabase = {
      from: vi.fn((table: string) => {
        if (table === 'sites') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                id: 'site-123',
                phone: '(248) 555-0199',
                content: { phonePublic: false },
                subdomain: 'brokepipes',
              },
            }),
            update: updateSpy,
          } as unknown as Site;
        }
        throw new Error(`Unexpected table ${table}`);
      }),
    } as unknown as Site;

    mockRequireOfficeContext.mockResolvedValue({
      supabase: mockSupabase,
      accountId: 'acc-123',
    });

    const result = await toggleWebsitePhoneFunnelAction(true);

    expect(result.success).toBe(true);
    expect(result.phonePublic).toBe(true);
    expect(result.phone).toBe('(810) 320-2687');
    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        phone: '(810) 320-2687',
        content: expect.objectContaining({
          phonePublic: true,
          originalPhone: '(248) 555-0199',
        }),
      })
    );
  });

  it('restores contractor original phone when switching from phone funnel back to forms funnel', async () => {
    const updateSpy = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    });

    const mockSupabase = {
      from: vi.fn((table: string) => {
        if (table === 'sites') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                id: 'site-123',
                phone: '(810) 320-2687',
                content: { phonePublic: true, originalPhone: '(248) 555-0199' },
                subdomain: 'brokepipes',
              },
            }),
            update: updateSpy,
          } as unknown as Site;
        }
        throw new Error(`Unexpected table ${table}`);
      }),
    } as unknown as Site;

    mockRequireOfficeContext.mockResolvedValue({
      supabase: mockSupabase,
      accountId: 'acc-123',
    });

    const result = await toggleWebsitePhoneFunnelAction(false);

    expect(result.success).toBe(true);
    expect(result.phonePublic).toBe(false);
    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        phone: '(248) 555-0199',
        content: expect.objectContaining({
          phonePublic: false,
          originalPhone: '(248) 555-0199',
        }),
      })
    );
  });

  it('rejects activating phone funnel when voice entitlement is missing', async () => {
    mockLoadVoiceEntitlement.mockResolvedValue({ available: true, enabled: false });

    mockRequireOfficeContext.mockResolvedValue({
      supabase: {
        from: () => ({
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 's1', content: {} } }) }) }),
        }),
      },
      accountId: 'acc-123',
    });

    await expect(toggleWebsitePhoneFunnelAction(true)).rejects.toThrow(
      'AI Voice is not included in this workspace or an active add-on.'
    );
  });

  it('rejects activating phone funnel when voice settings status is not active', async () => {
    mockLoadVoiceEntitlement.mockResolvedValue({ available: true, enabled: true });
    mockCreateAdminClient.mockReturnValue({
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { status: 'paused' } }) }) }),
      }),
    });

    mockRequireOfficeContext.mockResolvedValue({
      supabase: {
        from: () => ({
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 's1', content: {} } }) }) }),
        }),
      },
      accountId: 'acc-123',
    });

    await expect(toggleWebsitePhoneFunnelAction(true)).rejects.toThrow(
      'AI Voice must be active before publishing the number on your website.'
    );
  });

  it('never falls back to alert_phone when dedicated number is missing', async () => {
    mockLoadVoiceEntitlement.mockResolvedValue({ available: true, enabled: true });
    mockLoadVoiceRouteReadiness.mockResolvedValue({ kind: 'ready' });

    mockCreateAdminClient.mockReturnValue({
      from: (table: string) => {
        if (table === 'voice_settings') {
          return {
            select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { status: 'active' } }) }) }),
          };
        }
        if (table === 'accounts') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { call_tracking_number: null, alert_phone: '+12485550199' },
                }),
              }),
            }),
          };
        }
        throw new Error(`Unexpected table ${table}`);
      },
    });

    mockRequireOfficeContext.mockResolvedValue({
      supabase: {
        from: () => ({
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 's1', content: {} } }) }) }),
        }),
      },
      accountId: 'acc-123',
    });

    await expect(toggleWebsitePhoneFunnelAction(true)).rejects.toThrow(
      'No dedicated AI Voice phone number configured for this workspace.'
    );
  });
});
