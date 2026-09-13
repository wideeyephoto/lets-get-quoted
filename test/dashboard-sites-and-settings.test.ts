import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  redirect: vi.fn((url: string) => {
    const err = new Error(`NEXT_REDIRECT:${url}`);
    (err as unknown as { digest: string }).digest = `NEXT_REDIRECT;replace;${url};307;;`;
    throw err;
  }),
  requireOfficeContext: vi.fn(),
  requireOwnerContext: vi.fn(),
  createAdminClient: vi.fn(),
  revalidatePublicSiteCache: vi.fn(),
  getOrCreateSite: vi.fn(),
  updateSite: vi.fn(),
  publishSite: vi.fn(),
  deleteSiteImage: vi.fn(),
  importJobPhotoAsSiteImage: vi.fn(),
  uploadGeneratedSiteImage: vi.fn(),
  uploadSiteImage: vi.fn(),
  listUploadedSiteImages: vi.fn(),
  createSignedVideoUpload: vi.fn(),
  deleteSiteVideo: vi.fn(),
  createJobPhotoUrls: vi.fn(),
  callImageModel: vi.fn(),
  callModel: vi.fn(),
  validateCustomDomain: vi.fn((domain: string) => domain.toLowerCase().trim()),
  verifyDomain: vi.fn(),
  removeDomainFromVercel: vi.fn(),
  geocodeArea: vi.fn(),
  geocodeAddress: vi.fn(),
  anchorServiceArea: vi.fn(),
  draftBlogPost: vi.fn(),
  generateSeoCopy: vi.fn(),
  siteToSeoInput: vi.fn(),
  generateStockImages: vi.fn(),
  fetchStockPool: vi.fn(),
  isPexelsConfigured: vi.fn(),
  sendTestDigest: vi.fn(),
  syncAccount: vi.fn(),
  backfillAccount: vi.fn(),
  deleteInsuranceProof: vi.fn(),
  isInsuranceFile: vi.fn(),
  uploadInsuranceProof: vi.fn(),
  requireActiveDedicatedMessagingSender: vi.fn(),
  recordAccountEvent: vi.fn(),
  getAccountOwnerEmail: vi.fn(),
  sendAppointmentReminderEmail: vi.fn(),
  sendChoiceReminderTestEmail: vi.fn(),
  sendQuoteFollowupEmail: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}));

vi.mock('next/navigation', () => ({
  redirect: mocks.redirect,
}));

vi.mock('@/lib/auth', () => ({
  requireOfficeContext: mocks.requireOfficeContext,
  requireOwnerContext: mocks.requireOwnerContext,
  createAdminClient: mocks.createAdminClient,
}));

vi.mock('@/lib/cached-sites', () => ({
  revalidatePublicSiteCache: mocks.revalidatePublicSiteCache,
}));

vi.mock('@/lib/sites', () => ({
  getOrCreateSite: mocks.getOrCreateSite,
  updateSite: mocks.updateSite,
  publishSite: mocks.publishSite,
}));

vi.mock('@/lib/site-image-storage', () => ({
  deleteSiteImage: mocks.deleteSiteImage,
  importJobPhotoAsSiteImage: mocks.importJobPhotoAsSiteImage,
  uploadGeneratedSiteImage: mocks.uploadGeneratedSiteImage,
  uploadSiteImage: mocks.uploadSiteImage,
  listUploadedSiteImages: mocks.listUploadedSiteImages,
}));

vi.mock('@/lib/site-video-storage', () => ({
  createSignedVideoUpload: mocks.createSignedVideoUpload,
  deleteSiteVideo: mocks.deleteSiteVideo,
  siteVideoStoragePath: vi.fn(() => 'videos/test.mp4'),
}));

vi.mock('@/lib/job-photo-storage', () => ({
  createJobPhotoUrls: mocks.createJobPhotoUrls,
}));

vi.mock('@/lib/ai-model-call', () => ({
  callImageModel: mocks.callImageModel,
  callModel: mocks.callModel,
}));

vi.mock('@/lib/domains', () => ({
  validateCustomDomain: mocks.validateCustomDomain,
  verifyDomain: mocks.verifyDomain,
}));

vi.mock('@/lib/vercel-domains', () => ({
  removeDomainFromVercel: mocks.removeDomainFromVercel,
}));

vi.mock('@/lib/geocode', () => ({
  geocodeArea: mocks.geocodeArea,
  geocodeAddress: mocks.geocodeAddress,
}));

vi.mock('@/lib/site-area', () => ({
  anchorServiceArea: mocks.anchorServiceArea,
}));

vi.mock('@/lib/blog-generate', () => ({
  draftBlogPost: mocks.draftBlogPost,
}));

vi.mock('@/lib/seo/seo-copy', () => ({
  generateSeoCopy: mocks.generateSeoCopy,
}));

vi.mock('@/lib/seo/site-seo', () => ({
  siteToSeoInput: mocks.siteToSeoInput,
}));

vi.mock('@/lib/stock/generate', () => ({
  generateStockImages: mocks.generateStockImages,
}));

vi.mock('@/lib/stock/pexels', () => ({
  fetchStockPool: mocks.fetchStockPool,
  isPexelsConfigured: mocks.isPexelsConfigured,
}));

vi.mock('@/lib/daily-digest', () => ({
  sendTestDigest: mocks.sendTestDigest,
}));

