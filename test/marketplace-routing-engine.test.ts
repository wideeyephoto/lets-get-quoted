import { describe, expect, it, vi } from 'vitest';
import {
  mapProviderToLeadSource,
  routeMarketplaceLead,
  resolveTargetAccount,
} from '@/lib/marketplace-router/routing-engine';
import type { MarketplaceInboundLead } from '@/lib/marketplace-router/types';

describe('Marketplace Lead Routing Engine', () => {
  describe('Provider to LeadSource Mapping', () => {
    it('maps meta_lead_ads to meta_lead_ads', () => {
      expect(mapProviderToLeadSource('meta_lead_ads')).toBe('meta_lead_ads');
    });

    it('maps angi to angi', () => {
      expect(mapProviderToLeadSource('angi')).toBe('angi');
    });

    it('maps thumbtack to thumbtack', () => {
      expect(mapProviderToLeadSource('thumbtack')).toBe('thumbtack');
    });

    it('maps generic providers to marketplace', () => {
      expect(mapProviderToLeadSource('marketplace_custom')).toBe('marketplace');
      expect(mapProviderToLeadSource('nextdoor')).toBe('marketplace');
    });
  });

  describe('Target Account Resolution', () => {
    it('prefers explicit accountId if provided', async () => {
      const adminMock = {} as any;
      const inbound: MarketplaceInboundLead = {
        provider: 'angi',
        providerLeadId: 'lead_1',
        customer: { name: 'Alice' },
        project: {},
      };

      const accountId = await resolveTargetAccount(adminMock, inbound, 'explicit-acc-123');
      expect(accountId).toBe('explicit-acc-123');
    });

    it('uses targetAccountHint.accountId if available', async () => {
      const adminMock = {} as any;
      const inbound: MarketplaceInboundLead = {
        provider: 'thumbtack',
        providerLeadId: 'lead_2',
        customer: { name: 'Bob' },
        project: {},
        targetAccountHint: { accountId: 'hint-acc-456' },
      };

      const accountId = await resolveTargetAccount(adminMock, inbound);
      expect(accountId).toBe('hint-acc-456');
    });
  });

  describe('Routing Engine Execution & Deduplication', () => {
    it('routes a new marketplace lead, applies attribution and creates lead in database', async () => {
      const mockLead = {
        id: 'lead-created-123',
        account_id: 'acc-test-1',
        source: 'meta_lead_ads',
        status: 'new',
        name: 'Pam Beesly',
        phone: '555-123-4567',
        email: 'pam@dundermifflin.com',
        address: '1725 Slough Ave, Scranton, PA',
        project_type: 'Reception Desk Remodel',
        source_marketplace_ref: 'meta_lead_ads:meta_lead_999',
        triage: {
          score: 'hot',
          flags: ['marketplace_lead', 'meta_lead_ad'],
        },
      };

      const adminMock = {
        from: vi.fn((table: string) => {
          if (table === 'accounts') {
            return {
              select: vi.fn().mockReturnThis(),
              order: vi.fn().mockReturnThis(),
              limit: vi.fn().mockResolvedValue({ data: [{ id: 'acc-test-1' }] }),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: 'acc-test-1', company_name: 'Scranton Builders', high_value_sms_enabled: false },
              }),
            };
          }
          if (table === 'leads') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({ data: null }), // No duplicate
                  }),
                  maybeSingle: vi.fn().mockResolvedValue({ data: null }),
                }),
                maybeSingle: vi.fn().mockResolvedValue({ data: null }),
              }),
              insert: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: mockLead, error: null }),
                }),
              }),
              upsert: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: mockLead, error: null }),
                  single: vi.fn().mockResolvedValue({ data: mockLead, error: null }),
                }),
              }),
              update: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ error: null }),
              }),
            };
          }
          if (table === 'marketplace_lead_receipts') {
            return {
              upsert: vi.fn().mockResolvedValue({ error: null }),
            };
          }
          if (table === 'clients') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    limit: vi.fn().mockReturnValue({
                      maybeSingle: vi.fn().mockResolvedValue({ data: null }),
                    }),
                    maybeSingle: vi.fn().mockResolvedValue({ data: null }),
                  }),
                  limit: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({ data: null }),
                  }),
                  maybeSingle: vi.fn().mockResolvedValue({ data: null }),
                }),
                limit: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: null }),
                }),
                maybeSingle: vi.fn().mockResolvedValue({ data: null }),
              }),
              insert: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: { id: 'client-1' }, error: null }),
                }),
              }),
            };
          }
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null }),
          };
        }),
      } as any;

      const inbound: MarketplaceInboundLead = {
        provider: 'meta_lead_ads',
        providerLeadId: 'meta_lead_999',
        customer: {
          name: 'Pam Beesly',
          phone: '555-123-4567',
          email: 'pam@dundermifflin.com',
          address: '1725 Slough Ave, Scranton, PA',
        },
        project: {
          trade: 'Remodeling',
          projectType: 'Reception Desk Remodel',
          message: 'Looking for a custom oak reception desk.',
          timeline: 'Within 1 month',
        },
        attribution: {
          source: 'facebook',
          medium: 'meta_lead_ad',
          campaign: 'spring_office_remodel',
          clickId: 'meta_lead_999',
          clickIdType: 'fbclid',
        },
        signatureVerified: true,
      };

      const result = await routeMarketplaceLead(inbound, {
        admin: adminMock,
        explicitAccountId: 'acc-test-1',
        skipSpeedToLeadSms: true,
        skipOwnerAlerts: true,
      });

      expect(result.success).toBe(true);
      expect(result.disposition).toBe('routed');
      expect(result.leadId).toBe('lead-created-123');
      expect(result.accountId).toBe('acc-test-1');
      expect(result.isDuplicate).toBeFalsy();
    });

    it('safely recognizes duplicate replay and skips creating a duplicate lead', async () => {
      const existingLead = {
        id: 'lead-existing-555',
        account_id: 'acc-test-1',
        source: 'angi',
        status: 'contacted',
        name: 'Stanley Hudson',
        source_marketplace_ref: 'angi:angi_lead_777',
      };

      const adminMock = {
        from: vi.fn((table: string) => {
          if (table === 'leads') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({ data: existingLead }), // Duplicate found
            };
          }
          if (table === 'marketplace_lead_receipts') {
            return {
              upsert: vi.fn().mockResolvedValue({ error: null }),
            };
          }
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null }),
          };
        }),
      } as any;

      const inbound: MarketplaceInboundLead = {
        provider: 'angi',
        providerLeadId: 'angi_lead_777',
        customer: { name: 'Stanley Hudson', phone: '555-888-9999' },
        project: { trade: 'Pretzel Stand Construction' },
      };

      const result = await routeMarketplaceLead(inbound, {
        admin: adminMock,
        explicitAccountId: 'acc-test-1',
        skipSpeedToLeadSms: true,
        skipOwnerAlerts: true,
      });

      expect(result.success).toBe(true);
      expect(result.disposition).toBe('duplicate');
      expect(result.isDuplicate).toBe(true);
      expect(result.leadId).toBe('lead-existing-555');
    });
  });
});
