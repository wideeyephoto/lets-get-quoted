import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  getCronTrouble: vi.fn(),
  fetchFeeWindow: vi.fn(),
  loadOverageSummary: vi.fn(),
  loadWorkspaceCreditLots: vi.fn(),
  loadWorkspaceStorageState: vi.fn(),
  loadActivePurchasedCapacitySubscriptions: vi.fn(),
  loadPurchasedSeats: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  createAdminClient: mocks.createAdminClient,
}));

vi.mock('@/lib/cron-runs', () => ({
  getCronTrouble: mocks.getCronTrouble,
}));

vi.mock('@/lib/platform-fees', () => ({
  fetchFeeWindow: mocks.fetchFeeWindow,
}));

vi.mock('@/lib/billing/overage-summary', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/billing/overage-summary')>();
  return {
    ...actual,
    loadOverageSummary: mocks.loadOverageSummary,
  };
});

vi.mock('@/lib/billing/credit-lots', () => ({
  loadWorkspaceCreditLots: mocks.loadWorkspaceCreditLots,
}));

vi.mock('@/lib/billing/storage-usage', () => ({
  loadWorkspaceStorageState: mocks.loadWorkspaceStorageState,
  formatStorageBytes: vi.fn().mockReturnValue('1.5 MB'),
}));

vi.mock('@/lib/billing/purchased-seats', () => ({
  loadActivePurchasedCapacitySubscriptions: mocks.loadActivePurchasedCapacitySubscriptions,
  loadPurchasedSeats: mocks.loadPurchasedSeats,
}));

import {
  calculateTimeRemaining,
  loadPendingIrreversibleWork,
} from '@/lib/admin-closures';

import {
  buildCommandCenterData,
} from '@/lib/admin-command-center';

import {
  loadAdminGoogleLsaOverview,
} from '@/lib/admin-google-lsa';

import {
  messageFailed,
  listAccountMessages,
} from '@/lib/admin-messages';

import {
  describeOverageResource,
  formatOverageTotal,
  formatOverageRate,
  remainingCapMillicents,
  loadAdminAccountUsageAndOverage,
} from '@/lib/admin-overage';

import {
  loadAccountApiSurface,
  loadOutboundWebhookFailures,
} from '@/lib/admin-public-api';

import {
  buildRiskQueue,
} from '@/lib/admin-risk';

import {
  searchEverything,
} from '@/lib/admin-search';

