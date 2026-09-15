/**
 * Change Orders & Margin Intelligence Engine Coverage Test
 *
 * Targets:
 *   - src/lib/change-orders-data.ts (listChangeOrders, getChangeOrder, raiseChangeOrder,
 *     updateChangeOrder, sendChangeOrder, voidChangeOrder, respondToChangeOrder, loadClientChangeOrders)
 *   - src/lib/cost-truth-data.ts (resolveCrewBurdenPct, accountLoadedHourlyRate, getMinMarginPct)
 *   - src/lib/margin-alerts.ts (evaluateAndTriggerMarginAlert: loss alerts, below-floor warnings,
 *     cooldown suppression, job feed logging, contractor email dispatch)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  getJob: vi.fn(),
  listCosts: vi.fn(),
  computeMargin: vi.fn(),
  createJobFeedEvent: vi.fn(),
  getAccountOwnerEmail: vi.fn(),
  sendContractorAlertEmail: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  createAdminClient: mocks.createAdminClient,
}));

vi.mock('@/lib/jobs', async () => {
  const actual = await vi.importActual<any>('@/lib/jobs');
  return {
    ...actual,
    getJob: mocks.getJob,
    listCosts: mocks.listCosts,
    computeMargin: mocks.computeMargin,
  };
});

vi.mock('@/lib/job-feed', () => ({
  createJobFeedEvent: mocks.createJobFeedEvent,
}));

vi.mock('@/lib/email', () => ({
  getAccountOwnerEmail: mocks.getAccountOwnerEmail,
  sendContractorAlertEmail: mocks.sendContractorAlertEmail,
}));

import {
  listChangeOrders,
  getChangeOrder,
  raiseChangeOrder,
  updateChangeOrder,
  sendChangeOrder,
  voidChangeOrder,
  respondToChangeOrder,
  loadClientChangeOrders,
} from '@/lib/change-orders-data';

import {
  resolveCrewBurdenPct,
  accountLoadedHourlyRate,
  getMinMarginPct,
} from '@/lib/cost-truth-data';

import {
  evaluateAndTriggerMarginAlert,
} from '@/lib/margin-alerts';

describe('Change Orders & Margin Intelligence Engine', () => {
  let mockAdminSupabase: any;

  function createMockChain(data: any = null, error: any = null) {
    const chain: any = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      gt: vi.fn().mockReturnThis(),
      lt: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      range: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data, error }),
      maybeSingle: vi.fn().mockResolvedValue({ data, error }),
      then: (resolve: any) => Promise.resolve({ data, error }).then(resolve),
    };
    return chain;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdminSupabase = createMockChain();
    mocks.createAdminClient.mockReturnValue(mockAdminSupabase);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 1. change-orders-data: querying and fetching
  // ───────────────────────────────────────────────────────────────────────────

  describe('change-orders-data — querying', () => {
    it('listChangeOrders returns empty array on database error', async () => {
      const client = createMockChain(null, { message: 'relation does not exist' });
      const orders = await listChangeOrders(client, 'acc-1', 'job-100');
      expect(orders).toEqual([]);
    });

    it('listChangeOrders maps and parses rows correctly', async () => {
      const rawRows = [
        {
          id: 'co-1',
          job_id: 'job-100',
          status: 'draft',
          crew_id: 'c1',
          crew_name: 'Marcus',
          title: 'Additional dry rot repair',
          field_note: 'Found rotted sill plate behind siding',
          scope: 'Replace 8ft of rotted sill plate',
          photo_paths: ['photos/rot1.jpg'],
          items: [{ id: 'item-1', label: 'Sill lumber', amount: 250, kind: 'base', selected: true }],
          amount: 250,
          estimated_cost: 120,
          created_at: '2026-06-01T12:00:00Z',
        },
      ];

      const client = createMockChain(rawRows);
      const orders = await listChangeOrders(client, 'acc-1', 'job-100');

      expect(orders).toHaveLength(1);
      expect(orders[0].id).toBe('co-1');
      expect(orders[0].jobId).toBe('job-100');
      expect(orders[0].status).toBe('draft');
      expect(orders[0].crewName).toBe('Marcus');
      expect(orders[0].amount).toBe(250);
      expect(orders[0].estimatedCost).toBe(120);
      expect(orders[0].items).toHaveLength(1);
    });

    it('getChangeOrder returns parsed ChangeOrder when found, or null', async () => {
      const client = createMockChain({
        id: 'co-1',
        job_id: 'job-100',
        status: 'sent',
        title: 'Roof repair',
        items: [],
        amount: 500,
      });

      const found = await getChangeOrder(client, 'acc-1', 'co-1');
      expect(found).not.toBeNull();
      expect(found?.title).toBe('Roof repair');
      expect(found?.status).toBe('sent');

      const clientEmpty = createMockChain(null);
      const notFound = await getChangeOrder(clientEmpty, 'acc-1', 'co-999');
      expect(notFound).toBeNull();
    });

    it('loadClientChangeOrders fetches all orders using admin client', async () => {
      const rawRows = [
        { id: 'co-1', job_id: 'job-1', status: 'sent', title: 'Tile upgrade', items: [] },
      ];
      const client = createMockChain(rawRows);
      const clientOrders = await loadClientChangeOrders(client, 'acc-1', 'job-1');
      expect(clientOrders).toHaveLength(1);
      expect(clientOrders[0].title).toBe('Tile upgrade');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. change-orders-data: mutation lifecycle
  // ───────────────────────────────────────────────────────────────────────────

  describe('change-orders-data — mutations', () => {
    it('raiseChangeOrder creates a draft with defaulted title and trimmed notes', async () => {
      const createdRow = {
        id: 'co-new',
        job_id: 'job-1',
        status: 'draft',
        crew_id: 'crew-5',
        crew_name: 'Alex',
        title: 'Extra work found',
        field_note: 'Found leak',
        photo_paths: ['path/1.jpg'],
        items: [],
        amount: 0,
      };
      const client = createMockChain(createdRow);

      const order = await raiseChangeOrder(client, 'acc-1', 'job-1', {
        crewId: 'crew-5',
        crewName: 'Alex',
        title: '  ',
        fieldNote: 'Found leak  ',
        photoPaths: ['path/1.jpg'],
      });

      expect(order.id).toBe('co-new');
      expect(client.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'draft',
          title: 'Additional work found',
          field_note: 'Found leak',
        }),
      );
    });

    it('updateChangeOrder fails if change order is missing or not editable', async () => {
      // Missing
      const clientMissing = createMockChain(null);
      const res1 = await updateChangeOrder(clientMissing, 'acc-1', 'co-none', { title: 'Test' });
      expect(res1.ok).toBe(false);
      expect(res1.message).toContain('could not be found');

      // Not editable: status === 'sent'
      const clientSent = createMockChain({ id: 'co-sent', status: 'sent', items: [] });
      const res2 = await updateChangeOrder(clientSent, 'acc-1', 'co-sent', { title: 'New' });
      expect(res2.ok).toBe(false);
      expect(res2.message).toContain('Withdraw it and raise a new one');

      // Not editable: status === 'approved'
      const clientApproved = createMockChain({ id: 'co-app', status: 'approved', items: [] });
      const res3 = await updateChangeOrder(clientApproved, 'acc-1', 'co-app', { title: 'New' });
      expect(res3.ok).toBe(false);
      expect(res3.message).toContain('already been answered');
    });

    it('updateChangeOrder computes amount from items and patches fields on draft', async () => {
      const draft = { id: 'co-draft', status: 'draft', items: [] };
      const client = createMockChain(draft);

      const res = await updateChangeOrder(client, 'acc-1', 'co-draft', {
        title: 'New Deck Step',
        scope: 'Replace broken step',
        estimatedCost: 150,
        items: [
          { id: 'item-1', label: 'Lumber', amount: 200, kind: 'base', selected: true, recommended: false },
          { id: 'item-2', label: 'Finish stain', amount: 50, kind: 'base', selected: true, recommended: false },
        ],
      });

      expect(res.ok).toBe(true);
      expect(client.update).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'New Deck Step',
          scope: 'Replace broken step',
          estimated_cost: 150,
          amount: 250,
        }),
      );
    });

    it('sendChangeOrder checks blockers and transitions draft to sent', async () => {
      // Incomplete draft -> blocked
      const incomplete = {
        id: 'co-incomplete',
        status: 'draft',
        title: '',
        scope: '',
        amount: 0,
        items: [],
      };
      const clientBlocked = createMockChain(incomplete);
      const resBlocked = await sendChangeOrder(clientBlocked, 'acc-1', 'co-incomplete');
      expect(resBlocked.ok).toBe(false);
      expect(resBlocked.blockers?.length).toBeGreaterThan(0);

      // Complete draft -> success
      const readyDraft = {
        id: 'co-ready',
        status: 'draft',
        title: 'Gutter Guard Installation',
        scope: 'Install 50ft mesh guard',
        amount: 450,
        items: [{ id: '1', label: 'Gutter Guard', amount: 450, kind: 'base', selected: true }],
      };
      const sentOrder = { ...readyDraft, status: 'sent', sent_at: '2026-06-01T12:00:00Z' };

      const clientReady = createMockChain(readyDraft);
      // Mock sequential calls to maybeSingle: first for getChangeOrder, second for update
      clientReady.maybeSingle
        .mockResolvedValueOnce({ data: readyDraft, error: null })
        .mockResolvedValueOnce({ data: sentOrder, error: null });

      const resSuccess = await sendChangeOrder(clientReady, 'acc-1', 'co-ready');
      expect(resSuccess.ok).toBe(true);
      expect(resSuccess.order?.status).toBe('sent');
    });

    it('voidChangeOrder rejects approved change orders but voids other states', async () => {
      const clientApproved = createMockChain({ id: 'co-1', status: 'approved', items: [] });
      const resApproved = await voidChangeOrder(clientApproved, 'acc-1', 'co-1');
      expect(resApproved.ok).toBe(false);
      expect(resApproved.message).toContain('Withdrawing it would remove work');

      const clientDraft = createMockChain({ id: 'co-2', status: 'draft', items: [] });
      const resDraft = await voidChangeOrder(clientDraft, 'acc-1', 'co-2');
      expect(resDraft.ok).toBe(true);
      expect(clientDraft.update).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'void' }),
      );
    });

    it('respondToChangeOrder records approval and signature name', async () => {
      const approvedRow = {
        id: 'co-1',
        status: 'approved',
        signature_name: 'Jane Doe',
        responded_at: '2026-06-01T13:00:00Z',
        items: [],
      };

      const client = createMockChain(approvedRow);

      // Validation: empty name
      const emptyNameRes = await respondToChangeOrder(client, 'acc-1', 'co-1', {
        decision: 'approved',
        signatureName: '   ',
      });
      expect(emptyNameRes.ok).toBe(false);
      expect(emptyNameRes.message).toContain('Type your name');

      // Valid approval
      const res = await respondToChangeOrder(client, 'acc-1', 'co-1', {
        decision: 'approved',
        signatureName: 'Jane Doe',
      });
      expect(res.ok).toBe(true);
      expect(res.order?.status).toBe('approved');
      expect(client.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'approved',
          signature_name: 'Jane Doe',
          decline_reason: null,
        }),
      );
    });

    it('respondToChangeOrder records decline reason when rejected', async () => {
      const declinedRow = {
        id: 'co-1',
        status: 'declined',
        signature_name: 'Jane Doe',
        decline_reason: 'Too expensive for our budget',
        items: [],
      };

      const client = createMockChain(declinedRow);
      const res = await respondToChangeOrder(client, 'acc-1', 'co-1', {
        decision: 'declined',
        signatureName: 'Jane Doe',
        declineReason: 'Too expensive for our budget',
      });

      expect(res.ok).toBe(true);
      expect(res.order?.status).toBe('declined');
      expect(client.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'declined',
          signature_name: 'Jane Doe',
          decline_reason: 'Too expensive for our budget',
        }),
      );
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. cost-truth-data: burden resolution & rates
  // ───────────────────────────────────────────────────────────────────────────

  describe('cost-truth-data — calculations & defaults', () => {
    it('resolveCrewBurdenPct resolves personal crew rate, or account default, or 0% fallback', async () => {
      mockAdminSupabase.maybeSingle
        .mockResolvedValueOnce({ data: { default_burden_pct: 40 }, error: null });
      const callerClient = createMockChain({ burden_pct: 35 });

      const pct1 = await resolveCrewBurdenPct(callerClient, 'acc-1', 'crew-1');
      expect(pct1).toBe(35);

      mockAdminSupabase.maybeSingle
        .mockResolvedValueOnce({ data: { default_burden_pct: 40 }, error: null });
      const callerClientNull = createMockChain({ burden_pct: null });

      const pct2 = await resolveCrewBurdenPct(callerClientNull, 'acc-1', 'crew-2');
      expect(pct2).toBe(40);

      mockAdminSupabase.maybeSingle
        .mockResolvedValueOnce({ data: { default_burden_pct: 25 }, error: null });
      const pct3 = await resolveCrewBurdenPct(callerClient, 'acc-1', null);
      expect(pct3).toBe(25);
    });

    it('resolveCrewBurdenPct catches database errors gracefully and returns 0%', async () => {
      mockAdminSupabase.maybeSingle.mockRejectedValueOnce(new Error('Connection failed'));
      const callerClient = createMockChain();

      const pct = await resolveCrewBurdenPct(callerClient, 'acc-1', 'crew-1');
      expect(pct).toBe(0);
    });

    it('accountLoadedHourlyRate calculates median wage loaded with burden', async () => {
      const crewList = [
        { hourly_rate: 20, burden_pct: 20 },
        { hourly_rate: 30, burden_pct: 30 },
        { hourly_rate: 40, burden_pct: 25 },
      ];

      const callerClient = createMockChain(crewList);
      mockAdminSupabase.maybeSingle.mockResolvedValue({ data: { default_burden_pct: 25 }, error: null });

      const loadedRate = await accountLoadedHourlyRate(callerClient, 'acc-1');
      expect(loadedRate).toBe(39);
    });

    it('accountLoadedHourlyRate returns 0 when no crew or wage data exists', async () => {
      const callerClient = createMockChain([]);
      mockAdminSupabase.maybeSingle.mockResolvedValue({ data: null, error: null });

      const loadedRate = await accountLoadedHourlyRate(callerClient, 'acc-1');
      expect(loadedRate).toBe(0);
    });

    it('getMinMarginPct reads account min margin floor, bounded between 0 and 100', async () => {
      const client1 = createMockChain({ min_margin_pct: 22 });
      expect(await getMinMarginPct(client1, 'acc-1')).toBe(22);

      const client2 = createMockChain({ min_margin_pct: 0 });
      expect(await getMinMarginPct(client2, 'acc-1')).toBe(0);

      const client3 = createMockChain(null);
      expect(await getMinMarginPct(client3, 'acc-1')).toBe(15);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. margin-alerts: evaluation and triggers
  // ───────────────────────────────────────────────────────────────────────────

  describe('margin-alerts — evaluateAndTriggerMarginAlert', () => {
    it('returns untriggered if job is not found', async () => {
      mocks.getJob.mockResolvedValue(null);
      mocks.listCosts.mockResolvedValue([]);

      const result = await evaluateAndTriggerMarginAlert(mockAdminSupabase, 'acc-1', 'job-missing');
      expect(result.triggered).toBe(false);
    });

    it('does not trigger alert when margin is healthy and above floor', async () => {
      const job = { id: 'job-1', ref: 'JOB-101', client_name: 'Alice', quoted_amount: 1000 };
      mocks.getJob.mockResolvedValue(job);
      mocks.listCosts.mockResolvedValue([
        { amount: 500, burden_amount: 100, cost_source: 'receipt' },
      ]);
      mockAdminSupabase.maybeSingle.mockResolvedValue({
        data: { business_name: 'Acme Pro', min_margin_pct: 20 },
        error: null,
      });

      mocks.computeMargin.mockReturnValue({
        revenue: 1000,
        totalCost: 600,
        profit: 400,
        margin: 0.40,
      });

      const result = await evaluateAndTriggerMarginAlert(mockAdminSupabase, 'acc-1', 'job-1');
      expect(result.triggered).toBe(false);
      expect(result.marginPct).toBe(40);
      expect(result.profit).toBe(400);
      expect(mocks.createJobFeedEvent).not.toHaveBeenCalled();
      expect(mocks.sendContractorAlertEmail).not.toHaveBeenCalled();
    });

    it('triggers below_floor alert, creates job feed event, and sends email', async () => {
      const job = { id: 'job-1', ref: 'JOB-101', client_name: 'Alice', quoted_amount: 1000 };
      mocks.getJob.mockResolvedValue(job);
      mocks.listCosts.mockResolvedValue([
        { amount: 800, burden_amount: 100, cost_source: 'receipt' },
      ]);
      mockAdminSupabase.maybeSingle.mockResolvedValue({
        data: { business_name: 'Acme Pro', min_margin_pct: 20 },
        error: null,
      });

      mocks.computeMargin.mockReturnValue({
        revenue: 1000,
        totalCost: 900,
        profit: 100,
        margin: 0.10,
      });

      mockAdminSupabase.then = (resolve: any) =>
        Promise.resolve({ data: [], error: null }).then(resolve);

      mocks.getAccountOwnerEmail.mockResolvedValue('owner@acmepro.com');

      const result = await evaluateAndTriggerMarginAlert(
        mockAdminSupabase,
        'acc-1',
        'job-1',
        { description: 'Emergency valve', amount: 250, type: 'material' },
      );

      expect(result.triggered).toBe(true);
      expect(result.reason).toBe('below_floor');
      expect(result.marginPct).toBe(10);
      expect(result.feedEventCreated).toBe(true);
      expect(result.emailSent).toBe(true);

      expect(mocks.createJobFeedEvent).toHaveBeenCalledWith(
        mockAdminSupabase,
        'acc-1',
        'job-1',
        expect.objectContaining({
          kind: 'margin_alert',
          title: expect.stringContaining('Margin Warning: Below Floor Target'),
        }),
      );

      expect(mocks.sendContractorAlertEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientEmail: 'owner@acmepro.com',
          heading: 'Job Margin Below Floor Target',
          tone: 'warning',
        }),
      );
    });

    it('triggers running_loss alert when profit is negative', async () => {
      const job = { id: 'job-1', ref: 'JOB-101', client_name: 'Alice', quoted_amount: 1000 };
      mocks.getJob.mockResolvedValue(job);
      mocks.listCosts.mockResolvedValue([
        { amount: 1100, burden_amount: 100, cost_source: 'receipt' },
      ]);
      mockAdminSupabase.maybeSingle.mockResolvedValue({
        data: { business_name: 'Acme Pro', min_margin_pct: 20 },
        error: null,
      });

      mocks.computeMargin.mockReturnValue({
        revenue: 1000,
        totalCost: 1200,
        profit: -200,
        margin: -0.20,
      });

      mockAdminSupabase.then = (resolve: any) =>
        Promise.resolve({ data: [], error: null }).then(resolve);

      mocks.getAccountOwnerEmail.mockResolvedValue('owner@acmepro.com');

      const result = await evaluateAndTriggerMarginAlert(mockAdminSupabase, 'acc-1', 'job-1');

      expect(result.triggered).toBe(true);
      expect(result.reason).toBe('running_loss');
      expect(result.profit).toBe(-200);

      expect(mocks.createJobFeedEvent).toHaveBeenCalledWith(
        mockAdminSupabase,
        'acc-1',
        'job-1',
        expect.objectContaining({
          title: expect.stringContaining('Profit Warning: Job Operating at Loss'),
        }),
      );

      expect(mocks.sendContractorAlertEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          heading: 'Job Operating at a Loss',
          subject: expect.stringContaining('operating at a loss'),
        }),
      );
    });

    it('suppresses alert email when recent alerts occurred within cooldown window', async () => {
      const job = { id: 'job-1', ref: 'JOB-101', client_name: 'Alice', quoted_amount: 1000 };
      mocks.getJob.mockResolvedValue(job);
      mocks.listCosts.mockResolvedValue([]);
      mockAdminSupabase.maybeSingle.mockResolvedValue({
        data: { business_name: 'Acme Pro', min_margin_pct: 20 },
        error: null,
      });

      mocks.computeMargin.mockReturnValue({
        revenue: 1000,
        totalCost: 1200,
        profit: -200,
        margin: -0.20,
      });

      mockAdminSupabase.then = (resolve: any) =>
        Promise.resolve({
          data: [{ id: 'alert-1' }, { id: 'alert-2' }],
          error: null,
        }).then(resolve);

      const result = await evaluateAndTriggerMarginAlert(mockAdminSupabase, 'acc-1', 'job-1');

      expect(result.triggered).toBe(true);
      expect(result.feedEventCreated).toBe(true);
      expect(result.emailSent).toBe(false);
      expect(mocks.sendContractorAlertEmail).not.toHaveBeenCalled();
    });
  });
});
