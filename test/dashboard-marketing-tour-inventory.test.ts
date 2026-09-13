import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mocks, MockAiDraftsExhaustedError } = vi.hoisted(() => {
  class MockAiDraftsExhaustedError extends Error {
    constructor(message?: string) {
      super(message || 'Draft limit exhausted');
      this.name = 'AiDraftsExhaustedError';
    }
  }

  return {
    MockAiDraftsExhaustedError,
    mocks: {
      revalidatePath: vi.fn(),
  redirect: vi.fn((url: string) => {
    const err = new Error(`NEXT_REDIRECT:${url}`);
    (err as unknown as { digest: string }).digest = `NEXT_REDIRECT;replace;${url};307;;`;
    throw err;
  }),
  unstable_rethrow: vi.fn((err: unknown) => {
    if (err && typeof err === 'object' && 'digest' in err) throw err;
  }),
  requireOfficeContext: vi.fn(),
  requireOfficeContextAny: vi.fn(),
  requireDashboardShellContext: vi.fn(),
  createAdminClient: vi.fn(),
  checkRateLimit: vi.fn(() => Promise.resolve(true)),
  // Blog
  draftBlogPost: vi.fn(),
  uploadSiteImage: vi.fn(),
  pickBlogCover: vi.fn(() => Promise.resolve('https://cdn.example.com/cover.jpg')),
  saveBlogPosts: vi.fn(),
  uniqueBlogSlug: vi.fn((title: string) => title.toLowerCase().replace(/\s+/g, '-')),
  getSiteContent: vi.fn((content: any) => ({
    trade: content?.trade || 'Roofing',
    blog: content?.blog || { enabled: true, posts: [] },
  })),
  mergeSiteContent: vi.fn((base: any, updates: any) => ({ ...base, ...updates })),
  slugifyBlogTitle: vi.fn((s: string) => s.toLowerCase().replace(/\s+/g, '-')),
  // Marketing
  pickBusinessName: vi.fn(() => 'Apex Contracting'),
  draftMarketing: vi.fn(),
  campaignDraftForBeat: vi.fn(),
  sendCampaign: vi.fn(),
  requireActiveDedicatedMessagingSender: vi.fn(),
  sendCampaignEmail: vi.fn(),
  renderCampaignEmailHtml: vi.fn(() => '<html><body>Campaign Preview</body></html>'),
  readCampaign: vi.fn((): Promise<any[]> => Promise.resolve([])),
  buildCalendarView: vi.fn(),
  normalizeEmailTheme: vi.fn((t: string) => t || 'studio'),
  loadEmailBrand: vi.fn(() => Promise.resolve({ replyTo: 'support@apex.com', theme: 'studio' })),
  getSampleEmailPreview: vi.fn(() => Promise.resolve({
    from: 'Apex <hello@apex.com>',
    subject: 'Sample Subject',
    html: '<p>Sample</p>',
    replyTo: 'support@apex.com',
  })),
  resendSend: vi.fn(() => Promise.resolve({ data: { id: 'email-resend-1' }, error: null })),
  // Tour
  getTourDefinition: vi.fn(),
  getStepById: vi.fn(),
  filterStepsForUser: vi.fn(),
  sanitizeTourEventPayload: vi.fn((p?: any): { valid: boolean; sanitized?: any; error?: string } => ({ valid: true, sanitized: p })),
  // Inventory
  loadInventoryData: vi.fn(),
  seedInitialInventory: vi.fn(),
  saveTool: vi.fn(),
  deleteTool: vi.fn(),
  checkOutToolDb: vi.fn(),
  checkInToolDb: vi.fn(),
  transferToolDb: vi.fn(),
  saveVehicle: vi.fn(),
  deleteVehicle: vi.fn(),
  updateVehicleMileage: vi.fn(),
  saveStockItem: vi.fn(),
  deleteStockItem: vi.fn(),
  adjustStockQuantity: vi.fn(),
  transferStock: vi.fn(),
  applyVanKitTemplate: vi.fn(),
  saveMaintenanceRecord: vi.fn(),
  saveLocation: vi.fn(),
  deleteLocation: vi.fn(),
  uploadToolPhoto: vi.fn(),
  parseStoreProductUrl: vi.fn(),
  searchStoreCatalog: vi.fn(),
  },
};
});

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}));

vi.mock('next/navigation', () => ({
  redirect: mocks.redirect,
  unstable_rethrow: mocks.unstable_rethrow,
}));

vi.mock('@/lib/auth', () => ({
  requireOfficeContext: mocks.requireOfficeContext,
  requireOfficeContextAny: mocks.requireOfficeContextAny,
  requireDashboardShellContext: mocks.requireDashboardShellContext,
  createAdminClient: mocks.createAdminClient,
}));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: mocks.checkRateLimit,
}));

vi.mock('@/lib/blog-generate', () => ({
  draftBlogPost: mocks.draftBlogPost,
}));

vi.mock('@/lib/site-image-storage', () => ({
  uploadSiteImage: mocks.uploadSiteImage,
}));

vi.mock('@/app/dashboard/sites/actions', () => ({
  pickBlogCover: mocks.pickBlogCover,
}));

vi.mock('@/lib/site-blog', () => ({
  saveBlogPosts: mocks.saveBlogPosts,
  uniqueBlogSlug: mocks.uniqueBlogSlug,
}));

vi.mock('@/lib/site-content', () => ({
  getSiteContent: mocks.getSiteContent,
  mergeSiteContent: mocks.mergeSiteContent,
  slugifyBlogTitle: mocks.slugifyBlogTitle,
}));

vi.mock('@/lib/business-name', () => ({
  pickBusinessName: mocks.pickBusinessName,
}));

