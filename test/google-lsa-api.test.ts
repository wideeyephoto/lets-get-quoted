import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GOOGLE_ADS_SCOPE,
  GoogleOAuthError,
  buildGoogleAuthorizeUrl,
  googleLsaConfigured,
  googleLsaRedirectUri,
  googleOAuthRequiresReconnect,
  refreshGoogleTokens,
} from '../src/lib/google-lsa/oauth';
import {
  DEFAULT_GOOGLE_LSA_RETURN_TO,
  buildGoogleLsaState,
  safeGoogleLsaReturnTo,
  verifyGoogleLsaState,
} from '../src/lib/google-lsa/state';
import {
  GOOGLE_LSA_LEADS_QUERY,
  GoogleLsaApiError,
  buildGoogleLsaFeedbackBody,
  discoverGoogleLsaCustomers,
  fetchLegacyLsaAccountReport,
  listGoogleLsaLeads,
  parseGoogleLsaApiResponse,
  parseGoogleLsaLeadRow,
  provideGoogleLsaFeedback,
} from '../src/lib/google-lsa/api';

const saved = { ...process.env };
beforeEach(() => { process.env = { ...saved }; });
afterEach(() => {
  process.env = { ...saved };
  vi.restoreAllMocks();
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function injectedFetch(implementation: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>): typeof fetch {
  return vi.fn(implementation) as unknown as typeof fetch;
}

describe('Google LSA OAuth configuration', () => {
  it('requires OAuth credentials and the Google Ads developer token', () => {
    delete process.env.GOOGLE_ADS_CLIENT_ID;
    delete process.env.GOOGLE_ADS_CLIENT_SECRET;
    delete process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
    expect(googleLsaConfigured()).toBe(false);
    process.env.GOOGLE_ADS_CLIENT_ID = 'client-id';
    process.env.GOOGLE_ADS_CLIENT_SECRET = 'client-secret';
    expect(googleLsaConfigured()).toBe(false);
    process.env.GOOGLE_ADS_DEVELOPER_TOKEN = 'developer-token';
    expect(googleLsaConfigured()).toBe(true);
  });

  it('derives a fixed redirect URI and permits an explicit local override', () => {
    delete process.env.GOOGLE_LSA_REDIRECT_URI;
    process.env.NEXT_PUBLIC_APP_URL = 'https://letsgetquoted.com/';
    expect(googleLsaRedirectUri()).toBe('https://letsgetquoted.com/api/google-lsa/callback');
    process.env.GOOGLE_LSA_REDIRECT_URI = 'http://localhost:3010/api/google-lsa/callback';
    expect(googleLsaRedirectUri()).toBe('http://localhost:3010/api/google-lsa/callback');
  });

  it('requests offline adwords access without leaking the client secret', () => {
    process.env.GOOGLE_ADS_CLIENT_ID = 'google-client';
    process.env.GOOGLE_ADS_CLIENT_SECRET = 'do-not-leak';
    const url = new URL(buildGoogleAuthorizeUrl('signed-state'));
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(url.searchParams.get('scope')).toBe(GOOGLE_ADS_SCOPE);
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('prompt')).toBe('consent');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('state')).toBe('signed-state');
    expect(url.toString()).not.toContain('do-not-leak');
  });

  it('keeps the previous refresh token when Google omits one on refresh', async () => {
    process.env.GOOGLE_ADS_CLIENT_ID = 'google-client';
    process.env.GOOGLE_ADS_CLIENT_SECRET = 'secret';
    const fetchImpl = injectedFetch(async (_input, init) => {
      expect(init?.method).toBe('POST');
      const body = new URLSearchParams(String(init?.body));
      expect(body.get('grant_type')).toBe('refresh_token');
      expect(body.get('refresh_token')).toBe('existing-refresh');
      return jsonResponse({ access_token: 'new-access', expires_in: 3600, token_type: 'Bearer' });
    });

    await expect(refreshGoogleTokens('existing-refresh', fetchImpl)).resolves.toMatchObject({
      accessToken: 'new-access',
      refreshToken: 'existing-refresh',
    });
  });

  it('distinguishes a revoked grant from a transient token failure', async () => {
    const invalidGrant = new GoogleOAuthError('revoked', 400, 'invalid_grant');
    expect(googleOAuthRequiresReconnect(invalidGrant)).toBe(true);
    expect(googleOAuthRequiresReconnect(new GoogleOAuthError('busy', 503, null))).toBe(false);
    expect(googleOAuthRequiresReconnect(new Error('database write failed'))).toBe(false);
  });
});