describe('Admin Operations Core Business Logic', () => {
  let fakeAdmin: any;

  const createFluentBuilder = (dataResult: any = null) => {
    const builder: any = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      gt: vi.fn().mockReturnThis(),
      lt: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
      ilike: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      range: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      insert: vi.fn().mockResolvedValue({ data: null, error: null }),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: dataResult, error: null }),
      single: vi.fn().mockResolvedValue({ data: dataResult, error: null }),
      then: (resolve: any) => Promise.resolve({ data: dataResult, error: null }).then(resolve),
    };
    return builder;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    fakeAdmin = {
      from: vi.fn(() => createFluentBuilder([])),
      rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
    };
    mocks.createAdminClient.mockReturnValue(fakeAdmin);
    mocks.getCronTrouble.mockResolvedValue([]);
    mocks.fetchFeeWindow.mockResolvedValue({
      paymentsProcessed: 50000,
      netFees: 1500,
      refunds: 0,
      availability: { payments: true, fees: true, refunds: true },
    });
  });

  describe('admin-closures', () => {
    it('calculateTimeRemaining accurately measures days, hours, and expiry', () => {
      const now = new Date('2026-06-15T12:00:00Z');
      const future = new Date('2026-06-20T12:00:00Z').toISOString();
      const past = new Date('2026-06-10T12:00:00Z').toISOString();

      const resFuture = calculateTimeRemaining(future, now);
      expect(resFuture.isExpired).toBe(false);
      expect(resFuture.days).toBe(5);

      const resPast = calculateTimeRemaining(past, now);
      expect(resPast.isExpired).toBe(true);
      expect(resPast.days).toBe(0);
    });

    it('loadPendingIrreversibleWork aggregates closures and deletions', async () => {
      fakeAdmin.from.mockImplementation((table: string) => {
        if (table === 'account_closure_jobs') {
          return createFluentBuilder([
            {
              id: 'job-1',
              closure_subject_id: 'subj-1',
              account_id: 'acc-1',
              business_name: 'Test Business',
              attempts: 1,
              max_attempts: 5,
              completed_at: null,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
          ]);
        }
        if (table === 'recoverable_deletions') {
          return createFluentBuilder([
            {
              id: 'del-1',
              account_id: 'acc-1',
              entity_type: 'lead',
              entity_id: 'lead-123',
              title: 'Test Lead',
              purge_eligible_at: new Date(Date.now() + 86400000 * 3).toISOString(),
              deleted_at: new Date().toISOString(),
            },
          ]);
        }
        return createFluentBuilder([]);
      });

      const work = await loadPendingIrreversibleWork(fakeAdmin);
      expect(work.activeClosures).toHaveLength(1);
      expect(work.recoverableDeletions).toHaveLength(1);
      expect(work.metrics.pendingClosuresCount).toBe(1);
      expect(work.metrics.expiringSoonTrashCount).toBe(1);
    });
  });

  describe('admin-command-center', () => {
    it('buildCommandCenterData compiles operational metrics and alerts', async () => {
      fakeAdmin.from.mockImplementation(() => createFluentBuilder([]));

      const data = await buildCommandCenterData(fakeAdmin, {
        role: 'super_admin',
        staffEmail: 'staff@example.com',
        range: '30d',
      });
      expect(data.range).toBe('30d');
      expect(Array.isArray(data.metrics)).toBe(true);
      expect(data.metrics.length).toBeGreaterThan(0);
      expect(data.disputes).toBeDefined();
    });
  });

  describe('admin-google-lsa', () => {
    it('loadAdminGoogleLsaOverview aggregates spend, connections, and wallets', async () => {
      fakeAdmin.from.mockImplementation((table: string) => {
        if (table === 'google_lsa_connections') {
          return createFluentBuilder([
            { account_id: 'acc-1', customer_id: 'cust-1', customer_name: 'Acme', last_sync_at: new Date().toISOString() },
          ]);
        }
        if (table === 'google_lsa_spend') {
          return createFluentBuilder([
            { account_id: 'acc-1', period_start: '2026-06-01', period_end: '2026-06-07', cost_dollars: 250 },
          ]);
        }
        if (table === 'google_lsa_leads') {
          return createFluentBuilder([
            { account_id: 'acc-1', google_lead_id: 'glead-1', lead_type: 'call', charge_status: 'charged' },
          ]);
        }
        if (table === 'sites') {
          return createFluentBuilder([
            {
              account_id: 'acc-1',
              content: {
                adCampaign: {
                  fundingModel: 'auto_refill_wallet',
                  status: 'active',
                  walletBalanceCents: 50000,
                  refillThresholdCents: 10000,
                  refillAmountCents: 50000,
                },
              },
            },
          ]);
        }
        if (table === 'accounts') {
          return createFluentBuilder([{ id: 'acc-1', business_name: 'Acme Roofing' }]);
        }
        return createFluentBuilder([]);
      });

      const overview = await loadAdminGoogleLsaOverview(fakeAdmin);
      expect(overview.totalSpendDollars).toBe(250);
      expect(overview.totalLeadsCount).toBe(1);
      expect(overview.activeConnectionsCount).toBe(1);
      expect(overview.activeWalletsCount).toBe(1);
      expect(overview.totalWalletBalanceDollars).toBe(500);
    });
  });

  describe('admin-messages', () => {
    it('messageFailed detects delivery problems for email and sms', () => {
      expect(messageFailed({ channel: 'email', status: 'bounced' } as any)).toBe(true);
      expect(messageFailed({ channel: 'email', status: 'complained' } as any)).toBe(true);
      expect(messageFailed({ channel: 'email', status: 'delivered' } as any)).toBe(false);

      expect(messageFailed({ channel: 'sms', status: 'failed' } as any)).toBe(true);
      expect(messageFailed({ channel: 'sms', status: 'opted_out' } as any)).toBe(true);
      expect(messageFailed({ channel: 'sms', status: 'sent' } as any)).toBe(false);
    });

    it('listAccountMessages returns sorted timeline across channels', async () => {
      const emailTime = '2026-06-01T10:00:00Z';
      const smsTime = '2026-06-01T12:00:00Z';

      fakeAdmin.from.mockImplementation((table: string) => {
        if (table === 'email_events') {
          return createFluentBuilder([
            { id: 'em-1', kind: 'invoice', recipient: 'client@example.com', status: 'delivered', occurred_at: emailTime },
          ]);
        }
        if (table === 'sms_events') {
          return createFluentBuilder([
            { id: 'sm-1', event_type: 'payment_request', phone_number: '+15125550199', status: 'delivered', sent_at: smsTime, body: 'Pay here' },
          ]);
        }
        return createFluentBuilder([]);
      });

      const messages = await listAccountMessages(fakeAdmin, 'acc-1');
      expect(messages).toHaveLength(2);
      expect(messages[0].id).toBe('sms:sm-1'); // More recent first
      expect(messages[1].id).toBe('email:em-1');
    });
  });

  describe('admin-overage pure helpers and workspace detail', () => {
    it('formats overage rates and total cleanly', () => {
      expect(describeOverageResource('text_segments')).toBe('Text credits');
      expect(describeOverageResource('unknown_key')).toBe('unknown_key');
      expect(formatOverageTotal(1500000)).toBe('$15.00');
      expect(formatOverageRate(10000)).toBe('$0.1');
      expect(remainingCapMillicents({ enabled: true, capCents: 1000, totalMillicents: 500000 } as any)).toBe(500000);
    });

    it('loadAdminAccountUsageAndOverage returns workspace usage profile', async () => {
      mocks.loadOverageSummary.mockResolvedValue({
        enabled: true,
        capCents: 5000,
        periodStart: '2026-06-01',
        periodEnd: '2026-06-30',
        lines: [],
        totalMillicents: 0,
        atCap: false,
        readable: true,
      });
      mocks.loadWorkspaceCreditLots.mockResolvedValue({ activeLots: [] });
      mocks.loadWorkspaceStorageState.mockResolvedValue({ totalBytes: 1500000 });
      mocks.loadActivePurchasedCapacitySubscriptions.mockResolvedValue([]);
      mocks.loadPurchasedSeats.mockResolvedValue({ crewUsers: 2, officeUsers: 1 });

      const detail = await loadAdminAccountUsageAndOverage(fakeAdmin, 'acc-1');
      expect(detail.summary.enabled).toBe(true);
      expect(detail.purchasedSeats.crewUsers).toBe(2);
    });
  });

  describe('admin-public-api', () => {
    it('loadAccountApiSurface and loadOutboundWebhookFailures function correctly', async () => {
      fakeAdmin.from.mockImplementation((table: string) => {
        if (table === 'api_credentials') {
          return createFluentBuilder([
            { id: 'cred-1', account_id: 'acc-1', name: 'Zapier', token_prefix: 'lgq_live_abc', scopes: ['leads.read'], created_at: new Date().toISOString() },
          ]);
        }
        if (table === 'api_request_audit') {
          return createFluentBuilder([
            { id: 'req-1', account_id: 'acc-1', credential_id: 'cred-1', method: 'GET', path: '/api/v1/leads', status_code: 200, created_at: new Date().toISOString() },
          ]);
        }
        if (table === 'webhook_subscriptions') {
          return createFluentBuilder([
            { id: 'wh-1', account_id: 'acc-1', target_url: 'https://example.com/hook', subscribed_events: ['lead.created'], status: 'active', failure_count: 0, created_at: new Date().toISOString() },
          ]);
        }
        if (table === 'webhook_deliveries') {
          return createFluentBuilder([
            { id: 'del-1', subscription_id: 'wh-1', account_id: 'acc-1', event_id: 'ev-1', target_url: 'https://example.com/hook', attempt_count: 3, status: 'failed', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
          ]);
        }
        if (table === 'accounts') {
          return createFluentBuilder([{ id: 'acc-1', business_name: 'Test Business' }]);
        }
        return createFluentBuilder([]);
      });

      const surface = await loadAccountApiSurface(fakeAdmin, 'acc-1');
      expect(surface.credentials).toHaveLength(1);
      expect(surface.recentRequests).toHaveLength(1);
      expect(surface.subscriptions).toHaveLength(1);

      const failures = await loadOutboundWebhookFailures(fakeAdmin);
      expect(failures).toHaveLength(1);
      expect(failures[0].status).toBe('failed');
    });
  });

  describe('admin-risk', () => {
    it('buildRiskQueue grades workspaces based on disputes, refunds, and activity', async () => {
      fakeAdmin.from.mockImplementation((table: string) => {
        if (table === 'accounts') {
          return createFluentBuilder([
            { id: 'acc-1', business_name: 'Risky Biz', account_number: 101, created_at: new Date().toISOString(), suspended_at: null },
          ]);
        }
        if (table === 'payments') {
          return createFluentBuilder([
            { account_id: 'acc-1', status: 'disputed', amount: 500, refunded_amount: 0, disputed_at: new Date().toISOString(), paid_at: new Date().toISOString() },
          ]);
        }
        if (table === 'extra_stop_requests') {
          return createFluentBuilder([]);
        }
        return createFluentBuilder([]);
      });

      const queue = await buildRiskQueue(fakeAdmin);
      expect(queue.rows).toHaveLength(1);
      expect(queue.rows[0].accountId).toBe('acc-1');
      expect(queue.rows[0].signals.disputedCount).toBe(1);
      expect(queue.rows[0].assessment.band).toBeDefined();
    });
  });

  describe('admin-search', () => {
    it('searchEverything queries across accounts, clients, quick stops, and payments', async () => {
      fakeAdmin.from.mockImplementation((table: string) => {
        if (table === 'accounts') {
          return createFluentBuilder([
            { id: 'acc-1', business_name: 'Apex Roofing', account_number: 101 },
          ]);
        }
        if (table === 'sites') {
          return createFluentBuilder([]);
        }
        if (table === 'clients') {
          return createFluentBuilder([
            { id: 'client-1', name: 'John Doe', phone: '5125550100', account_id: 'acc-1' },
          ]);
        }
        if (table === 'extra_stop_requests') {
          return createFluentBuilder([]);
        }
        if (table === 'payments') {
          return createFluentBuilder([]);
        }
        return createFluentBuilder([]);
      });

      const results = await searchEverything(fakeAdmin, 'Apex', { limit: 10 });
      expect(results.accounts).toHaveLength(1);
      expect(results.accounts[0].title).toBe('Apex Roofing');
    });
  });
});