vi.mock('@/lib/marketing-calendar', () => ({
  BEATS: [
    {
      id: 'spring-gutter',
      title: 'Spring Gutter Cleaning',
      whyNow: 'Clear winter debris before rain',
      channels: ['email', 'blog'],
      trades: ['roofing', 'gutters'],
      audience: 'all',
      monthsByZone: { temperate: [3, 4] },
    },
    {
      id: 'email-only-beat',
      title: 'Quick Email Check-In',
      whyNow: 'Stay top of mind',
      channels: ['email'],
      trades: ['general'],
      audience: 'past',
      monthsByZone: { temperate: [5] },
    },
  ],
  climateZoneForState: vi.fn(() => 'temperate'),
  stateFromAddress: vi.fn(() => 'MI'),
}));

vi.mock('@/lib/marketing-draft', () => ({
  draftMarketing: mocks.draftMarketing,
}));

vi.mock('@/lib/ai-model-call', () => ({
  AiDraftsExhaustedError: MockAiDraftsExhaustedError,
}));

vi.mock('@/lib/marketing-draft-data', () => ({
  campaignDraftForBeat: mocks.campaignDraftForBeat,
}));

vi.mock('@/lib/campaigns', () => ({
  sendCampaign: mocks.sendCampaign,
}));

vi.mock('@/lib/messaging-number-provisioning', () => ({
  requireActiveDedicatedMessagingSender: mocks.requireActiveDedicatedMessagingSender,
}));

vi.mock('@/lib/email', () => ({
  sendCampaignEmail: mocks.sendCampaignEmail,
  renderCampaignEmailHtml: mocks.renderCampaignEmailHtml,
}));

vi.mock('@/lib/campaign-guard-ai', () => ({
  readCampaign: mocks.readCampaign,
}));

vi.mock('@/lib/marketing-calendar-data', () => ({
  buildCalendarView: mocks.buildCalendarView,
}));

vi.mock('@/emails/brand', () => ({
  EMAIL_THEMES: [
    { id: 'studio', name: 'Studio Clean' },
    { id: 'bold', name: 'Bold Modern' },
    { id: 'classic', name: 'Classic Pro' },
  ],
  normalizeEmailTheme: mocks.normalizeEmailTheme,
}));

vi.mock('@/lib/email-brand', () => ({
  loadEmailBrand: mocks.loadEmailBrand,
}));

vi.mock('@/lib/email-previews', () => ({
  getSampleEmailPreview: mocks.getSampleEmailPreview,
}));

vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: {
      send: mocks.resendSend,
    },
  })),
}));

vi.mock('@/lib/product-tour/catalog', () => ({
  getTourDefinition: mocks.getTourDefinition,
  getStepById: mocks.getStepById,
  filterStepsForUser: mocks.filterStepsForUser,
}));

vi.mock('@/lib/product-tour/events', () => ({
  sanitizeTourEventPayload: mocks.sanitizeTourEventPayload,
}));

vi.mock('@/lib/inventory-db', () => ({
  loadInventoryData: mocks.loadInventoryData,
  seedInitialInventory: mocks.seedInitialInventory,
  saveTool: mocks.saveTool,
  deleteTool: mocks.deleteTool,
  saveVehicle: mocks.saveVehicle,
  deleteVehicle: mocks.deleteVehicle,
  saveStockItem: mocks.saveStockItem,
  deleteStockItem: mocks.deleteStockItem,
  adjustStockQuantity: mocks.adjustStockQuantity,
  transferStock: mocks.transferStock,
  saveMaintenanceRecord: mocks.saveMaintenanceRecord,
  saveLocation: mocks.saveLocation,
  deleteLocation: mocks.deleteLocation,
  checkOutToolDb: mocks.checkOutToolDb,
  checkInToolDb: mocks.checkInToolDb,
  transferToolDb: mocks.transferToolDb,
  updateVehicleMileage: mocks.updateVehicleMileage,
  applyVanKitTemplate: mocks.applyVanKitTemplate,
}));

vi.mock('@/lib/tool-photo-storage', () => ({
  uploadToolPhoto: mocks.uploadToolPhoto,
}));

vi.mock('@/lib/store-autofill', () => ({
  parseStoreProductUrl: mocks.parseStoreProductUrl,
  searchStoreCatalog: mocks.searchStoreCatalog,
}));

import {
  createBlogPostAction,
  updateBlogPostAction,
  deleteBlogPostAction,
  duplicateBlogPostAction,
  bulkUpdateBlogPostsAction,
  setBlogReminderAction,
  generateBlogPostAction,
  uploadBlogCoverAction,
} from '@/app/dashboard/marketing/blog/actions';

import {
  updateEmailThemeAction,
  sendTestEmailThemeAction,
  marketingCalendarAction,
  draftMarketingAction,
  campaignDraftForBeatAction,
  createBlogPostFromBeatAction,
  sendCampaignAction,
  sendTestEmailAction,
  previewCampaignEmailAction,
  readCampaignAction,
  draftMarketingCampaignAction,
} from '@/app/dashboard/marketing/actions';

import {
  loadTourProgressAction,
  startTourAction,
  advanceTourAction,
  dismissTourAction,
  completeTourAction,
  restartTourAction,
  recordTourEventAction,
} from '@/app/dashboard/tour-actions';