describe('Google LSA OAuth state', () => {
  beforeEach(() => { process.env.SUPABASE_SERVICE_ROLE_KEY = 'state-signing-key'; });

  it('binds the nonce to both account and user and returns only a safe local path', () => {
    const state = buildGoogleLsaState('account-A', 'user-A', 'nonce-A', '/dashboard/marketing?tab=lsa');
    expect(verifyGoogleLsaState(state, 'account-A', 'user-A', 'nonce-A')).toMatchObject({
      accountId: 'account-A',
      userId: 'user-A',
      nonce: 'nonce-A',
      returnTo: '/dashboard/marketing?tab=lsa',
    });
    expect(verifyGoogleLsaState(state, 'account-B', 'user-A', 'nonce-A')).toBeNull();
    expect(verifyGoogleLsaState(state, 'account-A', 'user-B', 'nonce-A')).toBeNull();
    expect(verifyGoogleLsaState(state, 'account-A', 'user-A', 'nonce-B')).toBeNull();
  });

  it('rejects open redirects before they enter the signed payload', () => {
    expect(safeGoogleLsaReturnTo('https://evil.example/steal')).toBe(DEFAULT_GOOGLE_LSA_RETURN_TO);
    expect(safeGoogleLsaReturnTo('//evil.example/steal')).toBe(DEFAULT_GOOGLE_LSA_RETURN_TO);
    expect(safeGoogleLsaReturnTo('/\\evil.example/steal')).toBe(DEFAULT_GOOGLE_LSA_RETURN_TO);
    const state = buildGoogleLsaState('account-A', 'user-A', 'nonce-A', '//evil.example');
    expect(verifyGoogleLsaState(state, 'account-A', 'user-A', 'nonce-A')?.returnTo)
      .toBe(DEFAULT_GOOGLE_LSA_RETURN_TO);
  });

  it('rejects malformed and forged signatures', () => {
    const state = buildGoogleLsaState('account-A', 'user-A', 'nonce-A');
    expect(verifyGoogleLsaState(`${state}x`, 'account-A', 'user-A', 'nonce-A')).toBeNull();
    expect(verifyGoogleLsaState('malformed', 'account-A', 'user-A', 'nonce-A')).toBeNull();
  });
});

