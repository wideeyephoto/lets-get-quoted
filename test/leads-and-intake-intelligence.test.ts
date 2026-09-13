/**
 * Lead Lifecycle, Scoping & Intake Intelligence Coverage Test
 *
 * Targets:
 *   - src/lib/leads.ts (triage extraction, snoozing, lead sources, response timing,
 *     status transitions, job conversions, quote visits, stale lead expiration)
 *   - src/lib/intake-quality.ts (intakeQuality score calculation, fit/expectation/response signals)
 *   - src/lib/trade-intake-presets.ts (trade family matching, preset defaults, filter pre-fills)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  createJob: vi.fn(),
  getJob: vi.fn(),
  findOrCreateClientId: vi.fn(),
}));

vi.mock('@/lib/jobs', () => ({
  createJob: mocks.createJob,
  getJob: mocks.getJob,
  deleteJob: vi.fn(),
  parseQuoteItems: vi.fn((x) => (Array.isArray(x) ? x : [])),
}));

vi.mock('@/lib/clients', () => ({
  findOrCreateClientId: mocks.findOrCreateClientId,
}));

import {
  getLeadTriage,
  isLeadSnoozed,
  formatLeadSource,
  formatElapsedTime,
  leadOverdueLabel,
  getRequestResponseMs,
  formatDuration,
  getAverageRequestResponseMs,
  leadLostAfterLabel,
  normalizeLeadLostAfterDays,
  createLead,
  updateLeadStatus,
  convertLeadToJob,
  unconvertLeadFromJob,
  scheduleLeadQuoteVisit,
  clearLeadQuoteVisit,
  expireStaleLeads,
  type Lead,
  type LeadTriage,
  type LeadSource,
} from '@/lib/leads';

import {
  intakeQuality,
} from '@/lib/intake-quality';

import {
  TRADE_INTAKE_PRESETS,
  matchTradePreset,
  getTradeIntakePresetsList,
  getDefaultLeadFiltersForTrade,
} from '@/lib/trade-intake-presets';

describe('Lead Lifecycle & Intake Intelligence Engine', () => {
  let mockSupabase: any;

  function createQueryChain(resultData: any = null, resultError: any = null) {
    const chain: any = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      lt: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: resultData, error: resultError }),
      maybeSingle: vi.fn().mockResolvedValue({ data: resultData, error: resultError }),
      then: (resolve: any) => Promise.resolve({ data: resultData, error: resultError }).then(resolve),
    };
    return chain;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase = createQueryChain();
    mocks.findOrCreateClientId.mockResolvedValue('client-uuid-1');
  });

  // ── leads: pure triage & formatting helpers ─────────────────────────────────

  describe('leads — triage & presentation helpers', () => {
    it('getLeadTriage provides fallback defaults for missing or empty triage', () => {
      const triage = getLeadTriage({ triage: null } as any);
      expect(triage.score).toBe('warm');
      expect(triage.flags).toEqual([]);
    });

    it('getLeadTriage parses structured triage data correctly', () => {
      const custom: LeadTriage = {
        score: 'hot',
        flags: ['phone_verified', 'high_value'],
        timeline: 'ASAP',
      };
      const triage = getLeadTriage({ triage: custom } as any);
      expect(triage.score).toBe('hot');
      expect(triage.flags).toContain('phone_verified');
      expect(triage.timeline).toBe('ASAP');
    });

    it('isLeadSnoozed correctly checks future vs past dates', () => {
      const future = new Date(Date.now() + 86400000).toISOString();
      const past = new Date(Date.now() - 86400000).toISOString();

      expect(isLeadSnoozed({ score: 'warm', flags: [], snoozedUntil: future })).toBe(true);
      expect(isLeadSnoozed({ score: 'warm', flags: [], snoozedUntil: past })).toBe(false);
      expect(isLeadSnoozed({ score: 'warm', flags: [], snoozedUntil: null })).toBe(false);
    });

    it('formatLeadSource maps canonical source identifiers to human labels', () => {
      expect(formatLeadSource('website_form')).toBe('Website form');
      expect(formatLeadSource('ai_voice')).toBe('AI receptionist');
      expect(formatLeadSource('google_lsa')).toBe('Google Local Services Ads');
      expect(formatLeadSource('meta_lead_ads')).toBe('Meta Lead Ads');
      expect(formatLeadSource('neighborhood_halo')).toBe('Neighborhood Halo');
      expect(formatLeadSource('manual')).toBe('Manual');
    });

    it('formatElapsedTime renders relative timestamps accurately', () => {
      const now = new Date('2026-06-01T12:00:00Z');
      const oneMinAgo = new Date('2026-06-01T11:59:00Z').toISOString();
      const fiveMinAgo = new Date('2026-06-01T11:55:00Z').toISOString();
      const twoHoursAgo = new Date('2026-06-01T10:00:00Z').toISOString();
      const threeDaysAgo = new Date('2026-05-29T12:00:00Z').toISOString();

      expect(formatElapsedTime(oneMinAgo, now)).toBe('1m');
      expect(formatElapsedTime(fiveMinAgo, now)).toBe('5m');
      expect(formatElapsedTime(twoHoursAgo, now)).toBe('2h');
      expect(formatElapsedTime(threeDaysAgo, now)).toBe('3 days');
    });

    it('formatDuration formats milliseconds into human-readable strings', () => {
      expect(formatDuration(null)).toBe('No responses yet');
      expect(formatDuration(45 * 1000)).toBe('1m');
      expect(formatDuration(15 * 60 * 1000)).toBe('15m');
      expect(formatDuration(2.5 * 3600 * 1000)).toBe('3h');
      expect(formatDuration(48 * 3600 * 1000)).toBe('2d');
    });

    it('leadOverdueLabel identifies uncontacted leads past response threshold', () => {
      const now = new Date('2026-06-02T12:00:00Z');
      const recent = new Date('2026-06-02T11:55:00Z').toISOString();
      const overdue = new Date('2026-06-01T10:00:00Z').toISOString(); // 26h ago

      expect(leadOverdueLabel({ status: 'contacted', created_at: overdue } as any, now)).toBeNull();
      expect(leadOverdueLabel({ status: 'new', created_at: recent } as any, now)).toBeNull();
      expect(leadOverdueLabel({ status: 'new', created_at: overdue } as any, now)).toBe('Overdue — no reply logged in 26h');
    });

    it('getAverageRequestResponseMs computes mean across valid response times', () => {
      const leads = [
        {
          created_at: '2026-01-01T10:00:00Z',
          triage: { contactLog: [{ at: '2026-01-01T10:10:00Z', label: 'Called' }] },
        },
        {
          created_at: '2026-01-01T11:00:00Z',
          triage: { contactLog: [{ at: '2026-01-01T11:20:00Z', label: 'Texted' }] },
        },
      ] as unknown as Lead[];

      // 10 min (600,000 ms) and 20 min (1,200,000 ms) -> average 15 min (900,000 ms)
      const avg = getAverageRequestResponseMs(leads);
      expect(avg).toBe(15 * 60 * 1000);
    });

    it('normalizeLeadLostAfterDays constrains values to permitted set', () => {
      expect(normalizeLeadLostAfterDays(14)).toBe(14);
      expect(normalizeLeadLostAfterDays(60)).toBe(60);
      expect(normalizeLeadLostAfterDays(-5)).toBe(30); // fallback for negative
      expect(normalizeLeadLostAfterDays(5000)).toBe(30); // fallback for > 3650
      expect(normalizeLeadLostAfterDays('invalid')).toBe(30);
      expect(leadLostAfterLabel(30)).toBe('30 days');
    });
  });

  // ── leads: database actions & lifecycle ─────────────────────────────────────

  describe('leads — database lifecycle mutations', () => {
    it('createLead normalizes contact preferences and client linking', async () => {
      const mockCreated = {
        id: 'lead-1',
        account_id: 'acc-1',
        name: 'Sarah Homeowner',
        status: 'new',
      };

      const chain = createQueryChain(null);
      chain.insert = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: mockCreated, error: null }),
        }),
      });

      const lead = await createLead(chain, 'acc-1', {
        name: 'Sarah Homeowner',
        phone: '555-123-4567',
        email: 'sarah@example.com',
        source: 'website_form',
      });

      expect(lead.id).toBe('lead-1');
      expect(mocks.findOrCreateClientId).toHaveBeenCalled();
      expect(chain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          account_id: 'acc-1',
          name: 'Sarah Homeowner',
          source: 'website_form',
        }),
      );
    });

    it('updateLeadStatus updates status and records timestamp', async () => {
      const chain = createQueryChain({ id: 'lead-1', status: 'contacted' });
      chain.update = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { id: 'lead-1', status: 'contacted' }, error: null }),
            }),
          }),
        }),
      });

      const updated = await updateLeadStatus(chain, 'acc-1', 'lead-1', 'contacted');
      expect(updated.status).toBe('contacted');
    });

    it('convertLeadToJob invokes createJob and marks lead won', async () => {
      const mockLead: Lead = {
        id: 'lead-1',
        account_id: 'acc-1',
        client_id: 'client-1',
        name: 'John Smith',
        phone: '555-222-3333',
        email: 'john@example.com',
        address: '100 Maple St',
        project_type: 'Roof repair',
        message: 'Leak near chimney',
        created_at: '2026-01-01T00:00:00Z',
        status: 'new',
        source: 'website_form',
        converted_job: null,
        triage: { score: 'hot', flags: [] },
      } as unknown as Lead;

      const chain = createQueryChain(mockLead);
      chain.update = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      });

      mocks.createJob.mockResolvedValue({ id: 'job-created-99' });

      const job = await convertLeadToJob(chain, 'acc-1', 'lead-1', 750, 8);

      expect(job.id).toBe('job-created-99');
      expect(mocks.createJob).toHaveBeenCalledWith(
        chain,
        'acc-1',
        expect.objectContaining({
          clientName: 'John Smith',
          quotedAmount: 750,
          estimatedHours: 8,
        }),
      );
    });

    it('unconvertLeadFromJob unlinks job and resets status', async () => {
      const mockLead: Lead = {
        id: 'lead-1',
        account_id: 'acc-1',
        name: 'John Smith',
        converted_job: 'job-created-99',
        status: 'quoted',
        quote_visit: null,
        triage: { score: 'hot', flags: [] },
      } as unknown as Lead;

      const restoredLead = { ...mockLead, converted_job: null, status: 'new' };

      const chain = createQueryChain(mockLead);
      chain.update = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: restoredLead, error: null }),
            }),
          }),
        }),
      });

      mocks.getJob.mockResolvedValue({ id: 'job-created-99', quote_items: [] });

      const result = await unconvertLeadFromJob(chain, 'acc-1', 'lead-1');
      expect(result.converted_job).toBeNull();
      expect(result.status).toBe('new');
    });

    it('scheduleLeadQuoteVisit sets quote appointment timestamps', async () => {
      const chain = createQueryChain({ id: 'lead-1', status: 'new' });
      chain.update = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: 'lead-1', quote_visit: { scheduledFor: '2026-06-15' } },
                error: null,
              }),
            }),
          }),
        }),
      });

      const updated = await scheduleLeadQuoteVisit(chain, 'acc-1', 'lead-1', {
        date: '2026-06-15',
        time: '14:00',
      });

      expect(updated.quote_visit).toBeDefined();
    });

    it('clearLeadQuoteVisit removes scheduled visit details', async () => {
      const chain = createQueryChain(null);
      chain.update = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { id: 'lead-1', quote_visit: null }, error: null }),
            }),
          }),
        }),
      });

      const updated = await clearLeadQuoteVisit(chain, 'acc-1', 'lead-1');
      expect(updated.quote_visit).toBeNull();
    });

    it('expireStaleLeads updates old new leads to lost status', async () => {
      const chain = createQueryChain([{ id: 'stale-lead-1' }]);
      chain.update = vi.fn().mockReturnValue(chain);

      await expireStaleLeads(chain, 'acc-1', 14);
      expect(chain.from).toHaveBeenCalledWith('leads');
      expect(chain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'lost',
        }),
      );
    });
  });

  // ── intake-quality ──────────────────────────────────────────────────────────

  describe('intake-quality — qualification score calculation', () => {
    it('rates intake High when fit, expectations, and response signals are all strong', () => {
      const result = intakeQuality({
        askTimeline: true,
        serviceAreaGate: true,
        phoneVerification: true,
        customerTextingReady: true,
        minJobAmount: 500,
        exclusionCount: 3,
        emailField: 'required',
        fullyBooked: false,
      });

      expect(result.score).toBe('High');
      expect(result.filtersOn).toBe(3);
      expect(result.signals).toHaveLength(3);

      const fit = result.signals.find((s) => s.key === 'fit');
      expect(fit?.tone).toBe('strong');
      expect(fit?.label).toBe('Strong impact');

      const exp = result.signals.find((s) => s.key === 'expectations');
      expect(exp?.tone).toBe('strong');

      const resp = result.signals.find((s) => s.key === 'response');
      expect(resp?.tone).toBe('strong');
    });

    it('rates intake Low when no filters or expectations are configured', () => {
      const result = intakeQuality({
        askTimeline: false,
        serviceAreaGate: false,
        phoneVerification: false,
        minJobAmount: 0,
        exclusionCount: 0,
        emailField: 'off',
        fullyBooked: false,
      });

      expect(result.score).toBe('Low');
      expect(result.filtersOn).toBe(0);

      const fit = result.signals.find((s) => s.key === 'fit');
      expect(fit?.tone).toBe('weak');
      expect(fit?.title).toBe('Nothing is qualifying your leads');

      const exp = result.signals.find((s) => s.key === 'expectations');
      expect(exp?.tone).toBe('weak');
    });

    it('disables phone verification operational status if customer texting is not ready', () => {
      const result = intakeQuality({
        askTimeline: false,
        serviceAreaGate: false,
        phoneVerification: true,
        customerTextingReady: false,
        minJobAmount: 0,
        exclusionCount: 0,
        emailField: 'optional',
        fullyBooked: false,
      });

      // phoneVerification is on, but texting is not ready, so operational filter count is 0
      expect(result.filtersOn).toBe(0);
    });
  });

  // ── trade-intake-presets ────────────────────────────────────────────────────

  describe('trade-intake-presets — presets & matching', () => {
    it('defines calibrated presets for standard trade families', () => {
      expect(TRADE_INTAKE_PRESETS.roofing).toBeDefined();
      expect(TRADE_INTAKE_PRESETS.roofing.minJobAmount).toBe(500);
      expect(TRADE_INTAKE_PRESETS.roofing.highValueLeadAmount).toBe(12000);
      expect(TRADE_INTAKE_PRESETS.roofing.exclusions).toContain('slate roofs');

      expect(TRADE_INTAKE_PRESETS.plumbing).toBeDefined();
      expect(TRADE_INTAKE_PRESETS.electrical).toBeDefined();
      expect(TRADE_INTAKE_PRESETS.hvac).toBeDefined();
    });

    it('matchTradePreset resolves trade strings to appropriate preset', () => {
      const roofingMatch = matchTradePreset('Residential Roofing and Shingles');
      expect(roofingMatch.id).toBe('roofing');

      const plumbingMatch = matchTradePreset('Master Plumber Emergency Service');
      expect(plumbingMatch.id).toBe('plumbing');

      const fallback = matchTradePreset('Exotic Mystery Work');
      expect(fallback.id).toBe('general');
    });

    it('getTradeIntakePresetsList excludes unknown internal preset', () => {
      const list = getTradeIntakePresetsList();
      expect(list.length).toBeGreaterThanOrEqual(10);
      expect(list.some((p) => p.id === 'unknown')).toBe(false);
    });

    it('getDefaultLeadFiltersForTrade returns pre-filled minJobAmount and exclusions', () => {
      const filters = getDefaultLeadFiltersForTrade('HVAC Installation');
      expect(filters.minJobAmount).toBeGreaterThan(0);
      expect(filters.exclusions.length).toBeGreaterThan(0);
    });
  });
});