import {
  fetchInventoryDataAction,
  seedStarterInventoryAction,
  saveToolAction,
  deleteToolAction,
  checkOutToolAction,
  bulkCheckOutToolsAction,
  checkInToolAction,
  transferToolAction,
  saveVehicleAction,
  deleteVehicleAction,
  updateVehicleMileageAction,
  saveStockItemAction,
  deleteStockItemAction,
  adjustStockQuantityAction,
  transferStockAction,
  applyVanKitTemplateAction,
  saveMaintenanceRecordAction,
  saveLocationAction,
  deleteLocationAction,
  uploadToolPhotoAction,
  autofillToolFromStoreAction,
  searchStoreCatalogAction,
  checkSearchRateLimit,
} from '@/app/dashboard/inventory/actions';

function createMockSupabase(initialData: Record<string, any> = {}) {
  const store: Record<string, any> = { ...initialData };

  const chainable = (result: any = { data: null, error: null }) => {
    const chain: any = {
      select: vi.fn(() => chain),
      insert: vi.fn(() => chain),
      update: vi.fn(() => chain),
      upsert: vi.fn(() => chain),
      delete: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      neq: vi.fn(() => chain),
      in: vi.fn(() => chain),
      is: vi.fn(() => chain),
      limit: vi.fn(() => chain),
      single: vi.fn(() =>
        Promise.resolve({
          data: Array.isArray(result?.data) ? result.data[0] ?? null : result?.data ?? null,
          error: result?.error ?? null,
        }),
      ),
      maybeSingle: vi.fn(() =>
        Promise.resolve({
          data: Array.isArray(result?.data) ? result.data[0] ?? null : result?.data ?? null,
          error: result?.error ?? null,
        }),
      ),
      then: (resolve: (val: any) => any) => Promise.resolve(result).then(resolve),
    };
    return chain;
  };

  return {
    from: vi.fn((table: string) => {
      if (store[table]) return chainable(store[table]);
      return chainable({ data: [], error: null });
    }),
    auth: {
      getUser: vi.fn(() => Promise.resolve({ data: { user: { id: 'usr-1', email: 'owner@example.com' } }, error: null })),
    },
  };
}

