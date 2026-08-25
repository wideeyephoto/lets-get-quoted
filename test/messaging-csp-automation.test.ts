import { describe, expect, it, vi } from 'vitest';
import { automateDownstreamBrandAndCampaign } from '@/lib/messaging-csp-automation';
import { SignalWireNumberProvisioningClient } from '@/lib/signalwire-number-provisioning';

const BRAND_ID = '77777777-7777-4777-8777-777777777777';
const CAMPAIGN_ID = '33333333-3333-4333-8333-333333333333';

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('automated CSP downstream Brand & Campaign registration', () => {
  const sampleApplication = {
    id: '11111111-1111-4111-8111-111111111111',
    legalBusinessName: 'Apex Roofing LLC',
    dbaName: 'Apex Roofs & Gutters',
    businessType: 'llc' as const,
    websiteUrl: 'https://apexroofing.example.com',
    businessEmail: 'info@apexroofing.example.com',
    businessPhone: '+12485550100',
    addressLine1: '123 Main St',
    city: 'Royal Oak',
    region: 'MI',
    postalCode: '48067',
    messagingSupportEmail: 'support@apexroofing.example.com',
    messagingSupportPhone: '+12485550100',
    providerBrandId: null,
    providerCampaignId: null,
  };

  it('automates downstream Brand and Campaign creation when IDs are not yet present', async () => {
    const fetchMock = vi.fn<typeof fetch>(async (raw, init) => {
      const url = String(raw);
      if (url.endsWith('/registry/beta/brands') && init?.method === 'POST') {
        return json({
          id: BRAND_ID,
          state: 'completed',
          name: 'Apex Roofs & Gutters',
          company_name: 'Apex Roofing LLC',
          ein: '123456789',
          company_website: 'https://apexroofing.example.com',
        });
      }
      if (url.endsWith('/registry/beta/campaigns') && init?.method === 'POST') {
        return json({
          id: CAMPAIGN_ID,
          state: 'active',
          name: 'Apex Roofs & Gutters Customer Operations',
          sms_use_case: 'CUSTOMER_CARE',
        });
      }
      if (url.includes(`/registry/beta/brands/${BRAND_ID}/campaigns`)) {
        return json({
          links: {},
          data: [{
            id: CAMPAIGN_ID,
            state: 'active',
            name: 'Apex Roofs & Gutters Customer Operations',
            sms_use_case: 'CUSTOMER_CARE',
          }],
        });
      }
      return json({ error: 'not found' }, 404);
    });

    const client = new SignalWireNumberProvisioningClient({
      spaceUrl: 'https://lgq-test.signalwire.com',
      projectId: '00000000-0000-4000-8000-000000000000',
      apiToken: 'test-token',
    }, fetchMock);

    const result = await automateDownstreamBrandAndCampaign({
      client,
      application: sampleApplication,
      verifiedEin: '12-3456789',
    });

    expect(result.success).toBe(true);
    expect(result.brand.id).toBe(BRAND_ID);
    expect(result.campaign.id).toBe(CAMPAIGN_ID);
    expect(result.brandBelongsToCampaign).toBe(true);
    expect(result.applicableFees).toHaveLength(4);

    // Verify brand registration call payload
    const brandCall = fetchMock.mock.calls.find(([u, i]) => String(u).endsWith('/registry/beta/brands') && i?.method === 'POST');
    expect(brandCall).toBeDefined();
    const brandBody = JSON.parse(String(brandCall![1]?.body));
    expect(brandBody.name).toBe('Apex Roofs & Gutters');
    expect(brandBody.company_name).toBe('Apex Roofing LLC');
    expect(brandBody.ein).toBe('123456789');

    // Verify campaign registration call payload
    const campaignCall = fetchMock.mock.calls.find(([u, i]) => String(u).endsWith('/registry/beta/campaigns') && i?.method === 'POST');
    expect(campaignCall).toBeDefined();
    const campaignBody = JSON.parse(String(campaignCall![1]?.body));
    expect(campaignBody.brand_id).toBe(BRAND_ID);
    expect(campaignBody.usecase).toBe('CUSTOMER_CARE');
    expect(campaignBody.embedded_link).toBe(true);
    expect(campaignBody.sample1).toContain('Apex Roofs & Gutters:');
  });

  it('reuses existing Brand ID and Campaign ID if already present on the application', async () => {
    const fetchMock = vi.fn<typeof fetch>(async (raw) => {
      const url = String(raw);
      if (url.endsWith(`/registry/beta/brands/${BRAND_ID}`)) {
        return json({
          id: BRAND_ID,
          state: 'completed',
          name: 'Apex Roofs & Gutters',
          company_name: 'Apex Roofing LLC',
          ein: '123456789',
          company_website: 'https://apexroofing.example.com',
        });
      }
      if (url.endsWith(`/registry/beta/campaigns/${CAMPAIGN_ID}`)) {
        return json({
          id: CAMPAIGN_ID,
          state: 'active',
          name: 'Apex Roofs & Gutters Customer Operations',
          sms_use_case: 'CUSTOMER_CARE',
        });
      }
      if (url.includes(`/registry/beta/brands/${BRAND_ID}/campaigns`)) {
        return json({
          links: {},
          data: [{
            id: CAMPAIGN_ID,
            state: 'active',
            name: 'Apex Roofs & Gutters Customer Operations',
            sms_use_case: 'CUSTOMER_CARE',
          }],
        });
      }
      return json({ error: 'not found' }, 404);
    });

    const client = new SignalWireNumberProvisioningClient({
      spaceUrl: 'https://lgq-test.signalwire.com',
      projectId: '00000000-0000-4000-8000-000000000000',
      apiToken: 'test-token',
    }, fetchMock);

    const result = await automateDownstreamBrandAndCampaign({
      client,
      application: {
        ...sampleApplication,
        providerBrandId: BRAND_ID,
        providerCampaignId: CAMPAIGN_ID,
      },
      verifiedEin: '12-3456789',
    });

    expect(result.success).toBe(true);
    expect(result.brand.id).toBe(BRAND_ID);
    expect(result.campaign.id).toBe(CAMPAIGN_ID);

    // Ensure POST create calls were NOT made
    const postCalls = fetchMock.mock.calls.filter(([, i]) => i?.method === 'POST');
    expect(postCalls).toHaveLength(0);
  });
});