vi.mock('@/lib/quickbooks/sync', () => ({
  syncAccount: mocks.syncAccount,
  backfillAccount: mocks.backfillAccount,
}));

vi.mock('@/lib/insurance-storage', () => ({
  deleteInsuranceProof: mocks.deleteInsuranceProof,
  isInsuranceFile: mocks.isInsuranceFile,
  uploadInsuranceProof: mocks.uploadInsuranceProof,
}));

vi.mock('@/lib/messaging-number-provisioning', () => ({
  requireActiveDedicatedMessagingSender: mocks.requireActiveDedicatedMessagingSender,
}));

vi.mock('@/lib/account-events', () => ({
  recordAccountEvent: mocks.recordAccountEvent,
}));

vi.mock('@/lib/email', () => ({
  getAccountOwnerEmail: mocks.getAccountOwnerEmail,
  sendAppointmentReminderEmail: mocks.sendAppointmentReminderEmail,
  sendChoiceReminderTestEmail: mocks.sendChoiceReminderTestEmail,
  sendQuoteFollowupEmail: mocks.sendQuoteFollowupEmail,
}));

import {
  getOrCreateSiteAction,
  updateSiteAction,
  publishSiteAction,
  checkSubdomainAvailableAction,
  regenerateSeoCopyAction,
  regenerateStockImagesAction,
  pickBlogCover,
  generateBlogPostAction,
  searchPexelsAction,
  verifyCustomDomainAction,
  uploadSiteImageAction,
  createSiteVideoUploadAction,
  deleteSiteVideoAction,
  listCompletedJobPhotoOptionsAction,
  importJobPhotoToSiteImageAction,
  deleteSiteImageAction,
  listCompletedJobReviewsAction,
  syncCompletedJobsToSiteAction,
  syncClientReviewsToSiteAction,
  generateLogoTaglinesAction,
  generateAiLogoAction,
  getAiLogosAction,
  deleteAiLogoAction,
  dismissAiLogoPendingAction,
  saveAdjustedAiLogoAction,
  getAvailableAiCreditsAction,
  suggestNearbyCitiesAction,
  testIntakeLocationAction,
} from '@/app/dashboard/sites/actions';

import {
  updateBusinessBasicsAction,
  setJobCostingAction,
  updateIntakeContentAction,
  toggleClientPortalAction,
  updatePortalLinkAction,
  updateScheduleDayHoursAction,
  toggleAutomationAction,
  enableRecommendedAutomationsAction,
  updateMissedCallNumbersAction,
  setReviewFeedbackPageAction,
  updateIntakeSettingsAction,
  updateBookingAvailabilityAction,
  updateQuickStopSettingsAction,
  updateDepositSettingsAction,
  updateBusinessAddressesAction,
  updateReminderSettingsAction,
  sendReminderTestAction,
  updateFollowupSettingsAction,
  updateChoiceReminderSettingsAction,
  sendChoiceReminderTestAction,
  sendFollowupTestAction,
  sendTestDigestAction,
  setQuickStopEnabledAction,
  updateArrivalWindowAction,
  updateArrivalExtrasAction,
  syncQuickBooksAction,
  backfillQuickBooksAction,
  updateInsuranceAction,
  removeInsuranceAction,
  setClientQuoteChangesAction,
  chooseGoogleLsaCustomerAction,
  syncGoogleLsaAction,
  updateNavBrandingAction,
  uploadContractorLogoAction,
  removeContractorLogoAction,
} from '@/app/dashboard/settings/actions';

function createMockSupabase(initialData: Record<string, any> = {}) {
  const store = { ...initialData };

  const chainable = (result: any = { data: null, error: null }) => {
    let hasNeq = false;
    const toSingle = () => {
      if (hasNeq) return { data: null, error: null };
      return {
        data: Array.isArray(result?.data) ? (result.data[0] ?? null) : result?.data ?? null,
        error: result?.error ?? null,
      };
    };
    const chain: any = {
      select: vi.fn(() => chain),
      insert: vi.fn(() => chain),
      update: vi.fn(() => chain),
      upsert: vi.fn(() => chain),
      delete: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      neq: vi.fn(() => {
        hasNeq = true;
        return chain;
      }),
      in: vi.fn(() => chain),
      is: vi.fn(() => chain),
      gte: vi.fn(() => chain),
      lte: vi.fn(() => chain),
      gt: vi.fn(() => chain),
      lt: vi.fn(() => chain),
      order: vi.fn(() => chain),
      limit: vi.fn(() => chain),
      single: vi.fn(() => Promise.resolve(toSingle())),
      maybeSingle: vi.fn(() => Promise.resolve(toSingle())),
      then: (resolve: (val: any) => any) => Promise.resolve(hasNeq ? { data: [], error: null } : result).then(resolve),
    };
    return chain;
  };

  return {
    from: vi.fn((table: string) => {
      if (store[table]) {
        return chainable(store[table]);
      }
      return chainable({ data: [], error: null });
    }),
    rpc: vi.fn(() => Promise.resolve({ data: null, error: null })),
    auth: {
      getUser: vi.fn(() => Promise.resolve({ data: { user: { id: 'usr-1', email: 'owner@test.com' } }, error: null })),
    },
  };
}