describe('Group 2: Marketing Blog, Marketing Actions, Tours, and Inventory Server Actions', () => {
  const accountId = 'acc-mktg-101';
  const userId = 'usr-mktg-101';

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.RESEND_API_KEY = 're_test_key_123';
    process.env.NEXT_PUBLIC_APP_URL = 'https://apex.app';
    mocks.createAdminClient.mockReturnValue(createMockSupabase());
  });

  // =========================================================================
  // 1. BLOG ACTIONS
  // =========================================================================
  describe('Marketing Blog Actions', () => {
    it('createBlogPostAction appends draft post to site blog', async () => {
      const mockDb = createMockSupabase();
      mocks.requireOfficeContext.mockResolvedValue({ supabase: mockDb, accountId });
      mocks.saveBlogPosts.mockImplementation(async (_db, _aid, updater) => updater([]));

      const posts = await createBlogPostAction();
      expect(posts).toHaveLength(1);
      expect(posts[0]).toMatchObject({
        status: 'draft',
        coverImage: '',
      });
      expect(mocks.revalidatePath).toHaveBeenCalledWith('/dashboard/marketing/blog');
    });

    it('updateBlogPostAction edits title, slug, publishing date, and archiving', async () => {
      const mockDb = createMockSupabase();
      mocks.requireOfficeContext.mockResolvedValue({ supabase: mockDb, accountId });

      const existingPost = {
        id: 'post-1',
        title: 'Roof Repair Tips',
        slug: 'post-1',
        status: 'draft' as const,
        excerpt: 'Old excerpt',
        body: 'Old body',
        publishAt: '2026-10-01',
      };
      mocks.saveBlogPosts.mockImplementation(async (_db, _aid, updater) => updater([existingPost]));

      // Update title, re-slugs, and publish status
      const updated = await updateBlogPostAction('post-1', {
        title: 'Complete Roof Guide',
        status: 'published',
        publishAt: '2026-10-10', // Should be cleared because published
      });

      expect(updated[0]).toMatchObject({
        id: 'post-1',
        title: 'Complete Roof Guide',
        status: 'published',
        publishAt: '',
      });
    });

    it('deleteBlogPostAction and duplicateBlogPostAction manage posts', async () => {
      const mockDb = createMockSupabase();
      mocks.requireOfficeContext.mockResolvedValue({ supabase: mockDb, accountId });

      const postsList = [
        { id: 'post-1', title: 'First Post', status: 'draft' as const },
        { id: 'post-2', title: 'Second Post', status: 'published' as const },
      ];

      // Delete
      mocks.saveBlogPosts.mockImplementation(async (_db, _aid, updater) => updater(postsList));
      const afterDelete = await deleteBlogPostAction('post-1');
      expect(afterDelete).toHaveLength(1);
      expect(afterDelete[0].id).toBe('post-2');

      // Duplicate
      const afterDup = await duplicateBlogPostAction('post-2');
      expect(afterDup).toHaveLength(3);
      expect(afterDup[0].title).toBe('Second Post (Copy)');
    });

    it('bulkUpdateBlogPostsAction publishes, archives, and deletes multiple posts', async () => {
      const mockDb = createMockSupabase();
      mocks.requireOfficeContext.mockResolvedValue({ supabase: mockDb, accountId });

      const initial = [
        { id: 'p1', status: 'draft' as const },
        { id: 'p2', status: 'draft' as const },
        { id: 'p3', status: 'published' as const },
      ];

      // Bulk publish
      mocks.saveBlogPosts.mockImplementation(async (_db, _aid, updater) => updater(initial));
      const pubRes = await bulkUpdateBlogPostsAction(['p1', 'p2'], 'publish');
      expect(pubRes.find((p) => p.id === 'p1')?.status).toBe('published');

      // Bulk archive
      const archRes = await bulkUpdateBlogPostsAction(['p3'], 'archive');
      expect(archRes.find((p) => p.id === 'p3')?.status).toBe('archived');

      // Bulk delete
      const delRes = await bulkUpdateBlogPostsAction(['p1'], 'delete');
      expect(delRes.find((p) => p.id === 'p1')).toBeUndefined();
    });

    it('setBlogReminderAction sets reminder cadence', async () => {
      const mockDb = createMockSupabase();
      mocks.requireOfficeContext.mockResolvedValue({ supabase: mockDb, accountId });

      await setBlogReminderAction(4);
      expect(mocks.saveBlogPosts).toHaveBeenCalledWith(mockDb, accountId, expect.any(Function), { reminderWeeks: 4 });
      expect(mocks.revalidatePath).toHaveBeenCalledWith('/dashboard/marketing/blog');
    });

    it('generateBlogPostAction drafts post with AI, applies cover photo, and respects rate limit', async () => {
      const mockDb = createMockSupabase({
        sites: {
          data: {
            company_name: 'Apex Roofers',
            service_area: 'Detroit Metro',
            content: { trade: 'Roofing' },
          },
        },
      });
      mocks.requireOfficeContext.mockResolvedValue({ supabase: mockDb, accountId });

      // Rate limit hit
      mocks.checkRateLimit.mockResolvedValueOnce(false);
      const rlRes = await generateBlogPostAction('Winter maintenance');
      expect(rlRes).toEqual({ ok: false, message: expect.stringContaining('AI generation limit') });

      // Successful draft & save
      mocks.draftBlogPost.mockResolvedValue({
        title: 'Preparing Your Roof for Snow',
        excerpt: 'Key winterizing advice',
        body: 'Full post text',
        trade: 'Roofing',
      });
      mocks.saveBlogPosts.mockImplementation(async (_db, _aid, updater) => updater([]));

      const genRes = await generateBlogPostAction('Winter maintenance', false);
      expect(genRes).toMatchObject({
        ok: true,
        title: 'Preparing Your Roof for Snow',
      });
      expect(mocks.pickBlogCover).toHaveBeenCalled();
    });

    it('uploadBlogCoverAction uploads image and updates post cover', async () => {
      const mockDb = createMockSupabase();
      mocks.requireOfficeContext.mockResolvedValue({ supabase: mockDb, accountId });
      mocks.uploadSiteImage.mockResolvedValue({ url: 'https://cdn.example.com/uploaded.jpg' });
      mocks.saveBlogPosts.mockImplementation(async (_db, _aid, updater) =>
        updater([{ id: 'p-cover', coverImage: '' }]),
      );

      const form = new FormData();
      form.set('image', new File(['img-bytes'], 'cover.png', { type: 'image/png' }));

      const res = await uploadBlogCoverAction('p-cover', form);
      expect(res[0].coverImage).toBe('https://cdn.example.com/uploaded.jpg');
    });
  });

  // =========================================================================
  // 2. MARKETING ACTIONS
  // =========================================================================
  describe('Marketing Campaign & Calendar Actions', () => {
    it('updateEmailThemeAction validates theme and updates sites table', async () => {
      const mockDb = createMockSupabase({ sites: { data: { id: 'site-1' } } });
      mocks.requireOfficeContext.mockResolvedValue({ supabase: mockDb, accountId });

      // Invalid theme throws
      const badForm = new FormData();
      badForm.set('emailTheme', 'invalid-theme-xyz');
      await expect(updateEmailThemeAction(badForm)).rejects.toThrow('Choose one of the available email themes.');

      // Valid theme
      const goodForm = new FormData();
      goodForm.set('emailTheme', 'bold');
      await updateEmailThemeAction(goodForm);
      expect(mocks.revalidatePath).toHaveBeenCalledWith('/dashboard/marketing/email-theme');
    });

    it('sendTestEmailThemeAction sends styled test email via Resend', async () => {
      const mockDb = createMockSupabase();
      mocks.requireOfficeContext.mockResolvedValue({ supabase: mockDb, accountId });

      const form = new FormData();
      form.set('emailTheme', 'studio');
      form.set('previewKind', 'quote');

      const res = await sendTestEmailThemeAction(form);
      expect(res).toEqual({ success: true, recipient: 'owner@example.com' });
      expect(mocks.resendSend).toHaveBeenCalled();
    });

    it('marketingCalendarAction and campaignDraftForBeatAction load drafts and calendar', async () => {
      const mockDb = createMockSupabase();
      mocks.requireOfficeContext.mockResolvedValue({ supabase: mockDb, accountId });
      mocks.buildCalendarView.mockResolvedValue({ months: [] });
      mocks.campaignDraftForBeat.mockResolvedValue({ subject: 'Spring Cleaning', body: 'Schedule now.' });

      const cal = await marketingCalendarAction(4);
      expect(cal).toEqual({ months: [] });

      const draft = await campaignDraftForBeatAction('spring-gutter');
      expect(draft).toEqual({ subject: 'Spring Cleaning', body: 'Schedule now.' });
    });

    it('draftMarketingAction handles exhausted AI errors and valid drafts', async () => {
      const mockDb = createMockSupabase({
        accounts: { data: { business_name: 'Apex Pro', mailing_address: '123 Main St, Detroit MI' } },
        sites: { data: { company_name: 'Apex Pro', service_area: 'Detroit MI', content: { trade: 'Roofing' } } },
      });
      mocks.requireOfficeContext.mockResolvedValue({ supabase: mockDb, accountId });

      // Unknown beat
      const notFound = await draftMarketingAction('unknown-beat', 'email');
      expect(notFound).toEqual({ ok: false, message: 'That topic could not be found.' });

      // Exhausted AI error
      mocks.draftMarketing.mockRejectedValueOnce(new MockAiDraftsExhaustedError('All AI quotas consumed'));
      const exhausted = await draftMarketingAction('spring-gutter', 'email');
      expect(exhausted).toEqual({ ok: false, message: 'All AI quotas consumed' });

      // Successful draft
      mocks.draftMarketing.mockResolvedValueOnce({
        subject: 'Protect your roof this spring',
        body: 'Clear gutters prevent roof damage.',
      });
      const success = await draftMarketingAction('spring-gutter', 'email');
      expect(success).toMatchObject({
        ok: true,
        draft: { subject: 'Protect your roof this spring' },
      });
    });

    it('createBlogPostFromBeatAction creates and appends blog post from seasonal beat', async () => {
      const mockDb = createMockSupabase({
        sites: {
          data: {
            id: 'site-beat',
            company_name: 'Apex Pro',
            service_area: 'Detroit',
            content: { trade: 'Roofing', blog: { enabled: true, posts: [] } },
          },
        },
      });
      mocks.requireOfficeContext.mockResolvedValue({ supabase: mockDb, accountId });
      mocks.draftBlogPost.mockResolvedValue({
        title: 'Spring Gutter Cleaning Guide',
        excerpt: 'Why spring gutters matter',
        body: 'Post content here',
        trade: 'Roofing',
      });

      // Beat not configured for blog
      const nonBlogRes = await createBlogPostFromBeatAction('email-only-beat');
      expect(nonBlogRes).toEqual({ ok: false, message: 'That topic is written as an email, not a post.' });

      // Valid blog beat
      const res = await createBlogPostFromBeatAction('spring-gutter');
      expect(res).toMatchObject({
        ok: true,
        title: 'Spring Gutter Cleaning Guide',
      });
      expect(mocks.revalidatePath).toHaveBeenCalledWith('/dashboard/sites');
    });

    it('sendCampaignAction validates CAN-SPAM mailing address and sends campaign', async () => {
      // Missing mailing address blocks send
      const noAddrDb = createMockSupabase({
        accounts: { data: { business_name: 'Apex', mailing_address: null } },
        sites: { data: { company_name: 'Apex' } },
      });
      mocks.requireOfficeContext.mockResolvedValue({ supabase: noAddrDb, accountId });

      const form = new FormData();
      form.set('channel', 'email');
      form.set('audience', 'all');
      form.set('subject', 'Seasonal Special');
      form.set('body', 'Call us for a spring quote!');

      await expect(sendCampaignAction(form)).rejects.toThrow('Add your business mailing address in Settings');

      // Valid send with referral link placeholder
      const readyDb = createMockSupabase({
        accounts: { data: { business_name: 'Apex', mailing_address: '100 Main St, Royal Oak MI', referral_reward: '$50 Off' } },
        sites: { data: { company_name: 'Apex', published: true, subdomain: 'apex-roofs' } },
      });
      mocks.requireOfficeContext.mockResolvedValue({ supabase: readyDb, accountId });
      mocks.sendCampaign.mockResolvedValue({
        emailSent: 15,
        smsQueued: 0,
        recipientCount: 15,
        skipped: 0,
        failed: 0,
      });

      form.set('body', 'Book here: {referral_link}');
      await expect(sendCampaignAction(form)).rejects.toThrow('NEXT_REDIRECT:/dashboard/marketing/campaigns?emailSent=15&smsQueued=0&recipients=15&skipped=0&failed=0');
      expect(mocks.sendCampaign).toHaveBeenCalled();
    });

    it('sendTestEmailAction and previewCampaignEmailAction test email rendering', async () => {
      const mockDb = createMockSupabase({
        accounts: { data: { business_name: 'Apex Pro', mailing_address: '100 Main St' } },
        sites: { data: { company_name: 'Apex Pro' } },
      });
      mocks.requireOfficeContext.mockResolvedValue({ supabase: mockDb, accountId });

      // Preview
      const preview = await previewCampaignEmailAction('Subject Test', 'Body content here');
      expect(preview).toBe('<html><body>Campaign Preview</body></html>');

      // Send test email
      const form = new FormData();
      form.set('subject', 'Test Send');
      form.set('body', 'Test body');
      await expect(sendTestEmailAction(form)).rejects.toThrow('NEXT_REDIRECT:/dashboard/marketing/campaigns?test=1');
      expect(mocks.sendCampaignEmail).toHaveBeenCalled();
    });

    it('readCampaignAction and draftMarketingCampaignAction use campaign guard and AI generation', async () => {
      const mockDb = createMockSupabase({
        sites: { data: { company_name: 'Apex Pro', content: { trade: 'Roofing' } } },
        accounts: { data: { business_name: 'Apex Pro', billing_address: 'Detroit MI' } },
      });
      mocks.requireOfficeContext.mockResolvedValue({ supabase: mockDb, accountId });

      // Read campaign
      mocks.readCampaign.mockResolvedValue([{ ruleId: 'no_spam_all_caps', severity: 'warn', message: 'Avoid all caps' } as any]);
      const findings = await readCampaignAction({ channel: 'email', subject: 'HELLO', body: 'BOOK TODAY' });
      expect(findings).toHaveLength(1);

      // Draft marketing campaign
      mocks.draftMarketing.mockResolvedValue({ subject: 'Fall Gutter Check', body: 'Schedule an inspection.' });
      const draftRes = await draftMarketingCampaignAction({ channel: 'email', topic: 'Fall Gutter Check' });
      expect(draftRes).toMatchObject({
        ok: true,
        draft: { subject: 'Fall Gutter Check' },
      });
    });
  });

  // =========================================================================
  // 3. PRODUCT TOUR ACTIONS
  // =========================================================================
  describe('Product Tour Actions', () => {
    it('loadTourProgressAction loads user tour record', async () => {
      const mockDb = createMockSupabase({
        product_tour_progress: {
          data: {
            tour_key: 'onboarding_v1',
            tour_version: 1,
            status: 'active',
            current_step_id: 'step-1',
          },
        },
      });
      mocks.requireDashboardShellContext.mockResolvedValue({ supabase: mockDb, accountId, userId });

      const res = await loadTourProgressAction('onboarding_v1', 1);
      expect(res.success).toBe(true);
      expect(res.progress?.current_step_id).toBe('step-1');
    });

    it('startTourAction, advanceTourAction, dismissTourAction, completeTourAction, restartTourAction manage tour lifecycle', async () => {
      const mockDb = createMockSupabase();
      mocks.requireDashboardShellContext.mockResolvedValue({
        supabase: mockDb,
        accountId,
        userId,
        role: 'owner',
        capabilities: ['admin'],
      });

      const tourDef = {
        id: 'tour_welcome',
        version: 1,
        steps: [
          { id: 's1', route: '/dashboard' },
          { id: 's2', route: '/dashboard/jobs' },
        ],
      };
      mocks.getTourDefinition.mockReturnValue(tourDef);
      mocks.filterStepsForUser.mockReturnValue(tourDef.steps);
      mocks.getStepById.mockImplementation((_t, id) => tourDef.steps.find((s) => s.id === id));

      // Start tour
      const startRes = await startTourAction('tour_welcome', 1);
      expect(startRes.success).toBe(true);

      // Advance tour
      const advRes = await advanceTourAction('tour_welcome', 1, 's2');
      expect(advRes.success).toBe(true);

      // Dismiss tour
      const disRes = await dismissTourAction('tour_welcome', 1);
      expect(disRes.success).toBe(true);

      // Complete tour
      const compRes = await completeTourAction('tour_welcome', 1);
      expect(compRes.success).toBe(true);

      // Restart tour
      const restRes = await restartTourAction('tour_welcome', 1);
      expect(restRes.success).toBe(true);
    });

    it('recordTourEventAction sanitizes payload and records tour telemetry', async () => {
      const mockDb = createMockSupabase();
      mocks.requireDashboardShellContext.mockResolvedValue({ supabase: mockDb, accountId, userId, role: 'owner' });

      const res = await recordTourEventAction({ event_type: 'step_completed', tour_key: 'tour_welcome' });
      expect(res.success).toBe(true);
      expect(mocks.sanitizeTourEventPayload).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // 4. INVENTORY ACTIONS
  // =========================================================================
  describe('Inventory Actions', () => {
    it('fetchInventoryDataAction and seedStarterInventoryAction interact with db', async () => {
      const mockDb = createMockSupabase();
      mocks.requireOfficeContextAny.mockResolvedValue({ supabase: mockDb, accountId });
      mocks.loadInventoryData.mockResolvedValue({ tools: [], vehicles: [], stock: [] });
      mocks.seedInitialInventory.mockResolvedValue({ tools: [], vehicles: [], stock: [] });

      const data = await fetchInventoryDataAction();
      expect(data).toEqual({ tools: [], vehicles: [], stock: [] });

      const seeded = await seedStarterInventoryAction();
      expect(seeded).toEqual({ tools: [], vehicles: [], stock: [] });
    });

    it('saveToolAction and deleteToolAction sanitize inputs and persist', async () => {
      const mockDb = createMockSupabase();
      mocks.requireOfficeContextAny.mockResolvedValue({ supabase: mockDb, accountId, userId, role: 'owner', userEmail: 'op@apex.com' });
      mocks.saveTool.mockResolvedValue({ id: 'tool-1', name: 'DeWalt Drill' });

      const saved = await saveToolAction({ name: '  DeWalt Drill  ', brand: 'DeWalt', category: 'Power Tools' });
      expect(saved).toEqual({ id: 'tool-1', name: 'DeWalt Drill' });
      expect(mocks.saveTool).toHaveBeenCalledWith(
        mockDb,
        accountId,
        expect.objectContaining({ name: 'DeWalt Drill', brand: 'DeWalt' }),
      );

      await deleteToolAction('tool-1');
      expect(mocks.deleteTool).toHaveBeenCalledWith(mockDb, accountId, 'tool-1', expect.any(Object));
    });

    it('checkOutToolAction, bulkCheckOutToolsAction, checkInToolAction, transferToolAction manage tool custody', async () => {
      const mockDb = createMockSupabase();
      mocks.requireOfficeContextAny.mockResolvedValue({ supabase: mockDb, accountId, userEmail: 'dispatcher@apex.com' });

      mocks.checkOutToolDb.mockResolvedValue({ id: 'tool-1', status: 'checked_out' });
      mocks.checkInToolDb.mockResolvedValue({ id: 'tool-1', status: 'available' });
      mocks.transferToolDb.mockResolvedValue({ id: 'tool-1', assignedCrewName: 'Bob' });

      // Checkout single
      const checkedOut = await checkOutToolAction({ toolId: 'tool-1', crewName: 'Alice' });
      expect(checkedOut.status).toBe('checked_out');

      // Bulk checkout
      const bulkOut = await bulkCheckOutToolsAction({ toolIds: ['tool-1', 'tool-2'], crewName: 'Alice' });
      expect(bulkOut).toHaveLength(2);

      // Checkin
      const checkedIn = await checkInToolAction({ toolId: 'tool-1', condition: 'available' as any });
      expect(checkedIn.status).toBe('available');

      // Transfer
      const transferred = await transferToolAction({ toolId: 'tool-1', toCrewName: 'Bob' });
      expect(transferred.assignedCrewName).toBe('Bob');
    });

    it('saveVehicleAction, deleteVehicleAction, updateVehicleMileageAction manage fleet', async () => {
      const mockDb = createMockSupabase();
      mocks.requireOfficeContextAny.mockResolvedValue({ supabase: mockDb, accountId, userId, role: 'owner', userEmail: 'fleet@apex.com' });
      mocks.saveVehicle.mockResolvedValue({ id: 'veh-1', name: 'Van 1' });
      mocks.updateVehicleMileage.mockResolvedValue({ id: 'veh-1', currentMileage: 52000 });

      const savedVeh = await saveVehicleAction({ name: 'Van 1', make: 'Ford', model: 'Transit', licensePlate: 'abc-123' });
      expect(savedVeh.name).toBe('Van 1');
      expect(mocks.saveVehicle).toHaveBeenCalledWith(
        mockDb,
        accountId,
        expect.objectContaining({ licensePlate: 'ABC-123' }),
      );

      const updatedMileage = await updateVehicleMileageAction({ vehicleId: 'veh-1', currentMileage: 52000 });
      expect(updatedMileage.currentMileage).toBe(52000);

      await deleteVehicleAction('veh-1');
      expect(mocks.deleteVehicle).toHaveBeenCalledWith(mockDb, accountId, 'veh-1', expect.any(Object));
    });

    it('saveStockItemAction, deleteStockItemAction, adjustStockQuantityAction, transferStockAction manage materials', async () => {
      const mockDb = createMockSupabase();
      mocks.requireOfficeContextAny.mockResolvedValue({ supabase: mockDb, accountId, userId, role: 'owner', userEmail: 'warehouse@apex.com' });
      mocks.saveStockItem.mockResolvedValue({ id: 'stock-1', sku: 'PIPE-12' });
      mocks.adjustStockQuantity.mockResolvedValue({ id: 'stock-1', quantityOnHand: 25 });
      mocks.transferStock.mockResolvedValue({
        transfer: { id: 'xfer-1' } as any,
        sourceStock: { id: 'stock-1', quantityOnHand: 20 } as any,
      });

      const savedStock = await saveStockItemAction({
        name: 'PVC Pipe 1/2"',
        sku: 'pipe-12',
        category: 'Plumbing',
        location: 'Main Warehouse',
      });
      expect(savedStock.sku).toBe('PIPE-12');

      const adjusted = await adjustStockQuantityAction({ stockId: 'stock-1', delta: 5, reason: 'Restock' });
      expect(adjusted.quantityOnHand).toBe(25);

      const xfer = await transferStockAction({
        stockId: 'stock-1',
        fromLocation: 'Warehouse',
        toLocation: 'Van 1',
        quantity: 5,
      });
      expect(xfer.transfer.id).toBe('xfer-1');

      await deleteStockItemAction('stock-1');
      expect(mocks.deleteStockItem).toHaveBeenCalledWith(mockDb, accountId, 'stock-1', expect.any(Object));
    });

    it('applyVanKitTemplateAction, saveMaintenanceRecordAction, saveLocationAction, deleteLocationAction work as expected', async () => {
      const mockDb = createMockSupabase();
      mocks.requireOfficeContextAny.mockResolvedValue({ supabase: mockDb, accountId, userId, role: 'owner', userEmail: 'mgr@apex.com' });
      mocks.applyVanKitTemplate.mockResolvedValue([{ id: 'stock-kit-1' } as any]);
      mocks.saveMaintenanceRecord.mockResolvedValue({ id: 'maint-1' } as any);
      mocks.saveLocation.mockResolvedValue({ id: 'loc-1', name: 'North Depot' } as any);

      const kit = await applyVanKitTemplateAction({ templateId: 'plumbing-kit', targetLocation: 'Van 2' });
      expect(kit).toHaveLength(1);

      const maint = await saveMaintenanceRecordAction({
        assetType: 'vehicle',
        assetId: 'veh-1',
        assetName: 'Van 1',
        serviceType: 'Oil Change',
        cost: 85,
        performedBy: 'Jiffy Lube',
        performedAt: '2026-09-01',
      });
      expect(maint.id).toBe('maint-1');

      const loc = await saveLocationAction({ name: 'North Depot', type: 'warehouse' });
      expect(loc.name).toBe('North Depot');

      await deleteLocationAction('loc-1');
      expect(mocks.deleteLocation).toHaveBeenCalledWith(mockDb, accountId, 'loc-1', expect.any(Object));
    });

    it('uploadToolPhotoAction, store autofill, and search rate limiting operate correctly', async () => {
      mocks.requireOfficeContextAny.mockResolvedValue({ accountId });
      mocks.uploadToolPhoto.mockResolvedValue('https://cdn.example.com/tool.jpg');
      mocks.parseStoreProductUrl.mockResolvedValue({ name: 'Cordless Saw', price: 199 });
      mocks.searchStoreCatalog.mockResolvedValue([{ title: 'Saw Blade' }]);

      // Upload photo
      const form = new FormData();
      form.set('toolId', 'tool-55');
      form.set('photo', new File(['toolimg'], 'saw.jpg', { type: 'image/jpeg' }));
      const photoRes = await uploadToolPhotoAction(form);
      expect(photoRes.url).toBe('https://cdn.example.com/tool.jpg');

      // Autofill
      const autofill = await autofillToolFromStoreAction('https://homedepot.com/p/12345');
      expect(autofill).toEqual({ name: 'Cordless Saw', price: 199 });

      // Search catalog
      const searchRes = await searchStoreCatalogAction('dewalt saw');
      expect(searchRes).toHaveLength(1);

      // CheckSearchRateLimit enforces rate limit
      for (let i = 0; i < 29; i++) {
        await checkSearchRateLimit('test-caller', 30, 60000);
      }
      await checkSearchRateLimit('test-caller', 30, 60000); // 30th succeeds
      await expect(checkSearchRateLimit('test-caller', 30, 60000)).rejects.toThrow('Search catalog rate limit exceeded');
    });

    it('inventory actions validate mandatory identifiers and payloads', async () => {
      mocks.requireOfficeContextAny.mockResolvedValue({ accountId, userEmail: 'me@apex.com' });

      await expect(deleteToolAction('')).rejects.toThrow('Tool ID is required');
      await expect(checkOutToolAction({ toolId: '', crewName: 'Alice' })).rejects.toThrow('Tool ID is required');
      await expect(checkOutToolAction({ toolId: 't-1', crewName: '' })).rejects.toThrow('Crew assignment is required');
      await expect(bulkCheckOutToolsAction({ toolIds: [], crewName: 'Alice' })).rejects.toThrow('No tools selected');
      await expect(checkInToolAction({ toolId: '' })).rejects.toThrow('Tool ID is required');
      await expect(transferToolAction({ toolId: '', toCrewName: 'Bob' })).rejects.toThrow('Tool ID is required');
      await expect(deleteVehicleAction('')).rejects.toThrow('Vehicle ID is required');
      await expect(updateVehicleMileageAction({ vehicleId: '', currentMileage: 100 })).rejects.toThrow('Vehicle ID is required');
      await expect(deleteStockItemAction('')).rejects.toThrow('Stock ID is required');
      await expect(adjustStockQuantityAction({ stockId: '', delta: 1 })).rejects.toThrow('Stock ID is required');
      await expect(transferStockAction({ stockId: '', fromLocation: 'A', toLocation: 'B', quantity: 1 })).rejects.toThrow('Stock ID is required');
      await expect(applyVanKitTemplateAction({ templateId: '', targetLocation: 'Van 1' })).rejects.toThrow('Template ID is required');
      await expect(deleteLocationAction('')).rejects.toThrow('Location ID is required');
      await expect(uploadToolPhotoAction(new FormData())).rejects.toThrow('No valid photo file was provided.');
    });
  });

  describe('Group 2 Additional Error & Edge Case Branches', () => {
    it('createBlogPostAction enforces MAX_POSTS limit', async () => {
      const mockDb = createMockSupabase();
      mocks.requireOfficeContext.mockResolvedValue({ supabase: mockDb, accountId });

      const fullList = Array.from({ length: 60 }, (_, i) => ({ id: `p-${i}` } as any));
      mocks.saveBlogPosts.mockImplementation(async (_db, _aid, updater) => updater(fullList));

      await expect(createBlogPostAction()).rejects.toThrow('You can keep up to 60 posts.');
    });

    it('sendCampaignAction validates channels, audiences, and SMS dedicated sender', async () => {
      const mockDb = createMockSupabase({
        accounts: { data: { business_name: 'Apex', mailing_address: '100 Main' } },
        sites: { data: { company_name: 'Apex' } },
      });
      mocks.requireOfficeContext.mockResolvedValue({ supabase: mockDb, accountId });

      const form = new FormData();
      form.set('channel', 'invalid_channel');
      await expect(sendCampaignAction(form)).rejects.toThrow('Pick how you want to reach people.');

      form.set('channel', 'email');
      form.set('audience', 'invalid_audience');
      await expect(sendCampaignAction(form)).rejects.toThrow('Pick who this goes to.');

      form.set('audience', 'all');
      form.set('body', '');
      await expect(sendCampaignAction(form)).rejects.toThrow('Write a message before sending.');

      form.set('body', 'Hello customer');
      form.set('subject', '');
      await expect(sendCampaignAction(form)).rejects.toThrow('Add a subject line for the email.');

      // SMS channel requires dedicated messaging sender
      form.set('channel', 'sms');
      mocks.sendCampaign.mockResolvedValue({ emailSent: 0, smsQueued: 1, recipientCount: 1, skipped: 0, failed: 0 });
      await expect(sendCampaignAction(form)).rejects.toThrow('NEXT_REDIRECT:/dashboard/marketing/campaigns?emailSent=0&smsQueued=1&recipients=1&skipped=0&failed=0');
      expect(mocks.requireActiveDedicatedMessagingSender).toHaveBeenCalledWith(accountId);
    });

    it('tour actions handle missing tour definitions and invalid telemetry', async () => {
      mocks.requireDashboardShellContext.mockResolvedValue({ accountId, userId, role: 'owner' });

      // Start tour missing definition
      mocks.getTourDefinition.mockReturnValue(null);
      const startRes = await startTourAction('unknown-tour');
      expect(startRes).toEqual({ success: false, error: 'Tour definition not found' });

      // Advance tour missing definition or step
      const advRes1 = await advanceTourAction('unknown-tour', 1, 's1');
      expect(advRes1).toEqual({ success: false, error: 'Tour definition not found' });

      mocks.getTourDefinition.mockReturnValue({ id: 't1', steps: [] });
      mocks.getStepById.mockReturnValue(null);
      const advRes2 = await advanceTourAction('t1', 1, 's1');
      expect(advRes2).toEqual({ success: false, error: 'Step not found in tour' });

      // Record tour event invalid
      mocks.sanitizeTourEventPayload.mockReturnValue({ valid: false, error: 'Invalid tour event payload' });
      const recRes = await recordTourEventAction({});
      expect(recRes).toEqual({ success: false, error: 'Invalid tour event payload' });
    });
  });
});
