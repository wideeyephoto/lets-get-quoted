import { describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import {
  normalizeAngiLead,
  verifyAngiSignature,
  normalizeThumbtackLead,
  verifyThumbtackSignature,
  normalizeGenericMarketplaceLead,
} from '@/lib/marketplace-router/marketplace-adapters';

describe('Marketplace Adapters', () => {
  describe('Angi Leads Adapter', () => {
    it('verifies Angi Bearer token header', () => {
      const isValid = verifyAngiSignature({
        rawBody: '{}',
        signatureHeader: null,
        tokenHeader: 'Bearer secret_angi_token_123',
        expectedToken: 'secret_angi_token_123',
      });

      expect(isValid).toBe(true);
    });

    it('verifies Angi HMAC SHA256 signature', () => {
      const secret = 'angi_shared_secret_789';
      const body = JSON.stringify({ leadId: 'angi_12345' });
      const hmac = createHmac('sha256', secret).update(body).digest('hex');

      const isValid = verifyAngiSignature({
        rawBody: body,
        signatureHeader: `sha256=${hmac}`,
        tokenHeader: null,
        secret,
      });

      expect(isValid).toBe(true);
    });

    it('normalizes Angi / HomeAdvisor lead payload correctly', () => {
      const payload = {
        leadId: 'angi_lead_98765',
        consumer: {
          name: 'Sarah Connor',
          phone: '512-555-4321',
          email: 'sarah@resistance.org',
          address: {
            street: '456 Elm St',
            city: 'Austin',
            state: 'TX',
            postalCode: '78704',
          },
        },
        service: {
          taskName: 'HVAC Air Conditioning Replacement',
          description: 'AC unit stopped blowing cold air yesterday.',
        },
        timing: 'Immediately / Emergency',
        spId: 'contractor_acc_1',
      };

      const normalized = normalizeAngiLead(payload, true);

      expect(normalized.provider).toBe('angi');
      expect(normalized.providerLeadId).toBe('angi_lead_98765');
      expect(normalized.customer.name).toBe('Sarah Connor');
      expect(normalized.customer.phone).toBe('512-555-4321');
      expect(normalized.customer.email).toBe('sarah@resistance.org');
      expect(normalized.customer.address).toBe('456 Elm St, Austin, TX, 78704');
      expect(normalized.customer.city).toBe('Austin');
      expect(normalized.customer.zip).toBe('78704');
      expect(normalized.project.trade).toBe('HVAC Air Conditioning Replacement');
      expect(normalized.project.isUrgent).toBe(true);
      expect(normalized.attribution?.source).toBe('angi');
      expect(normalized.attribution?.medium).toBe('paid_lead');
      expect(normalized.targetAccountHint?.partnerContractorId).toBe('contractor_acc_1');
      expect(normalized.signatureVerified).toBe(true);
    });
  });

  describe('Thumbtack Leads Adapter', () => {
    it('verifies Thumbtack signature header', () => {
      const secret = 'tt_secret_token_abc';
      const body = JSON.stringify({ inquiryId: 'tt_req_99' });
      const hmac = createHmac('sha256', secret).update(body).digest('hex');

      const isValid = verifyThumbtackSignature({
        rawBody: body,
        signatureHeader: hmac,
        tokenHeader: null,
        secret,
      });

      expect(isValid).toBe(true);
    });

    it('normalizes Thumbtack direct inquiry payload correctly', () => {
      const payload = {
        inquiryId: 'tt_inq_54321',
        customer: {
          fullName: 'Jim Halpert',
          phone: '(570) 555-0144',
          email: 'jim@athlead.com',
        },
        location: {
          address: '742 Evergreen Terrace',
          city: 'Philadelphia',
          state: 'PA',
          zipCode: '19104',
        },
        categoryName: 'Interior House Painting',
        details: 'Looking to paint 3 bedrooms and living room before moving in.',
        schedulePreference: 'Within the next 2 weeks',
        proId: 'acc_pro_123',
      };

      const normalized = normalizeThumbtackLead(payload, true);

      expect(normalized.provider).toBe('thumbtack');
      expect(normalized.providerLeadId).toBe('tt_inq_54321');
      expect(normalized.customer.name).toBe('Jim Halpert');
      expect(normalized.customer.phone).toBe('(570) 555-0144');
      expect(normalized.customer.email).toBe('jim@athlead.com');
      expect(normalized.customer.address).toBe('742 Evergreen Terrace, Philadelphia, PA, 19104');
      expect(normalized.project.trade).toBe('Interior House Painting');
      expect(normalized.project.message).toBe('Looking to paint 3 bedrooms and living room before moving in.');
      expect(normalized.attribution?.source).toBe('thumbtack');
      expect(normalized.attribution?.medium).toBe('marketplace_lead');
      expect(normalized.targetAccountHint?.partnerContractorId).toBe('acc_pro_123');
      expect(normalized.signatureVerified).toBe(true);
    });
  });

  describe('Generic / Custom Marketplace Adapter', () => {
    it('normalizes custom webhook payload', () => {
      const payload = {
        id: 'cust_lead_111',
        name: 'Dwight Schrute',
        phone: '570-555-BEET',
        email: 'dwight@schrute-farms.com',
        address: 'Schrute Farms, Honesdale, PA 18431',
        trade: 'Barn Siding Repair',
        message: 'Need wooden plank replacement on north barn wall',
        timeline: 'Urgent',
        accountId: 'acc_target_456',
      };

      const normalized = normalizeGenericMarketplaceLead(payload, 'marketplace_custom', true);

      expect(normalized.provider).toBe('marketplace_custom');
      expect(normalized.providerLeadId).toBe('cust_lead_111');
      expect(normalized.customer.name).toBe('Dwight Schrute');
      expect(normalized.customer.phone).toBe('570-555-BEET');
      expect(normalized.project.trade).toBe('Barn Siding Repair');
      expect(normalized.project.isUrgent).toBe(true);
      expect(normalized.targetAccountHint?.accountId).toBe('acc_target_456');
    });
  });
});