describe('Dashboard Sites Server Actions (Phase A)', () => {
  const accountId = 'acc-sites-1111';

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createAdminClient.mockReturnValue(createMockSupabase());
    mocks.isPexelsConfigured.mockReturnValue(true);
  });

  it('getOrCreateSiteAction retrieves site for office context', async () => {
    const mockDb = createMockSupabase();
    mocks.requireOfficeContext.mockResolvedValue({ supabase: mockDb, accountId });
    mocks.getOrCreateSite.mockResolvedValue({ id: 'site-123', account_id: accountId });

    const result = await getOrCreateSiteAction();
    expect(mocks.requireOfficeContext).toHaveBeenCalledWith('settings.write');
    expect(mocks.getOrCreateSite).toHaveBeenCalledWith(mockDb, accountId);
    expect(result).toEqual({ id: 'site-123', account_id: accountId });
  });

  it('updateSiteAction preserves blog posts and updates site', async () => {
    const mockDb = createMockSupabase({
      sites: {
        data: [{
          id: 'site-123',
          subdomain: 'test-sub',
          custom_domain: null,
          content: {
            blog: { posts: [{ id: 'post-1', title: 'Seasonal Prep' }] },
            intake: { flowType: 'simple' },
          },
          published: false,
        }],
        error: null,
      },
    });
    mocks.requireOfficeContext.mockResolvedValue({ supabase: mockDb, accountId });
    mocks.updateSite.mockResolvedValue({ id: 'site-123' });

    await updateSiteAction({
      template: 'modern',
      company_name: 'Apex Services',
      subdomain: 'apex-cool',
      custom_domain: 'apexservices.com',
      content: { hero: { title: 'Best in Town' } },
    } as any);

    expect(mocks.updateSite).toHaveBeenCalled();
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/dashboard/sites');
    expect(mocks.revalidatePublicSiteCache).toHaveBeenCalled();
  });

  it('updateSiteAction throws when site is not found', async () => {
    const mockDb = createMockSupabase({ sites: { data: [], error: null } });
    mocks.requireOfficeContext.mockResolvedValue({ supabase: mockDb, accountId });

    await expect(updateSiteAction({ company_name: 'Test' } as any)).rejects.toThrow('No site found');
  });

  it('publishSiteAction publishes site and revalidates public caches', async () => {
    const mockDb = createMockSupabase({
      sites: {
        data: [{
          id: 'site-123',
          subdomain: 'apex',
          custom_domain: null,
          content: {},
          published: false,
        }],
        error: null,
      },
    });
    mocks.requireOfficeContext.mockResolvedValue({ supabase: mockDb, accountId });
    mocks.publishSite.mockResolvedValue({ id: 'site-123', published: true });

    await publishSiteAction(true);
    expect(mocks.publishSite).toHaveBeenCalledWith(mockDb, accountId, 'site-123', true);
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/dashboard/sites');
    expect(mocks.revalidatePublicSiteCache).toHaveBeenCalled();
  });

  it('checkSubdomainAvailableAction validates format and checks conflicts', async () => {
    const mockDb = createMockSupabase();
    mocks.requireOfficeContext.mockResolvedValue({ supabase: mockDb, accountId });
    mocks.createAdminClient.mockReturnValue(mockDb);

    expect(await checkSubdomainAvailableAction('my-valid-site')).toBe(true);

    const conflictDb = createMockSupabase({ sites: { data: [{ account_id: 'other-acc' }] } });
    mocks.createAdminClient.mockReturnValue(conflictDb);
    expect(await checkSubdomainAvailableAction('taken-site')).toBe(false);
  });

  it('regenerateSeoCopyAction creates and persists SEO copy', async () => {
    const mockDb = createMockSupabase({
      sites: {
        data: [{ id: 'site-1', company_name: 'Apex', service_area: 'Austin, TX' }],
        error: null,
      },
    });
    mocks.requireOfficeContext.mockResolvedValue({ supabase: mockDb, accountId });
    mocks.generateSeoCopy.mockReturnValue({
      title: 'Apex | Leading Austin Service',
      description: 'Top rated service in Austin.',
    });

    const result = await regenerateSeoCopyAction(0);
    expect(result.seo_title).toBe('Apex | Leading Austin Service');
  });

  it('regenerateStockImagesAction delegates to generateStockImages', async () => {
    const mockDb = createMockSupabase({
      sites: {
        data: [{ id: 'site-1', company_name: 'Apex' }],
        error: null,
      },
    });
    mocks.requireOfficeContext.mockResolvedValue({ supabase: mockDb, accountId });
    mocks.generateStockImages.mockReturnValue({ heroUrl: 'https://images.unsplash.com/hero.jpg' } as any);

    const result = await regenerateStockImagesAction(123);
    expect(result.heroUrl).toBe('https://images.unsplash.com/hero.jpg');
  });

  it('pickBlogCover fetches from stock pool with fallbacks', async () => {
    mocks.fetchStockPool.mockResolvedValue([
      { imageUrl: 'https://images.pexels.com/1.jpg' },
      { imageUrl: 'https://images.pexels.com/2.jpg' },
    ]);

    const cover = await pickBlogCover('landscaping');
    expect(cover).toContain('https://images.pexels.com/');
  });

  it('generateBlogPostAction creates drafted blog content with cover image', async () => {
    const mockDb = createMockSupabase({
      sites: {
        data: [{ id: 'site-1', company_name: 'Apex', trade: 'plumbing' }],
        error: null,
      },
    });
    mocks.requireOfficeContext.mockResolvedValue({ supabase: mockDb, accountId });
    mocks.draftBlogPost.mockResolvedValue({
      title: 'Spring Plumbing Tips',
      slug: 'spring-plumbing-tips',
      summary: 'Essential spring tips',
      body: 'Detailed body here',
    });
    mocks.fetchStockPool.mockResolvedValue([{ imageUrl: 'https://images.pexels.com/pipe.jpg' }]);

    const post = await generateBlogPostAction('Spring maintenance');
    expect(post.title).toBe('Spring Plumbing Tips');
    expect(post.coverImage).toBe('https://images.pexels.com/pipe.jpg');
  });

  it('searchPexelsAction queries stock pool when configured', async () => {
    mocks.isPexelsConfigured.mockReturnValue(true);
    mocks.fetchStockPool.mockResolvedValue([
      { url: 'https://images.pexels.com/photo.jpg', photographer: 'Jane' },
    ]);

    const res = await searchPexelsAction('hvac');
    expect(res.photos.length).toBe(1);
    expect(res.configured).toBe(true);
  });

  it('verifyCustomDomainAction verifies domain and records verification timestamp', async () => {
    const mockDb = createMockSupabase({
      sites: {
        data: [{ id: 'site-1', custom_domain: 'example.com', account_id: accountId }],
        error: null,
      },
    });
    mocks.requireOfficeContext.mockResolvedValue({ supabase: mockDb, accountId });
    mocks.createAdminClient.mockReturnValue(mockDb);
    mocks.verifyDomain.mockResolvedValue({ verified: true, sslStatus: 'issued' });

    const res = await verifyCustomDomainAction('example.com');
    expect(res.verified).toBe(true);
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/dashboard/sites');
  });

  it('uploadSiteImageAction validates file existence and uploads to storage', async () => {
    const mockDb = createMockSupabase();
    mocks.requireOfficeContext.mockResolvedValue({ supabase: mockDb, accountId });

    const emptyForm = new FormData();
    await expect(uploadSiteImageAction(emptyForm)).rejects.toThrow('Choose an image to upload');

    const file = new File(['image-bytes'], 'logo.png', { type: 'image/png' });
    const formData = new FormData();
    formData.append('image', file);
    mocks.uploadSiteImage.mockResolvedValue({ url: 'https://storage.cdn/logo.png', path: 'site/logo.png' });

    const uploaded = await uploadSiteImageAction(formData);
    expect(uploaded.url).toBe('https://storage.cdn/logo.png');
  });

  it('createSiteVideoUploadAction and deleteSiteVideoAction handle video lifecycle', async () => {
    const mockDb = createMockSupabase();
    mocks.requireOfficeContext.mockResolvedValue({ supabase: mockDb, accountId });
    mocks.createSignedVideoUpload.mockResolvedValue({ bucket: 'videos', path: 'video.mp4', token: 'tok_123', publicUrl: 'https://cdn/video.mp4' });

    const upload = await createSiteVideoUploadAction('video.mp4', 'video/mp4', 1000);
    expect(upload.publicUrl).toBe('https://cdn/video.mp4');

    await deleteSiteVideoAction('https://cdn/video.mp4');
    expect(mocks.deleteSiteVideo).toHaveBeenCalled();
  });

  it('listCompletedJobPhotoOptionsAction loads job photos with presigned URLs', async () => {
    const mockDb = createMockSupabase({
      jobs: {
        data: [{
          id: 'job-1',
          ref: 'J100',
          scope: 'Deck build',
          client_name: 'John Doe',
          photo_paths: [`${accountId}/1.jpg`],
        }],
        error: null,
      },
    });
    mocks.requireOfficeContext.mockResolvedValue({ supabase: mockDb, accountId });
    mocks.createJobPhotoUrls.mockResolvedValue(['https://signed.cdn/1.jpg']);

    const photos = await listCompletedJobPhotoOptionsAction();
    expect(photos.length).toBe(1);
    expect(photos[0].url).toBe('https://signed.cdn/1.jpg');
  });

  it('importJobPhotoToSiteImageAction imports photo into site assets', async () => {
    const mockDb = createMockSupabase();
    mocks.requireOfficeContext.mockResolvedValue({ supabase: mockDb, accountId });
    mocks.importJobPhotoAsSiteImage.mockResolvedValue({ url: 'https://site.cdn/imported.jpg', path: 'site/imported.jpg' });

    const imported = await importJobPhotoToSiteImageAction('job-photos/1.jpg', 'Before Photo');
    expect(imported.url).toBe('https://site.cdn/imported.jpg');
  });

  it('deleteSiteImageAction calls deleteSiteImage', async () => {
    const mockDb = createMockSupabase();
    mocks.requireOfficeContext.mockResolvedValue({ supabase: mockDb, accountId });

    await deleteSiteImageAction('sites/photo-1.jpg');
    expect(mocks.deleteSiteImage).toHaveBeenCalledWith(accountId, 'sites/photo-1.jpg');
  });

  it('listCompletedJobReviewsAction returns client review options', async () => {
    const mockDb = createMockSupabase({
      review_invites: {
        data: [{
          id: 'rev-1',
          rating: 5,
          feedback: 'Outstanding work on our patio!',
          client_name: 'Alice Smith',
          created_at: '2026-01-01',
        }],
        error: null,
      },
    });
    mocks.requireOfficeContext.mockResolvedValue({ supabase: mockDb, accountId });

    const reviews = await listCompletedJobReviewsAction();
    expect(reviews.length).toBe(1);
    expect(reviews[0].clientName).toBe('Alice Smith');
  });

  it('syncCompletedJobsToSiteAction and syncClientReviewsToSiteAction trigger updates', async () => {
    const mockDb = createMockSupabase({
      sites: {
        data: [{ id: 'site-1', content: {} }],
        error: null,
      },
      jobs: { data: [], error: null },
      client_reviews: { data: [], error: null },
    });
    mocks.requireOfficeContext.mockResolvedValue({ supabase: mockDb, accountId });

    await syncCompletedJobsToSiteAction();
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/dashboard/sites');

    await syncClientReviewsToSiteAction();
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/dashboard/sites');
  });

  it('generateLogoTaglinesAction generates taglines via AI model with fallbacks', async () => {
    const mockDb = createMockSupabase({
      sites: {
        data: [{ id: 'site-1', company_name: 'Apex Roofs', trade: 'roofing' }],
        error: null,
      },
    });
    mocks.requireOfficeContext.mockResolvedValue({ supabase: mockDb, accountId });
    mocks.callModel.mockResolvedValue('Quality Roofing You Can Trust\nProtecting What Matters Most\nPrecision Above All');

    const res = await generateLogoTaglinesAction({
      companyName: 'Apex Roofs',
      trade: 'roofing',
      serviceArea: 'Austin, TX',
    });
    expect(res.taglines?.length).toBeGreaterThanOrEqual(1);
  });

  it('generateAiLogoAction checks credits and generates logo options', async () => {
    const mockDb = createMockSupabase({
      accounts: { data: [{ ai_credits: 5 }], error: null },
      sites: { data: [{ id: 'site-1', content: {} }], error: null },
    });
    mocks.requireOfficeContext.mockResolvedValue({ supabase: mockDb, accountId });
    mocks.createAdminClient.mockReturnValue(mockDb);
    mocks.callImageModel.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        data: [{ b64_json: Buffer.from('fake-logo-png').toString('base64') }],
      }),
    });
    mocks.uploadGeneratedSiteImage.mockResolvedValue({ id: 'logo-new', url: 'https://cdn/logo.png', storagePath: 'logos/logo.png' });

    const res = await generateAiLogoAction({
      businessName: 'Apex',
      direction: 'art_director',
    });
    expect(res.ok).toBe(true);
    expect(res.image?.url).toBe('https://cdn/logo.png');
  });

  it('getAiLogosAction, deleteAiLogoAction, dismissAiLogoPendingAction, and saveAdjustedAiLogoAction manage logos', async () => {
    const mockDb = createMockSupabase({
      sites: {
        data: [{
          id: 'site-1',
          content: {
            ai_logos: [{ id: 'logo-1', url: 'https://cdn/1.png', label: 'Primary' }],
            aiLogoPending: { id: 'logo-pending', url: 'https://cdn/pending.png' },
          },
        }],
        error: null,
      },
    });
    mocks.requireOfficeContext.mockResolvedValue({ supabase: mockDb, accountId });
    mocks.createAdminClient.mockReturnValue(mockDb);
    mocks.uploadGeneratedSiteImage.mockResolvedValue({
      id: 'logo-adj-1',
      url: 'https://cdn/adjusted.png',
      storagePath: 'logos/adjusted.png',
    });

    const logos = await getAiLogosAction();
    expect(logos.logos.length).toBe(1);

    const dismissRes = await dismissAiLogoPendingAction();
    expect(dismissRes.ok).toBe(true);
    expect(mockDb.from).toHaveBeenCalledWith('sites');

    const delRes = await deleteAiLogoAction('logos/logo-1.png', 'logo-1');
    expect(delRes.ok).toBe(true);
    expect(mockDb.from).toHaveBeenCalledWith('sites');

    const saveRes = await saveAdjustedAiLogoAction({
      base64Png: Buffer.from('adjusted-image-bytes').toString('base64'),
      originalLogoId: 'logo-1',
      businessName: 'Apex',
      label: 'Dark Mode',
    });
    expect(saveRes.ok).toBe(true);
    expect(mockDb.from).toHaveBeenCalledWith('sites');
  });

  it('getAvailableAiCreditsAction returns credit balance', async () => {
    const mockDb = createMockSupabase({
      workspace_usage_credit_balances: {
        data: [
          { resource_code: 'ai_intake_threads', available_units: 5 },
          { resource_code: 'ai_writing_drafts', available_units: 7 },
        ],
        error: null,
      },
    });
    mocks.requireOfficeContext.mockResolvedValue({ supabase: mockDb, accountId });

    const credits = await getAvailableAiCreditsAction();
    expect(credits).toBe(12);
  });

  it('suggestNearbyCitiesAction suggests locations near service area', async () => {
    const mockDb = createMockSupabase({
      sites: {
        data: [{ id: 'site-1', service_area: 'Austin, TX' }],
        error: null,
      },
    });
    mocks.requireOfficeContext.mockResolvedValue({ supabase: mockDb, accountId });
    mocks.geocodeArea.mockResolvedValue({ ok: true, place: 'Austin, TX', lat: 30.2672, lng: -97.7431 });

    const res = await suggestNearbyCitiesAction({
      baseLocation: 'Austin, TX',
      radiusMiles: 25,
    });
    expect(res.ok).toBe(true);
    expect(Array.isArray(res.cities)).toBe(true);
  });

  it('testIntakeLocationAction checks whether address is served', async () => {
    const mockDb = createMockSupabase({
      sites: {
        data: [{
          id: 'site-1',
          service_area: 'Austin, Round Rock, TX',
          content: { intake: { servedCities: ['Austin', 'Round Rock'] } },
        }],
        error: null,
      },
    });
    mocks.requireOfficeContext.mockResolvedValue({ supabase: mockDb, accountId });

    const res = await testIntakeLocationAction({
      testLocation: 'Austin, TX',
      servedCities: ['Austin', 'Round Rock'],
    });
    expect(res).toHaveProperty('matched');
  });
});

