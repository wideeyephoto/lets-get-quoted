import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  SignalWireNumberProvisioningClient,
  SignalWireProvisioningError,
} from '@/lib/signalwire-number-provisioning';

const PROJECT = '11111111-1111-4111-8111-111111111111';
const PHONE_ID = '22222222-2222-4222-8222-222222222222';
const BRAND = '77777777-7777-4777-8777-777777777777';
const CAMPAIGN = '33333333-3333-4333-8333-333333333333';
const ORDER = '44444444-4444-4444-8444-444444444444';
const ASSIGNMENT = '55555555-5555-4555-8555-555555555555';

function client(fetchImpl: typeof fetch) {
  return new SignalWireNumberProvisioningClient({
    spaceUrl: 'https://lgq-test.signalwire.com',
    projectId: PROJECT,
    apiToken: 'server-only-test-token',
  }, fetchImpl);
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
}

afterEach(() => vi.restoreAllMocks());

describe('SignalWire dedicated-number REST adapter', () => {
  it('searches local inventory with Numbers scope credentials and keeps the token out of URL/body', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => json({ data: [{
      number: '+12485550140', region: 'MI', city: 'Royal Oak',
      capabilities: { voice: true, sms: true, mms: true, fax: false },
    }] }));
    const results = await client(fetchMock).searchAvailableNumbers({ areaCode: '248', region: 'MI', maxResults: 10 });
    expect(results).toHaveLength(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe('https://lgq-test.signalwire.com/api/relay/rest/phone_numbers/search?areacode=248&number_type=local&max_results=10&region=MI');
    expect(init?.method).toBe('GET');
    expect(String(url)).not.toContain('server-only-test-token');
    expect(JSON.stringify(init)).not.toContain('server-only-test-token');
    expect(new Headers(init?.headers).get('Authorization')).toBe(`Basic ${Buffer.from(`${PROJECT}:server-only-test-token`).toString('base64')}`);
  });

  it('parses the live search shape while keeping messaging inventory SMS-capable', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => json({ data: [
      {
        e164: '+12485550140',
        national_number_formatted: '(248) 555-0140',
        rate_center: 'ROYAL OAK',
        region: 'MI',
        country_code: 'US',
        capabilities: ['voice', 'SMS', 'mms'],
      },
      {
        e164: '+12485550141',
        national_number_formatted: '(248) 555-0141',
        rate_center: 'SOUTHFIELD',
        region: 'MI',
        country_code: 'US',
        capabilities: ['voice', 'fax'],
      },
    ] }));

    await expect(client(fetchMock).searchAvailableNumbers({ areaCode: '248', region: 'MI' }))
      .resolves.toEqual([{
        number: '+12485550140',
        region: 'MI',
        city: 'ROYAL OAK',
        capabilities: { voice: true, sms: true, mms: true, fax: false },
      }]);
  });

  it('does not offer a live voice-only search result to the messaging purchase flow', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => json({ data: [{
      e164: '+12485550140',
      national_number_formatted: '(248) 555-0140',
      rate_center: 'ROYAL OAK',
      region: 'MI',
      country_code: 'US',
      capabilities: ['voice', 'fax'],
    }] }));

    await expect(client(fetchMock).searchAvailableNumbers({ areaCode: '248', region: 'MI' }))
      .resolves.toEqual([]);
  });

  it('uses the documented purchase, update, assignment, order, and individual-status contracts', async () => {
    const fetchMock = vi.fn<typeof fetch>(async (raw, init) => {
      const url = String(raw);
      if (url.endsWith('/phone_numbers') && init?.method === 'POST') {
        return json({ id: PHONE_ID, number: '+12485550140', name: null, capabilities: ['voice', 'sms', 'mms'] });
      }
      if (url.endsWith(`/phone_numbers/${PHONE_ID}`)) {
        return json({ id: PHONE_ID, number: '+12485550140', name: 'LGQ Test', capabilities: ['sms'], message_handler: 'laml_webhooks', message_request_url: 'https://app.example.com/api/sms/inbound', message_request_method: 'POST' });
      }
      if (url.endsWith(`/campaigns/${CAMPAIGN}/orders`)) {
        return json({ id: ORDER, state: 'pending', status_callback_url: null });
      }
      if (url.endsWith(`/orders/${ORDER}`)) return json({ id: ORDER, state: 'processed', status_callback_url: null });
      if (url === `https://lgq-test.signalwire.com/api/relay/rest/registry/beta/campaigns/${CAMPAIGN}/numbers?page_size=1000`) {
        return json({ links: {}, data: [{ id: ASSIGNMENT, state: 'complete', campaign_id: CAMPAIGN, phone_number: { id: PHONE_ID, number: '+12485550140' } }] });
      }
      return json({ error: 'unexpected request' }, 500);
    });
    const api = client(fetchMock);
    await api.purchaseNumber('+12485550140');
    await api.updatePhoneNumber({
      providerNumberId: PHONE_ID,
      number: '+12485550140',
      friendlyName: 'LGQ Test',
      inboundWebhookUrl: 'https://app.example.com/api/sms/inbound',
    });
    await api.assignNumberToCampaign({ campaignId: CAMPAIGN, number: '+12485550140' });
    expect((await api.getAssignmentOrder(ORDER)).state).toBe('processed');
    expect((await api.getNumberAssignment({ campaignId: CAMPAIGN, number: '+12485550140' }))?.state).toBe('complete');

    expect(fetchMock.mock.calls.map(([url, init]) => [String(url), init?.method])).toEqual([
      ['https://lgq-test.signalwire.com/api/relay/rest/phone_numbers', 'POST'],
      [`https://lgq-test.signalwire.com/api/relay/rest/phone_numbers/${PHONE_ID}`, 'PUT'],
      [`https://lgq-test.signalwire.com/api/relay/rest/registry/beta/campaigns/${CAMPAIGN}/orders`, 'POST'],
      [`https://lgq-test.signalwire.com/api/relay/rest/registry/beta/orders/${ORDER}`, 'GET'],
      [`https://lgq-test.signalwire.com/api/relay/rest/registry/beta/campaigns/${CAMPAIGN}/numbers?page_size=1000`, 'GET'],
    ]);
    expect(JSON.parse(String(fetchMock.mock.calls[0]![1]?.body))).toEqual({ number: '+12485550140' });
    expect(JSON.parse(String(fetchMock.mock.calls[1]![1]?.body))).toMatchObject({
      message_handler: 'laml_webhooks', message_request_method: 'POST',
      message_request_url: 'https://app.example.com/api/sms/inbound',
    });
    expect(JSON.parse(String(fetchMock.mock.calls[2]![1]?.body))).toEqual({ phone_numbers: ['+12485550140'] });
  });

  it('rejects an order lookup whose response has a different identity', async () => {
    const otherOrder = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const fetchMock = vi.fn<typeof fetch>(async () => json({
      id: otherOrder,
      state: 'processed',
      status_callback_url: null,
    }));
    await expect(client(fetchMock).getAssignmentOrder(ORDER))
      .rejects.toThrow(/different assignment order than requested/i);
  });

  it('follows the provider pagination link until it finds the requested number', async () => {
    const path = `/api/relay/rest/registry/beta/campaigns/${CAMPAIGN}/numbers`;
    const fetchMock = vi.fn<typeof fetch>(async (raw) => {
      const url = String(raw);
      if (url.endsWith(`${path}?page_size=1000`)) {
        return json({
          links: { next: `${path}?page_size=1000&page_number=2` },
          data: [{
            id: '66666666-6666-4666-8666-666666666666',
            state: 'complete',
            campaign_id: CAMPAIGN,
            phone_number: { id: '77777777-7777-4777-8777-777777777777', number: '+12485550141' },
          }],
        });
      }
      return json({
        links: {},
        data: [{
          id: ASSIGNMENT,
          state: 'pending',
          campaign_id: CAMPAIGN,
          phone_number: { id: PHONE_ID, number: '+12485550140' },
        }],
      });
    });

    await expect(client(fetchMock).getNumberAssignment({ campaignId: CAMPAIGN, number: '+12485550140' }))
      .resolves.toMatchObject({ id: ASSIGNMENT, state: 'pending', number: '+12485550140' });
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      `https://lgq-test.signalwire.com${path}?page_size=1000`,
      `https://lgq-test.signalwire.com${path}?page_size=1000&page_number=2`,
    ]);
  });

  it('never sends Basic credentials to a pagination link outside the campaign resource', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => json({
      links: { next: 'https://attacker.example/collect' },
      data: [],
    }));
    await expect(client(fetchMock).getNumberAssignment({ campaignId: CAMPAIGN, number: '+12485550140' }))
      .rejects.toThrow(/left the requested campaign resource/i);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects duplicate exact number assignments split across provider pages', async () => {
    const path = `/api/relay/rest/registry/beta/campaigns/${CAMPAIGN}/numbers`;
    const assignment = {
      id: ASSIGNMENT,
      state: 'complete',
      campaign_id: CAMPAIGN,
      phone_number: { id: PHONE_ID, number: '+12485550140' },
    };
    const fetchMock = vi.fn<typeof fetch>(async (raw) => String(raw).includes('page_number=2')
      ? json({ links: {}, data: [{ ...assignment, id: '99999999-9999-4999-8999-999999999999' }] })
      : json({ links: { next: `${path}?page_size=1000&page_number=2` }, data: [assignment] }));
    await expect(client(fetchMock).getNumberAssignment({ campaignId: CAMPAIGN, number: '+12485550140' }))
      .rejects.toThrow(/duplicate assignments/i);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('proves ambiguous-purchase absence with exact E.164 matching across owned-number pagination', async () => {
    const path = '/api/relay/rest/phone_numbers';
    const fetchMock = vi.fn<typeof fetch>(async (raw) => {
      const url = String(raw);
      if (url.endsWith(`${path}?filter_number=%2B12485550140&page_size=1000`)) {
        return json({
          links: { next: `${path}?filter_number=%2B12485550140&page_size=1000&page_number=2` },
          data: [{ id: '88888888-8888-4888-8888-888888888888', number: '+124855501400', capabilities: ['sms'] }],
        });
      }
      return json({
        links: {},
        data: [{ id: PHONE_ID, number: '+12485550140', capabilities: ['voice'] }],
      });
    });
    await expect(client(fetchMock).findOwnedPhoneNumber('+12485550140')).resolves.toMatchObject({
      id: PHONE_ID,
      number: '+12485550140',
      capabilities: ['voice'],
    });
    expect(fetchMock.mock.calls.map(([raw, init]) => [String(raw), init?.method])).toEqual([
      [`https://lgq-test.signalwire.com${path}?filter_number=%2B12485550140&page_size=1000`, 'GET'],
      [`https://lgq-test.signalwire.com${path}?filter_number=%2B12485550140&page_size=1000&page_number=2`, 'GET'],
    ]);
  });

  it('never follows an owned-number pagination link off the exact phone resource', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => json({
      links: { next: 'https://attacker.example/collect?number=%2B12485550140' },
      data: [],
    }));
    await expect(client(fetchMock).findOwnedPhoneNumber('+12485550140'))
      .rejects.toThrow(/left the requested phone resource/i);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects callback URL credentials, query strings, and fragments before HTTP', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const api = client(fetchMock);
    for (const callback of [
      'https://user:password@app.example.com/api/sms/inbound',
      'https://app.example.com/api/sms/inbound?token=secret',
      'https://app.example.com/api/sms/inbound#secret',
    ]) {
      await expect(api.updatePhoneNumber({
        providerNumberId: PHONE_ID,
        number: '+12485550140',
        friendlyName: 'LGQ Test',
        inboundWebhookUrl: callback,
      })).rejects.toThrow(/without credentials, a query string, or a fragment/i);
      await expect(api.assignNumberToCampaign({
        campaignId: CAMPAIGN,
        number: '+12485550140',
        statusCallbackUrl: callback,
      })).rejects.toThrow(/without credentials, a query string, or a fragment/i);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('treats a 200 that did not apply the exact inbound webhook as malformed', async () => {
    for (const response of [
      {
        id: PHONE_ID,
        number: '+12485550140',
        message_handler: 'laml_webhooks',
        message_request_url: 'https://wrong.example.com/api/sms/inbound',
        message_request_method: 'POST',
      },
      {
        id: PHONE_ID,
        number: '+12485550140',
        message_handler: 'relay_context',
        message_request_url: 'https://app.example.com/api/sms/inbound',
        message_request_method: 'POST',
      },
      {
        id: PHONE_ID,
        number: '+12485550140',
        message_handler: 'laml_webhooks',
        message_request_url: 'https://app.example.com/api/sms/inbound',
        message_request_method: 'GET',
      },
    ]) {
      const error = await client(vi.fn<typeof fetch>(async () => json(response))).updatePhoneNumber({
        providerNumberId: PHONE_ID,
        number: '+12485550140',
        friendlyName: 'LGQ Test',
        inboundWebhookUrl: 'https://app.example.com/api/sms/inbound',
      }).catch((value) => value);
      expect(error).toMatchObject({ code: 'malformed_response', outcomeKnownAbsent: false });
      expect(String((error as Error).message)).toMatch(/did not confirm the requested inbound webhook/i);
    }
  });

  it('surfaces CSP/API permission failures with the required scopes', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => json({ message: 'forbidden: server-only-test-token' }, 403));
    const error = await client(fetchMock).assignNumberToCampaign({ campaignId: CAMPAIGN, number: '+12485550140' }).catch((value) => value);
    expect(error).toBeInstanceOf(SignalWireProvisioningError);
    expect(error).toMatchObject({ status: 403, code: 'missing_scope', requiredScopes: ['Messaging', 'Numbers'], outcomeKnownAbsent: true });
    expect((error as SignalWireProvisioningError).operatorMessage).toContain('Messaging + Numbers');
    expect((error as SignalWireProvisioningError).operatorMessage).toContain('forbidden');
    expect((error as SignalWireProvisioningError).operatorMessage).toContain('[redacted]');
    expect((error as SignalWireProvisioningError).operatorMessage).not.toContain('server-only-test-token');
    expect((error as SignalWireProvisioningError).operatorMessage).toContain('CSP access');
  });

  it('retrieves a carrier-complete brand/campaign and proves campaign membership through the brand-scoped list', async () => {
    const fetchMock = vi.fn<typeof fetch>(async (raw) => {
      const url = String(raw);
      if (url.endsWith(`/brands/${BRAND}`)) return json({
        id: BRAND,
        state: 'complete',
        name: 'Acme Roofing',
        company_name: 'Acme Roofing LLC',
        ein: '12-3456789',
        company_website: 'https://www.acme.example.com',
      });
      if (url.endsWith(`/campaigns/${CAMPAIGN}`)) return json({
        id: CAMPAIGN,
        state: 'complete',
        name: 'Acme homeowner messaging',
        sms_use_case: 'LOW_VOLUME_MIXED',
      });
      if (url.endsWith(`/brands/${BRAND}/campaigns?page_size=1000`)) return json({
        links: {},
        data: [{ id: CAMPAIGN, state: 'complete', name: 'Acme homeowner messaging', sms_use_case: 'LOW_VOLUME_MIXED' }],
      });
      return json({ message: 'unexpected' }, 500);
    });
    const api = client(fetchMock);
    await expect(api.getBrand(BRAND)).resolves.toMatchObject({ id: BRAND, companyName: 'Acme Roofing LLC', state: 'complete' });
    await expect(api.getCampaign(CAMPAIGN)).resolves.toMatchObject({ id: CAMPAIGN, smsUseCase: 'LOW_VOLUME_MIXED', state: 'complete' });
    await expect(api.campaignBelongsToBrand({ brandId: BRAND, campaignId: CAMPAIGN })).resolves.toBe(true);
  });

  it('does not call a provider 5xx or conflict safe-to-retry after a mutation request', async () => {
    for (const status of [409, 500, 503]) {
      const error = await client(vi.fn<typeof fetch>(async () => json({ message: 'uncertain' }, status)))
        .purchaseNumber('+12485550140').catch((value) => value);
      expect(error).toMatchObject({ status, outcomeKnownAbsent: false });
    }
  });

  it('classifies network and malformed-success outcomes as unknown, never retry-safe', async () => {
    const network = client(vi.fn<typeof fetch>(async () => { throw new Error('socket reset'); }));
    const networkError = await network.purchaseNumber('+12485550140').catch((value) => value);
    expect(networkError).toMatchObject({ code: 'network_error', responseReceived: false, outcomeKnownAbsent: false });

    const malformed = client(vi.fn<typeof fetch>(async () => new Response('not json', { status: 200 })));
    const malformedError = await malformed.purchaseNumber('+12485550140').catch((value) => value);
    expect(malformedError).toMatchObject({ code: 'malformed_response', responseReceived: true, outcomeKnownAbsent: false });
  });

  it('refuses credentials sent to the provider apex or a non-SignalWire origin', () => {
    for (const spaceUrl of [
      'https://signalwire.com',
      'https://.signalwire.com',
      'https://bad-.signalwire.com',
      'https://lgq-test.signalwire.com:8443',
      'https://attacker.example',
    ]) {
      expect(() => new SignalWireNumberProvisioningClient({
        spaceUrl, projectId: PROJECT, apiToken: 'secret',
      }, vi.fn<typeof fetch>())).toThrow(/provider-hosted Space subdomain/i);
    }
  });
});
