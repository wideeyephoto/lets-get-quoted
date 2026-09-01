import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as metaGet, POST as metaPost } from '@/app/api/webhooks/meta-leads/route';
import { POST as marketplacePost } from '@/app/api/webhooks/marketplace/[provider]/route';
import * as metaAdsModule from '@/lib/marketplace-router/meta-lead-ads';
import * as routingEngineModule from '@/lib/marketplace-router/routing-engine';

describe('Marketplace Webhook API Routes', () => {
  describe('/api/webhooks/meta-leads', () => {
    it('handles GET challenge handshake successfully', async () => {
      process.env.META_WEBHOOK_VERIFY_TOKEN = 'test_verify_token';

      const request = new NextRequest(
        'https://app.letsgetquoted.com/api/webhooks/meta-leads?hub.mode=subscribe&hub.verify_token=test_verify_token&hub.challenge=challenge_code_123'
      );

      const response = await metaGet(request);
      expect(response.status).toBe(200);
      const text = await response.text();
      expect(text).toBe('challenge_code_123');
    });

    it('rejects GET challenge with wrong token', async () => {
      process.env.META_WEBHOOK_VERIFY_TOKEN = 'test_verify_token';

      const request = new NextRequest(
        'https://app.letsgetquoted.com/api/webhooks/meta-leads?hub.mode=subscribe&hub.verify_token=wrong_token&hub.challenge=challenge_code_123'
      );

      const response = await metaGet(request);
      expect(response.status).toBe(403);
    });

    it('handles POST leadgen event and routes through marketplace router', async () => {
      const mockEvent = {
        leadgen_id: 'leadgen_test_101',
        form_id: 'form_101',
        page_id: 'page_101',
      };

      vi.spyOn(metaAdsModule, 'parseMetaWebhookPayload').mockReturnValue([mockEvent]);
      vi.spyOn(metaAdsModule, 'fetchMetaLeadDetails').mockResolvedValue({
        id: 'leadgen_test_101',
        field_data: [
          { name: 'full_name', values: ['Andy Bernard'] },
          { name: 'phone_number', values: ['+15552223333'] },
        ],
      });
      vi.spyOn(routingEngineModule, 'routeMarketplaceLead').mockResolvedValue({
        success: true,
        disposition: 'routed',
        leadId: 'lead_routed_999',
        accountId: 'acc_1',
        message: 'Routed successfully',
      });

      const body = { object: 'page', entry: [{ id: 'page_101', time: 123, changes: [{ field: 'leadgen', value: mockEvent }] }] };
      const request = new NextRequest('https://app.letsgetquoted.com/api/webhooks/meta-leads?accountId=acc_1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const response = await metaPost(request);
      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.ok).toBe(true);
      expect(json.processed).toBe(1);
      expect(json.results[0].leadId).toBe('lead_routed_999');
    });
  });

  describe('/api/webhooks/marketplace/[provider]', () => {
    it('handles Angi webhook POST and routes lead', async () => {
      vi.spyOn(routingEngineModule, 'routeMarketplaceLead').mockResolvedValue({
        success: true,
        disposition: 'routed',
        leadId: 'lead_angi_888',
        accountId: 'acc_angi_1',
        speedToLeadDispatched: true,
        message: 'Routed Angi lead',
      });

      const angiPayload = {
        leadId: 'angi_req_777',
        consumer: { name: 'Phyllis Vance', phone: '555-444-3333' },
        service: { taskName: 'Custom Refrigerator Enclosure' },
      };

      const request = new NextRequest(
        'https://app.letsgetquoted.com/api/webhooks/marketplace/angi?accountId=acc_angi_1',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(angiPayload),
        }
      );

      const response = await marketplacePost(request, {
        params: Promise.resolve({ provider: 'angi' }),
      });

      expect(response.status).toBe(201);
      const json = await response.json();
      expect(json.ok).toBe(true);
      expect(json.disposition).toBe('routed');
      expect(json.leadId).toBe('lead_angi_888');
    });

    it('handles Thumbtack webhook POST and routes lead', async () => {
      vi.spyOn(routingEngineModule, 'routeMarketplaceLead').mockResolvedValue({
        success: true,
        disposition: 'routed',
        leadId: 'lead_tt_444',
        accountId: 'acc_tt_1',
        speedToLeadDispatched: true,
        message: 'Routed Thumbtack lead',
      });

      const ttPayload = {
        inquiryId: 'tt_inq_123',
        customer: { name: 'Kevin Malone', phone: '555-999-1111' },
        categoryName: 'Commercial Kitchen Spill Cleanup',
      };

      const request = new NextRequest(
        'https://app.letsgetquoted.com/api/webhooks/marketplace/thumbtack?accountId=acc_tt_1',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(ttPayload),
        }
      );

      const response = await marketplacePost(request, {
        params: Promise.resolve({ provider: 'thumbtack' }),
      });

      expect(response.status).toBe(201);
      const json = await response.json();
      expect(json.ok).toBe(true);
      expect(json.disposition).toBe('routed');
      expect(json.leadId).toBe('lead_tt_444');
    });
  });
});