describe('Dashboard Settings Server Actions (Phase A)', () => {
  const accountId = 'acc-settings-2222';

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createAdminClient.mockReturnValue(createMockSupabase());
    mocks.requireOwnerContext.mockResolvedValue({ supabase: createMockSupabase(), accountId });
  });

  it('updateBusinessBasicsAction updates site and account basics', async () => {
    const mockDb = createMockSupabase({
      sites: { data: [{ id: 'site-1', content: {} }], error: null },
      accounts: { data: [{ id: accountId }], error: null },
    });
    mocks.requireOfficeContext.mockResolvedValue({ supabase: mockDb, accountId });

    const formData = new FormData();
    formData.append('company_name', 'Apex Electrical');
    formData.append('phone', '(555) 123-4567');
    formData.append('trade', 'electrical');
    formData.append('license', 'LIC-9988');
    formData.append('hours', '8am - 5pm M-F');
    formData.append('service_area', 'Dallas-Fort Worth');
    formData.append('primary_zip', '75001');

    await updateBusinessBasicsAction(formData);
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/dashboard/settings');
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/dashboard/sites');
  });

  it('setJobCostingAction validates margins and updates account', async () => {
    const mockDb = createMockSupabase();
    mocks.requireOfficeContext.mockResolvedValue({ supabase: mockDb, accountId });

    await setJobCostingAction({ burdenPct: 25, minMarginPct: 40 });
    expect(mockDb.from).toHaveBeenCalledWith('accounts');
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/dashboard/settings');
  });

  it('updateIntakeContentAction updates quote form and intake content', async () => {
    const mockDb = createMockSupabase({
      sites: {
        data: [{ id: 'site-1', content: {} }],
        error: null,
      },
    });
    mocks.requireOfficeContext.mockResolvedValue({ supabase: mockDb, accountId });

    await updateIntakeContentAction({
      leadFilters: { minJobAmount: 100, exclusions: ['hazardous waste'] },
    });
    expect(mockDb.from).toHaveBeenCalledWith('sites');
    expect(mocks.revalidatePath).toHaveBeenCalled();
  });

  it('toggleClientPortalAction toggles portal mode', async () => {
    const mockDb = createMockSupabase({
      sites: { data: [{ id: 'site-1', content: {} }], error: null },
    });
    mocks.requireOfficeContext.mockResolvedValue({ supabase: mockDb, accountId });

    await toggleClientPortalAction(true);
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/dashboard/settings');
  });

  it('updatePortalLinkAction updates client navigation label', async () => {
    const mockDb = createMockSupabase({
      sites: { data: [{ id: 'site-1', content: {} }], error: null },
    });
    mocks.requireOfficeContext.mockResolvedValue({ supabase: mockDb, accountId });

    await updatePortalLinkAction({ navEnabled: true, navLabel: 'Client Hub' });
    expect(mocks.revalidatePath).toHaveBeenCalled();
  });

  it('updateScheduleDayHoursAction parses and sets schedule workday hours', async () => {
    const mockDb = createMockSupabase();
    mocks.requireOfficeContext.mockResolvedValue({ supabase: mockDb, accountId });

    const form = new FormData();
    form.append('schedule_day_hours', '9');

    await updateScheduleDayHoursAction(form);
    expect(mockDb.from).toHaveBeenCalledWith('accounts');
  });

  it('toggleAutomationAction toggles automation flag with gate check', async () => {
    const mockDb = createMockSupabase();
    mocks.requireOfficeContext.mockResolvedValue({ supabase: mockDb, accountId });

    await toggleAutomationAction('booking', true);
    expect(mockDb.from).toHaveBeenCalledWith('accounts');
    expect(mocks.revalidatePath).toHaveBeenCalled();
  });

  it('enableRecommendedAutomationsAction enables recommended automations set', async () => {
    const mockDb = createMockSupabase();
    mocks.requireOfficeContext.mockResolvedValue({ supabase: mockDb, accountId });

    await enableRecommendedAutomationsAction();
    expect(mockDb.from).toHaveBeenCalledWith('accounts');
  });

  it('updateMissedCallNumbersAction sets call forwarding numbers', async () => {
    const mockDb = createMockSupabase({
      accounts: { data: [{ id: accountId }], error: null },
      voice_number_inventory: { data: [], error: null },
    });
    mocks.requireOfficeContext.mockResolvedValue({ supabase: mockDb, accountId });
    mocks.createAdminClient.mockReturnValue(mockDb);

    await updateMissedCallNumbersAction({ forward: '+15551239999', tracking: '+15559870000' });
    expect(mockDb.from).toHaveBeenCalled();
  });

  it('setReviewFeedbackPageAction updates review page toggle', async () => {
    const mockDb = createMockSupabase();
    mocks.requireOfficeContext.mockResolvedValue({ supabase: mockDb, accountId });

    await setReviewFeedbackPageAction(true);
    expect(mockDb.from).toHaveBeenCalledWith('accounts');
  });

  it('updateIntakeSettingsAction updates instant book and geo settings', async () => {
    const mockDb = createMockSupabase();
    mocks.requireOfficeContext.mockResolvedValue({ supabase: mockDb, accountId });

    const form = new FormData();
    form.append('instant_book_enabled', 'on');
    form.append('instant_book_radius_miles', '35');
    form.append('instant_book_min_amount', '150');

    await updateIntakeSettingsAction(form);
    expect(mockDb.from).toHaveBeenCalledWith('accounts');
  });

  it('updateBookingAvailabilityAction saves calendar window rules', async () => {
    const mockDb = createMockSupabase();
    mocks.requireOfficeContext.mockResolvedValue({ supabase: mockDb, accountId });

    const form = new FormData();
    form.append('booking_timezone', 'America/Chicago');
    form.append('booking_weekdays', '1,2,3,4,5');
    form.append('booking_window_start', '08:00');
    form.append('booking_window_end', '17:00');
    form.append('booking_window_minutes', '120');

    await updateBookingAvailabilityAction(form);
    expect(mockDb.from).toHaveBeenCalledWith('accounts');
  });

  it('updateQuickStopSettingsAction saves quick stop rates and refund tiers', async () => {
    const mockDb = createMockSupabase({
      accounts: { data: [{ quick_stop_settings: {} }], error: null },
    });
    mocks.requireOfficeContext.mockResolvedValue({ supabase: mockDb, accountId });

    const form = new FormData();
    form.append('enabled', 'on');
    form.append('base_fee_dollars', '49');
    form.append('max_detour_minutes', '20');

    await updateQuickStopSettingsAction(form);
    expect(mockDb.from).toHaveBeenCalledWith('accounts');
  });

  it('updateDepositSettingsAction saves deposit requirements', async () => {
    const mockDb = createMockSupabase();
    mocks.requireOfficeContext.mockResolvedValue({ supabase: mockDb, accountId });

    const form = new FormData();
    form.append('deposit_percentage', '25');
    form.append('deposit_minimum_dollars', '200');

    await updateDepositSettingsAction(form);
    expect(mockDb.from).toHaveBeenCalledWith('accounts');
  });

  it('updateBusinessAddressesAction geocodes and stores locations', async () => {
    const mockDb = createMockSupabase();
    mocks.requireOfficeContext.mockResolvedValue({ supabase: mockDb, accountId });
    mocks.geocodeAddress.mockResolvedValue({ lat: 32.7767, lng: -96.7970 });

    const form = new FormData();
    form.append('primary_address', '100 Main St, Dallas, TX 75201');

    await updateBusinessAddressesAction(form);
    expect(mockDb.from).toHaveBeenCalledWith('accounts');
  });

  it('updateReminderSettingsAction and sendReminderTestAction manage appointment reminders', async () => {
    const mockDb = createMockSupabase({
      accounts: { data: [{ id: accountId, business_name: 'Apex Pro' }], error: null },
    });
    mocks.requireOfficeContext.mockResolvedValue({ supabase: mockDb, accountId });
    mocks.getAccountOwnerEmail.mockResolvedValue('owner@apex.com');
    mocks.sendAppointmentReminderEmail.mockResolvedValue({ id: 'msg-1' });

    const form = new FormData();
    form.append('reminder_lead_days', '1');
    form.append('reminder_hour', '9');

    await updateReminderSettingsAction(form);
    expect(mockDb.from).toHaveBeenCalledWith('accounts');

    const testRes = await sendReminderTestAction();
    expect(testRes.ok).toBe(true);
  });

  it('updateFollowupSettingsAction and sendFollowupTestAction manage quote followups', async () => {
    const mockDb = createMockSupabase({
      accounts: { data: [{ id: accountId, business_name: 'Apex Pro' }], error: null },
    });
    mocks.requireOfficeContext.mockResolvedValue({ supabase: mockDb, accountId });
    mocks.getAccountOwnerEmail.mockResolvedValue('owner@apex.com');
    mocks.sendQuoteFollowupEmail.mockResolvedValue({ id: 'msg-2' });

    const form = new FormData();
    form.append('followup_lead_days', '2');
    form.append('followup_channel', 'email');

    await updateFollowupSettingsAction(form);
    expect(mockDb.from).toHaveBeenCalledWith('accounts');

    const testRes = await sendFollowupTestAction();
    expect(testRes.ok).toBe(true);
  });

  it('updateChoiceReminderSettingsAction and sendChoiceReminderTestAction manage choice reminders', async () => {
    const mockDb = createMockSupabase({
      accounts: { data: [{ id: accountId, business_name: 'Apex Pro' }], error: null },
    });
    mocks.requireOfficeContext.mockResolvedValue({ supabase: mockDb, accountId });
    mocks.getAccountOwnerEmail.mockResolvedValue('owner@apex.com');
    mocks.sendChoiceReminderTestEmail.mockResolvedValue({ id: 'msg-3' });

    const form = new FormData();
    form.append('choiceOffset1', '2');
    form.append('choiceOffset2', '5');
    form.append('choiceReminderHour', '10');
    form.append('choiceReminderTemplate', 'Friendly reminder to choose your preferred slot: {CHOICE_LINK}');

    await updateChoiceReminderSettingsAction(form);
    expect(mockDb.from).toHaveBeenCalledWith('accounts');

    const testRes = await sendChoiceReminderTestAction();
    expect(testRes.ok).toBe(true);
  });

  it('sendTestDigestAction dispatches digest test', async () => {
    const mockDb = createMockSupabase();
    mocks.requireOfficeContext.mockResolvedValue({ supabase: mockDb, accountId });
    mocks.sendTestDigest.mockResolvedValue({ ok: true, message: 'Digest sent' });

    const res = await sendTestDigestAction();
    expect(res.ok).toBe(true);
  });

  it('setQuickStopEnabledAction and updateArrivalWindowAction manage dispatch options', async () => {
    const mockDb = createMockSupabase({
      accounts: { data: [{ quick_stop_settings: {} }], error: null },
    });
    mocks.requireOfficeContext.mockResolvedValue({ supabase: mockDb, accountId });

    await setQuickStopEnabledAction(true, 'settings_page');
    expect(mockDb.from).toHaveBeenCalledWith('accounts');

    await updateArrivalWindowAction(45);
    expect(mockDb.from).toHaveBeenCalledWith('accounts');
  });

  it('updateArrivalExtrasAction updates arrival preferences', async () => {
    const mockDb = createMockSupabase();
    mocks.requireOfficeContext.mockResolvedValue({ supabase: mockDb, accountId });

    const form = new FormData();
    form.append('arrival_notify_on_enroute', 'on');

    await updateArrivalExtrasAction(form);
    expect(mockDb.from).toHaveBeenCalledWith('accounts');
  });

  it('syncQuickBooksAction and backfillQuickBooksAction trigger QB integrations', async () => {
    const mockDb = createMockSupabase();
    mocks.requireOfficeContext.mockResolvedValue({ supabase: mockDb, accountId });
    mocks.syncAccount.mockResolvedValue({ ok: true });
    mocks.backfillAccount.mockResolvedValue({ ok: true });

    await expect(syncQuickBooksAction()).rejects.toThrow('NEXT_REDIRECT');
    await expect(backfillQuickBooksAction()).rejects.toThrow('NEXT_REDIRECT');
  });

  it('updateInsuranceAction and removeInsuranceAction manage proof of insurance files', async () => {
    const mockDb = createMockSupabase();
    mocks.requireOfficeContext.mockResolvedValue({ supabase: mockDb, accountId });
    mocks.isInsuranceFile.mockReturnValue(true);
    mocks.uploadInsuranceProof.mockResolvedValue({ path: 'insurance/coi.pdf', filename: 'coi.pdf' });

    const form = new FormData();
    const file = new File(['coi-data'], 'coi.pdf', { type: 'application/pdf' });
    form.append('certificate', file);
    form.append('carrier', 'State Farm');

    await updateInsuranceAction(form);
    expect(mocks.uploadInsuranceProof).toHaveBeenCalled();

    await removeInsuranceAction();
    expect(mockDb.from).toHaveBeenCalledWith('accounts');
  });

  it('setClientQuoteChangesAction updates quote alteration permission', async () => {
    const mockDb = createMockSupabase();
    mocks.requireOfficeContext.mockResolvedValue({ supabase: mockDb, accountId });

    await setClientQuoteChangesAction(true);
    expect(mockDb.from).toHaveBeenCalledWith('accounts');
  });

  it('chooseGoogleLsaCustomerAction and syncGoogleLsaAction manage Google LSA', async () => {
    const mockDb = createMockSupabase();
    mocks.requireOfficeContext.mockResolvedValue({ supabase: mockDb, accountId });

    const form = new FormData();
    form.append('customerId', '123-456-7890');

    await expect(chooseGoogleLsaCustomerAction(form)).rejects.toThrow('NEXT_REDIRECT');
    await expect(syncGoogleLsaAction()).rejects.toThrow('NEXT_REDIRECT');
  });

  it('updateNavBrandingAction, uploadContractorLogoAction, and removeContractorLogoAction manage logo preferences', async () => {
    const mockDb = createMockSupabase({
      sites: { data: [{ id: 'site-1', content: {} }], error: null },
    });
    mocks.requireOfficeContext.mockResolvedValue({ supabase: mockDb, accountId });
    mocks.uploadSiteImage.mockResolvedValue({ url: 'https://cdn/logo.png', path: 'logos/logo.png' });

    await updateNavBrandingAction(true);
    expect(mockDb.from).toHaveBeenCalledWith('sites');

    const form = new FormData();
    const file = new File(['logo-png'], 'brand.png', { type: 'image/png' });
    form.append('logo', file);

    const uploadRes = await uploadContractorLogoAction(form);
    expect(uploadRes.logoUrl).toBe('https://cdn/logo.png');

    await removeContractorLogoAction();
    expect(mockDb.from).toHaveBeenCalledWith('sites');
  });
});