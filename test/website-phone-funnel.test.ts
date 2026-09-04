import { describe, expect, it, vi } from 'vitest';
import { withPublicContact, type Site } from '@/lib/sites';
import { toggleWebsitePhoneFunnelAction } from '@/app/dashboard/voice-calls/actions';

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

const mockRequireOfficeContext = vi.fn();
vi.mock('@/lib/auth', () => ({
  requireOfficeContext: (...args: unknown[]) => mockRequireOfficeContext(...args),
  createAdminClient: vi.fn(),
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

  it('updates sites row with phonePublic: true and dedicated AI number when switching to phone funnel', async () => {
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
                phone: null,
                content: { phonePublic: false },
                subdomain: 'brokepipes',
              },
            }),
            update: updateSpy,
          } as unknown as Site;
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
        }),
      })
    );
  });
});