describe('Google Ads parsing and pagination', () => {
  const lead = {
    resourceName: 'customers/123/localServicesLeads/9001',
    id: '9001',
    categoryId: 'gc:roofing',
    serviceId: 'repair',
    contactDetails: { consumerName: 'Ada', phoneNumber: '+15555550123', phoneNumberExtension: '4' },
    leadType: 'BOOKING',
    leadStatus: 'BOOKED',
    creationDateTime: '2026-08-31 10:20:30',
    locale: 'en-US',
    leadCharged: true,
    creditDetails: { creditState: 'PENDING', creditStateLastUpdateDateTime: '2026-08-31 11:00:00' },
    leadFeedbackSubmitted: false,
    note: { description: 'Owner note', editDateTime: '2026-08-31 12:00:00' },
  };

  it('normalizes exactly the supported lead fields without invented appointment or price data', () => {
    const parsed = parseGoogleLsaLeadRow({ localServicesLead: lead });
    expect(parsed).toMatchObject({
      id: '9001',
      leadType: 'BOOKING',
      leadStatus: 'BOOKED',
      leadCharged: true,
      creditState: 'PENDING',
      leadFeedbackSubmitted: false,
      contactDetails: { phoneNumberExtension: '4' },
    });
    expect(parsed).not.toHaveProperty('bookingAppointmentTimestamp');
    expect(parsed).not.toHaveProperty('cost');
    expect(GOOGLE_LSA_LEADS_QUERY).not.toContain('booking_appointment');
  });

  it('follows nextPageToken and never sends unsupported pageSize in Search v25', async () => {
    const bodies: Array<Record<string, unknown>> = [];
    const fetchImpl = injectedFetch(async (_input, init) => {
      bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return bodies.length === 1
        ? jsonResponse({ results: [{ localServicesLead: lead }], nextPageToken: 'page-2' })
        : jsonResponse({ results: [{ localServicesLead: { ...lead, id: '9002', resourceName: 'customers/123/localServicesLeads/9002' } }] });
    });
    const rows = await listGoogleLsaLeads({
      accessToken: 'access',
      developerToken: 'developer',
      customerId: '123',
      loginCustomerId: '456-789-0000',
      startDate: '2026-08-18',
      endDate: '2026-09-01',
    }, fetchImpl);
    expect(rows.map((row) => row.id)).toEqual(['9001', '9002']);
    expect(bodies).toHaveLength(2);
    expect(bodies[0]).not.toHaveProperty('pageSize');
    expect(String(bodies[0].query)).toContain("creation_date_time >= '2026-08-18 00:00:00'");
    expect(String(bodies[0].query)).toContain("creation_date_time <= '2026-09-01 23:59:59'");
    expect(bodies[1]).toMatchObject({ pageToken: 'page-2' });
    const headers = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0][1]?.headers as Record<string, string>;
    expect(headers['login-customer-id']).toBe('4567890000');
  });

  it('retries a transient read without changing the GAQL request', async () => {
    const bodies: string[] = [];
    const fetchImpl = injectedFetch(async (_input, init) => {
      bodies.push(String(init?.body));
      if (bodies.length === 1) {
        return new Response(JSON.stringify({ error: { message: 'busy' } }), {
          status: 503,
          headers: { 'Content-Type': 'application/json', 'Retry-After': '0' },
        });
      }
      return jsonResponse({ results: [{ localServicesLead: lead }] });
    });
    await expect(listGoogleLsaLeads({
      accessToken: 'access', developerToken: 'developer', customerId: '123',
    }, fetchImpl)).resolves.toHaveLength(1);
    expect(bodies).toHaveLength(2);
    expect(bodies[0]).toBe(bodies[1]);
  });

  it('preserves Google error status and request ID', async () => {
    const response = jsonResponse({
      error: {
        message: 'Request contains an invalid argument.',
        status: 'INVALID_ARGUMENT',
        details: [{ requestId: 'request-123', errors: [{ message: 'Bad GAQL field.' }] }],
      },
    }, 400);
    const error = await parseGoogleLsaApiResponse(response).catch((caught) => caught);
    expect(error).toBeInstanceOf(GoogleLsaApiError);
    expect(error).toMatchObject({
      message: 'Bad GAQL field.',
      status: 400,
      googleStatus: 'INVALID_ARGUMENT',
      requestId: 'request-123',
    });
  });

  it('discovers migrated LSA campaigns below an accessible manager with the correct login customer', async () => {
    const fetchImpl = injectedFetch(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/v25/customers:listAccessibleCustomers')) {
        return jsonResponse({ resourceNames: ['customers/111'] });
      }
      const query = JSON.parse(String(init?.body)).query as string;
      if (query.includes('FROM customer\n')) {
        return jsonResponse({ results: [{ customer: {
          id: '111', descriptiveName: 'Manager', currencyCode: 'USD', timeZone: 'America/New_York', manager: true,
        } }] });
      }
      if (query.includes('FROM customer_client')) {
        return jsonResponse({ results: [{ customerClient: {
          id: '222', clientCustomer: 'customers/222', descriptiveName: 'Roof Co', currencyCode: 'USD',
          timeZone: 'America/New_York', manager: false, hidden: false, level: '1', status: 'ENABLED',
        } }] });
      }
      expect(url).toContain('/customers/222/googleAds:search');
      expect((init?.headers as Record<string, string>)['login-customer-id']).toBe('111');
      return jsonResponse({ results: [
        { campaign: {
          id: '700', name: 'Ordinary PMax', status: 'ENABLED', advertisingChannelType: 'PERFORMANCE_MAX',
          pmaxCampaignSettings: { localServicesEnabled: false },
        } },
        { campaign: {
          resourceName: 'customers/222/campaigns/701', id: '701', name: 'Local Services', status: 'ENABLED',
          advertisingChannelType: 'PERFORMANCE_MAX', pmaxCampaignSettings: { localServicesEnabled: true },
        } },
      ] });
    });

    await expect(discoverGoogleLsaCustomers({
      accessToken: 'access',
      developerToken: 'developer',
    }, fetchImpl)).resolves.toEqual([expect.objectContaining({
      customerId: '222',
      customerName: 'Roof Co',
      loginCustomerId: '111',
      campaignMode: 'pmax',
      campaignId: '701',
      campaign: expect.objectContaining({ localServicesEnabled: true }),
    })]);
  });

  it('retains an MCC path for legacy spend even when the client is also directly accessible', async () => {
    const fetchImpl = injectedFetch(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/v25/customers:listAccessibleCustomers')) {
        // Direct client comes first to pin the path-merging edge case.
        return jsonResponse({ resourceNames: ['customers/222', 'customers/111'] });
      }
      const query = JSON.parse(String(init?.body)).query as string;
      if (query.includes('FROM customer\n')) {
        const manager = url.includes('/customers/111/');
        return jsonResponse({ results: [{ customer: {
          id: manager ? '111' : '222', descriptiveName: manager ? 'Manager' : 'Roof Co',
          currencyCode: 'USD', timeZone: 'America/New_York', manager,
        } }] });
      }
      if (query.includes('FROM customer_client')) {
        return jsonResponse({ results: [{ customerClient: {
          id: '222', descriptiveName: 'Roof Co', currencyCode: 'USD', timeZone: 'America/New_York',
          manager: false, hidden: false, level: '1', status: 'ENABLED',
        } }] });
      }
      return jsonResponse({ results: [{ campaign: {
        id: '600', name: 'Legacy LSA', status: 'ENABLED', advertisingChannelType: 'LOCAL_SERVICES',
      } }] });
    });

    await expect(discoverGoogleLsaCustomers({
      accessToken: 'access', developerToken: 'developer',
    }, fetchImpl)).resolves.toEqual([expect.objectContaining({
      customerId: '222',
      loginCustomerId: '111',
      campaignMode: 'legacy',
    })]);
  });
});

describe('legacy Local Services reporting', () => {
  it('uses exact manager/customer query and calendar-date component parameters', async () => {
    const urls: URL[] = [];
    const fetchImpl = injectedFetch(async (input, init) => {
      urls.push(new URL(String(input)));
      expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer access');
      return urls.length === 1
        ? jsonResponse({ accountReports: [{ accountId: '222', currentPeriodTotalCost: 123.45 }], nextPageToken: 'next' })
        : jsonResponse({ accountReports: [{ accountId: '333', currentPeriodTotalCost: 67.89 }] });
    });
    const reports = await fetchLegacyLsaAccountReport({
      accessToken: 'access',
      managerCustomerId: '111-111-1111',
      customerId: '222-222-2222',
      startDate: '2026-06-04',
      endDate: '2026-09-01',
    }, fetchImpl);
    expect(reports.map((row) => row.accountId)).toEqual(['222', '333']);
    expect(urls[0].searchParams.get('query')).toBe('manager_customer_id:1111111111;customer_id:2222222222');
    expect(urls[0].searchParams.get('startDate.year')).toBe('2026');
    expect(urls[0].searchParams.get('startDate.month')).toBe('6');
    expect(urls[0].searchParams.get('startDate.day')).toBe('4');
    expect(urls[0].searchParams.get('endDate.day')).toBe('1');
    expect(urls[0].searchParams.get('pageSize')).toBe('10000');
    expect(urls[1].searchParams.get('pageToken')).toBe('next');
  });
});

describe('Local Services feedback validation', () => {
  it('builds the correct satisfied and dissatisfied oneof objects', () => {
    expect(buildGoogleLsaFeedbackBody({
      surveyAnswer: 'SATISFIED',
      reason: 'BOOKED_CUSTOMER',
    })).toEqual({
      surveyAnswer: 'SATISFIED',
      surveySatisfied: { surveySatisfiedReason: 'BOOKED_CUSTOMER' },
    });
    expect(buildGoogleLsaFeedbackBody({
      surveyAnswer: 'VERY_DISSATISFIED',
      reason: 'SPAM',
    })).toEqual({
      surveyAnswer: 'VERY_DISSATISFIED',
      surveyDissatisfied: { surveyDissatisfiedReason: 'SPAM' },
    });
  });

  it('requires Other comments and rejects a reason from the wrong answer family', () => {
    expect(() => buildGoogleLsaFeedbackBody({
      surveyAnswer: 'DISSATISFIED',
      reason: 'OTHER_DISSATISFIED_REASON',
    })).toThrow(/comment is required/i);
    expect(() => buildGoogleLsaFeedbackBody({
      surveyAnswer: 'SATISFIED',
      reason: 'SPAM',
    })).toThrow(/not valid for satisfied/i);
    expect(() => buildGoogleLsaFeedbackBody({
      surveyAnswer: 'NEUTRAL',
      reason: 'SPAM',
    })).toThrow(/Neutral.*cannot include/i);
  });

  it('posts to the v25 lead resource action and returns the bonus-credit decision', async () => {
    const fetchImpl = injectedFetch(async (input, init) => {
      expect(String(input)).toBe(
        'https://googleads.googleapis.com/v25/customers/123/localServicesLeads/9001:provideLeadFeedback',
      );
      expect(JSON.parse(String(init?.body))).toEqual({
        surveyAnswer: 'VERY_SATISFIED',
        surveySatisfied: {
          surveySatisfiedReason: 'OTHER_SATISFIED_REASON',
          otherReasonComment: 'Strong fit',
        },
      });
      return jsonResponse({ creditIssuanceDecision: 'SUCCESS_NOT_REACHED_THRESHOLD' });
    });
    await expect(provideGoogleLsaFeedback({
      accessToken: 'access',
      developerToken: 'developer',
      customerId: '123',
      resourceName: 'customers/123/localServicesLeads/9001',
      feedback: {
        surveyAnswer: 'VERY_SATISFIED',
        reason: 'OTHER_SATISFIED_REASON',
        otherReasonComment: '  Strong fit  ',
      },
    }, fetchImpl)).resolves.toEqual({ creditIssuanceDecision: 'SUCCESS_NOT_REACHED_THRESHOLD' });
  });
});
