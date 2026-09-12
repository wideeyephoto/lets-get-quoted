import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * The handler bodies behind /api/v1 — the published API customers integrate
 * against. Nine route files, and until now not one line of any of them ran
 * under test.
 *
 * The wrapper around them is covered elsewhere (test/public-api/): it does the
 * bearer token, the scope check, the rate limit and idempotency. What it cannot
 * do is scope a query, and that is what lives inside each handler. So these
 * tests stand the wrapper down to a pass-through with a fixed context, and hold
 * the handlers to the two things they alone decide: every read and write is
 * narrowed to the token's own workspace, and the pagination contract the
 * documentation promises is the one the code implements.
 */

const mocks = vi.hoisted(() => ({
  getLead: vi.fn(),
  createLead: vi.fn(),
  validateWebhookUrl: vi.fn(),
  generateWebhookSecret: vi.fn(),
  encryptWebhookSecret: vi.fn(),
  rpc: vi.fn(),
}));

// Pass-through: the handler runs with a context the wrapper would have built.
vi.mock('@/lib/public-api/api-wrapper', () => ({
  publicApiRoute: (handler: Function) => (req: unknown, routeSegment?: unknown) =>
    handler(req, context, routeSegment),
}));
vi.mock('@/lib/public-api/ssrf-guard', () => ({ validateWebhookUrl: mocks.validateWebhookUrl }));
vi.mock('@/lib/public-api/webhook-vault-crypto', () => ({
  generateWebhookSecret: mocks.generateWebhookSecret,
  encryptWebhookSecret: mocks.encryptWebhookSecret,
}));
vi.mock('@/lib/leads', async () => {
  const actual = await vi.importActual<typeof import('@/lib/leads')>('@/lib/leads');
  return { ...actual, getLead: mocks.getLead, createLead: mocks.createLead };
});

const ACCOUNT_ID = 'workspace-a';
let queries: RecordedQuery[];
let results: Record<string, { data: unknown; error: unknown }>;

type RecordedQuery = {
  table: string;
  select?: string;
  filters: [string, unknown][];
  is: [string, unknown][];
  gte: [string, unknown][];
  or: string[];
  order: [string, unknown][];
  limit?: number;
  update?: Record<string, unknown>;
  insert?: Record<string, unknown>;
  deleted?: boolean;
};

/** A chainable, awaitable stand-in for the PostgREST builder. */
function builder(table: string): any {
  const record: RecordedQuery = { table, filters: [], is: [], gte: [], or: [], order: [] };
  queries.push(record);
  const result = () => results[table] ?? { data: [], error: null };
  const chain: any = {
    select: (columns: string) => {
      record.select = columns;
      return chain;
    },
    update: (patch: Record<string, unknown>) => {
      record.update = patch;
      return chain;
    },
    insert: (row: Record<string, unknown>) => {
      record.insert = row;
      return chain;
    },
    delete: () => {
      record.deleted = true;
      return chain;
    },
    eq: (column: string, value: unknown) => {
      record.filters.push([column, value]);
      return chain;
    },
    is: (column: string, value: unknown) => {
      record.is.push([column, value]);
      return chain;
    },
    gte: (column: string, value: unknown) => {
      record.gte.push([column, value]);
      return chain;
    },
    or: (expression: string) => {
      record.or.push(expression);
      return chain;
    },
    order: (column: string, options?: unknown) => {
      record.order.push([column, options]);
      return chain;
    },
    limit: (count: number) => {
      record.limit = count;
      return chain;
    },
    single: async () => result(),
    maybeSingle: async () => result(),
    then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve(result()).then(resolve, reject),
  };
  return chain;
}

const context = {
  admin: { from: (table: string) => builder(table), rpc: (...args: unknown[]) => mocks.rpc(...args) },
  accountId: ACCOUNT_ID,
  credentialId: 'cred-1',
  tokenName: 'Integration token',
  scopes: new Set(['leads.read', 'leads.write']),
  requestId: 'req_test',
  clientIp: '203.0.113.10',
};

import { GET as listLeads, POST as createLeadRoute } from '@/app/api/v1/leads/route';
import { GET as getLeadRoute, PATCH as patchLeadRoute } from '@/app/api/v1/leads/[id]/route';
import { GET as getMe } from '@/app/api/v1/me/route';
import { GET as listEvents } from '@/app/api/v1/events/route';
import {
  GET as listSubscriptions,
  POST as createSubscription,
} from '@/app/api/v1/webhook-subscriptions/route';
import {
  DELETE as deleteSubscription,
  GET as getSubscription,
} from '@/app/api/v1/webhook-subscriptions/[id]/route';
import { POST as retryDelivery } from '@/app/api/v1/webhook-deliveries/[id]/retry/route';
import { GET as listDeliveries } from '@/app/api/v1/webhook-subscriptions/[id]/deliveries/route';
import { GET as getOpenApi } from '@/app/api/v1/openapi.json/route';

const request = (url: string, init?: RequestInit) => new NextRequest(new Request(url, init));
const segment = (params: Record<string, string>) => ({ params: Promise.resolve(params) });

function lead(overrides: Record<string, unknown> = {}) {
  return {
    id: 'lead-1',
    account_id: ACCOUNT_ID,
    status: 'new',
    source: 'website',
    name: 'Sam Rivera',
    phone: '+15550000000',
    email: 'sam@example.com',
    address: '1 Test Street',
    project_type: 'roofing',
    message: 'Leaking roof',
    estimated_hours: 4,
    photo_paths: [],
    triage: null,
    created_at: '2026-09-01T10:00:00.000Z',
    updated_at: '2026-09-01T10:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  queries = [];
  results = {};
  mocks.validateWebhookUrl.mockResolvedValue({ safe: true });
  mocks.generateWebhookSecret.mockReturnValue('whsec_test_secret_value');
  mocks.encryptWebhookSecret.mockReturnValue('encrypted-blob');
});

describe('GET /api/v1/leads', () => {
  it('reads only this workspace, and only leads that are not deleted', async () => {
    results.leads = { data: [lead()], error: null };

    await listLeads(request('https://api.letsgetquoted.com/api/v1/leads'));

    const [query] = queries;
    expect(query.table).toBe('leads');
    expect(query.filters).toContainEqual(['account_id', ACCOUNT_ID]);
    expect(query.is).toContainEqual(['deleted_at', null]);
  });

  it('cannot be pointed at another workspace through the query string', async () => {
    results.leads = { data: [], error: null };

    await listLeads(request('https://api.letsgetquoted.com/api/v1/leads?account_id=workspace-b'));

    const accountFilters = queries[0].filters.filter(([column]) => column === 'account_id');
    expect(accountFilters).toEqual([['account_id', ACCOUNT_ID]]);
  });

  it.each([
    ['', 20],
    ['?limit=5', 5],
    ['?limit=100', 100],
    ['?limit=500', 100],
    ['?limit=0', 20],
    ['?limit=-3', 1],
    ['?limit=abc', 20],
  ])('asks for one more row than the page size for %j', async (search, expected) => {
    results.leads = { data: [], error: null };

    await listLeads(request(`https://api.letsgetquoted.com/api/v1/leads${search}`));

    // limit + 1 is how the handler knows whether there is another page.
    expect(queries[0].limit).toBe(expected + 1);
  });

  it('reports no more pages, and no cursor, when the page is not full', async () => {
    results.leads = { data: [lead({ id: 'lead-1' }), lead({ id: 'lead-2' })], error: null };

    const body = await (await listLeads(request('https://api.letsgetquoted.com/api/v1/leads?limit=5'))).json();

    expect(body.data).toHaveLength(2);
    expect(body.has_more).toBe(false);
    expect(body.next_cursor).toBeNull();
  });

  it('trims the extra row off the page and hands back a cursor for the next one', async () => {
    results.leads = {
      data: [
        lead({ id: 'lead-1', created_at: '2026-09-03T10:00:00.000Z' }),
        lead({ id: 'lead-2', created_at: '2026-09-02T10:00:00.000Z' }),
        lead({ id: 'lead-3', created_at: '2026-09-01T10:00:00.000Z' }),
      ],
      error: null,
    };

    const body = await (await listLeads(request('https://api.letsgetquoted.com/api/v1/leads?limit=2'))).json();

    expect(body.data.map((row: { id: string }) => row.id)).toEqual(['lead-1', 'lead-2']);
    expect(body.has_more).toBe(true);
    // The cursor names the last row the caller was given, so the next page
    // starts after it rather than repeating or skipping one.
    expect(JSON.parse(Buffer.from(body.next_cursor, 'base64').toString('utf8'))).toEqual({
      createdAt: '2026-09-02T10:00:00.000Z',
      id: 'lead-2',
    });
  });

  it('carries a cursor back into the query as a keyset comparison', async () => {
    results.leads = { data: [], error: null };
    const cursor = Buffer.from(JSON.stringify({ createdAt: '2026-09-02T10:00:00.000Z', id: 'lead-2' })).toString('base64');

    await listLeads(request(`https://api.letsgetquoted.com/api/v1/leads?cursor=${encodeURIComponent(cursor)}`));

    expect(queries[0].or[0]).toContain('created_at.lt.2026-09-02T10:00:00.000Z');
    expect(queries[0].or[0]).toContain('id.lt.lead-2');
  });

  it.each(['not-base64-at-all', Buffer.from('{"nope":true}').toString('base64'), Buffer.from('{').toString('base64')])(
    'ignores the unusable cursor %j rather than failing the request',
    async (cursor) => {
      results.leads = { data: [], error: null };

      const response = await listLeads(
        request(`https://api.letsgetquoted.com/api/v1/leads?cursor=${encodeURIComponent(cursor)}`),
      );

      expect(response.status).toBe(200);
      expect(queries[0].or).toEqual([]);
    },
  );

  it.each(['new', 'contacted', 'quoted', 'won', 'lost'])('filters on the known status %s', async (status) => {
    results.leads = { data: [], error: null };

    await listLeads(request(`https://api.letsgetquoted.com/api/v1/leads?status=${status}`));

    expect(queries[0].filters).toContainEqual(['status', status]);
  });

  it.each(['archived', 'deleted', 'NEW', 'anything'])('ignores the unknown status %j', async (status) => {
    results.leads = { data: [], error: null };

    await listLeads(request(`https://api.letsgetquoted.com/api/v1/leads?status=${status}`));

    expect(queries[0].filters.map(([column]) => column)).not.toContain('status');
  });

  it('matches email case-insensitively and phone as given', async () => {
    results.leads = { data: [], error: null };

    await listLeads(request('https://api.letsgetquoted.com/api/v1/leads?email=SAM@Example.COM&phone=%2B15550000000'));

    expect(queries[0].filters).toContainEqual(['email', 'sam@example.com']);
    expect(queries[0].filters).toContainEqual(['phone', '+15550000000']);
  });

  it('narrows on a parseable updated_since and ignores one it cannot read', async () => {
    results.leads = { data: [], error: null };
    await listLeads(request('https://api.letsgetquoted.com/api/v1/leads?updated_since=2026-09-01T00:00:00Z'));
    expect(queries[0].gte).toContainEqual(['updated_at', '2026-09-01T00:00:00.000Z']);

    queries = [];
    await listLeads(request('https://api.letsgetquoted.com/api/v1/leads?updated_since=last%20tuesday'));
    expect(queries[0].gte).toEqual([]);
  });

  it('returns newest first, broken by id so the order is total', async () => {
    results.leads = { data: [], error: null };

    await listLeads(request('https://api.letsgetquoted.com/api/v1/leads'));

    expect(queries[0].order).toEqual([
      ['created_at', { ascending: false }],
      ['id', { ascending: false }],
    ]);
  });

  it('surfaces a database error rather than reporting an empty page', async () => {
    results.leads = { data: null, error: { message: 'connection reset' } };

    await expect(listLeads(request('https://api.letsgetquoted.com/api/v1/leads'))).rejects.toMatchObject({
      message: 'connection reset',
    });
  });
});

describe('POST /api/v1/leads', () => {
  it('rejects a body that is not JSON', async () => {
    const response = await createLeadRoute(
      request('https://api.letsgetquoted.com/api/v1/leads', { method: 'POST', body: 'not json' }),
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe('invalid_request');
    expect(mocks.createLead).not.toHaveBeenCalled();
  });

  it('rejects a lead with no name, and says which field failed', async () => {
    const response = await createLeadRoute(
      request('https://api.letsgetquoted.com/api/v1/leads', {
        method: 'POST',
        body: JSON.stringify({ phone: '+15550000000' }),
      }),
    );

    const body = await response.json();
    expect(response.status).toBe(400);
    expect(body.error.code).toBe('invalid_request');
    expect(body.error.details.join(' ')).toContain('name');
    expect(mocks.createLead).not.toHaveBeenCalled();
  });

  it('creates the lead in the token workspace and answers 201', async () => {
    mocks.createLead.mockResolvedValue(lead());

    const response = await createLeadRoute(
      request('https://api.letsgetquoted.com/api/v1/leads', {
        method: 'POST',
        body: JSON.stringify({ name: 'Sam Rivera', account_id: 'workspace-b' }),
      }),
    );

    expect(response.status).toBe(201);
    // The workspace comes from the token, not from the body.
    expect(mocks.createLead).toHaveBeenCalledWith(expect.anything(), ACCOUNT_ID, expect.objectContaining({ name: 'Sam Rivera' }));
    expect((await response.json()).id).toBe('lead-1');
  });
});

describe('GET /api/v1/leads/[id]', () => {
  it('answers 404 when the route carries no id', async () => {
    const response = await getLeadRoute(request('https://api.letsgetquoted.com/api/v1/leads/'), segment({}));

    expect(response.status).toBe(404);
    expect(mocks.getLead).not.toHaveBeenCalled();
  });

  it('looks the lead up inside the token workspace', async () => {
    mocks.getLead.mockResolvedValue(lead());

    await getLeadRoute(request('https://api.letsgetquoted.com/api/v1/leads/lead-1'), segment({ id: 'lead-1' }));

    expect(mocks.getLead).toHaveBeenCalledWith(expect.anything(), ACCOUNT_ID, 'lead-1');
  });

  it('answers 404 for a lead in another workspace, without saying it exists', async () => {
    mocks.getLead.mockResolvedValue(null);

    const response = await getLeadRoute(
      request('https://api.letsgetquoted.com/api/v1/leads/lead-from-workspace-b'),
      segment({ id: 'lead-from-workspace-b' }),
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe('not_found');
  });

  it('returns the public shape, not the raw row', async () => {
    mocks.getLead.mockResolvedValue(lead({ account_id: ACCOUNT_ID }));

    const body = await (
      await getLeadRoute(request('https://api.letsgetquoted.com/api/v1/leads/lead-1'), segment({ id: 'lead-1' }))
    ).json();

    expect(body).toMatchObject({ id: 'lead-1', customer: { name: 'Sam Rivera' } });
    expect(body).not.toHaveProperty('account_id');
  });
});

describe('PATCH /api/v1/leads/[id]', () => {
  const patchRequest = (body: unknown) =>
    request('https://api.letsgetquoted.com/api/v1/leads/lead-1', {
      method: 'PATCH',
      body: typeof body === 'string' ? body : JSON.stringify(body),
    });

  it('checks the lead is in this workspace before it reads the body', async () => {
    mocks.getLead.mockResolvedValue(null);

    const response = await patchLeadRoute(patchRequest({ name: 'New name' }), segment({ id: 'lead-1' }));

    expect(response.status).toBe(404);
    expect(queries).toEqual([]);
  });

  it('rejects a body that is not JSON', async () => {
    mocks.getLead.mockResolvedValue(lead());

    const response = await patchLeadRoute(patchRequest('not json'), segment({ id: 'lead-1' }));

    expect(response.status).toBe(400);
    expect(queries).toEqual([]);
  });

  it('rejects a blank name rather than storing one', async () => {
    mocks.getLead.mockResolvedValue(lead());

    const response = await patchLeadRoute(patchRequest({ name: '   ' }), segment({ id: 'lead-1' }));

    expect(response.status).toBe(400);
    expect((await response.json()).error.details.join(' ')).toContain('name');
    expect(queries).toEqual([]);
  });

  it('writes only the fields the caller sent, scoped to workspace and lead', async () => {
    mocks.getLead.mockResolvedValue(lead());
    results.leads = { data: lead({ name: 'Sam R.' }), error: null };

    const response = await patchLeadRoute(patchRequest({ name: 'Sam R.' }), segment({ id: 'lead-1' }));

    expect(response.status).toBe(200);
    const [query] = queries;
    expect(query.filters).toContainEqual(['account_id', ACCOUNT_ID]);
    expect(query.filters).toContainEqual(['id', 'lead-1']);
    expect(Object.keys(query.update ?? {}).sort()).toEqual(['name', 'updated_at']);
  });

  it('leaves untouched fields out of the patch entirely', async () => {
    mocks.getLead.mockResolvedValue(lead());
    results.leads = { data: lead(), error: null };

    await patchLeadRoute(patchRequest({ status: 'contacted' }), segment({ id: 'lead-1' }));

    expect(queries[0].update).not.toHaveProperty('email');
    expect(queries[0].update).not.toHaveProperty('phone');
    expect(queries[0].update).toMatchObject({ status: 'contacted' });
  });

  /**
   * A lead becomes won by converting a quote or completing a job, not by an
   * integration setting a string. Allowing it here would let an external system
   * mark work as won with no quote and no job behind it, which is the number the
   * contractor reads their own conversion rate from.
   */
  it('refuses a direct transition to won, and writes nothing', async () => {
    mocks.getLead.mockResolvedValue(lead());

    const response = await patchLeadRoute(patchRequest({ status: 'won' }), segment({ id: 'lead-1' }));

    expect(response.status).toBe(400);
    expect((await response.json()).error.details.join(' ')).toContain('won');
    expect(queries).toEqual([]);
  });

  it.each(['archived', 'WON', 'pending', ''])('refuses the unknown status %j', async (status) => {
    mocks.getLead.mockResolvedValue(lead());

    const response = await patchLeadRoute(patchRequest({ status }), segment({ id: 'lead-1' }));

    expect(response.status).toBe(400);
    expect(queries).toEqual([]);
  });

  it('raises a failed update rather than answering as if it worked', async () => {
    mocks.getLead.mockResolvedValue(lead());
    results.leads = { data: null, error: { message: 'row is locked' } };

    await expect(patchLeadRoute(patchRequest({ status: 'contacted' }), segment({ id: 'lead-1' }))).rejects.toMatchObject({
      message: 'row is locked',
    });
  });
});

describe('GET /api/v1/me', () => {
  it('describes the workspace the token belongs to, and the token itself', async () => {
    results.accounts = { data: { id: ACCOUNT_ID, business_name: 'Test Contracting', created_at: '2026-01-01T00:00:00.000Z' }, error: null };

    const response = await getMe(request('https://api.letsgetquoted.com/api/v1/me'));
    const body = await response.json();

    expect(queries[0].filters).toContainEqual(['id', ACCOUNT_ID]);
    expect(body).toMatchObject({
      workspace_id: ACCOUNT_ID,
      business_name: 'Test Contracting',
      token_name: 'Integration token',
      token_id: 'cred-1',
      scopes: ['leads.read', 'leads.write'],
    });
  });

  it('answers 404 when the workspace behind the token is gone', async () => {
    results.accounts = { data: null, error: { message: 'no rows' } };

    const response = await getMe(request('https://api.letsgetquoted.com/api/v1/me'));

    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe('not_found');
  });
});

describe('GET /api/v1/events', () => {
  const event = (overrides: Record<string, unknown> = {}) => ({
    id: 'event-1',
    event_type: 'lead.created',
    aggregate_type: 'lead',
    aggregate_id: 'lead-1',
    payload: { id: 'lead-1' },
    occurred_at: '2026-09-01T10:00:00+00:00',
    ...overrides,
  });

  it('reads only this workspace, newest first', async () => {
    results.integration_events = { data: [event()], error: null };

    await listEvents(request('https://api.letsgetquoted.com/api/v1/events'));

    expect(queries[0].filters).toContainEqual(['account_id', ACCOUNT_ID]);
    expect(queries[0].order).toEqual([['occurred_at', { ascending: false }]]);
  });

  it.each([
    ['', 20],
    ['?limit=50', 50],
    ['?limit=1000', 100],
    ['?limit=nonsense', 20],
  ])('clamps the page size for %j', async (search, expected) => {
    results.integration_events = { data: [], error: null };

    await listEvents(request(`https://api.letsgetquoted.com/api/v1/events${search}`));

    // Unlike leads, this endpoint does not paginate, so it asks for exactly
    // the page size.
    expect(queries[0].limit).toBe(expected);
  });

  it('filters on event_type only when one was asked for', async () => {
    results.integration_events = { data: [], error: null };
    await listEvents(request('https://api.letsgetquoted.com/api/v1/events?event_type=lead.created'));
    expect(queries[0].filters).toContainEqual(['event_type', 'lead.created']);

    queries = [];
    await listEvents(request('https://api.letsgetquoted.com/api/v1/events'));
    expect(queries[0].filters.map(([column]) => column)).not.toContain('event_type');
  });

  it('renames the row into the documented event shape and normalises the timestamp', async () => {
    results.integration_events = { data: [event()], error: null };

    const body = await (await listEvents(request('https://api.letsgetquoted.com/api/v1/events'))).json();

    expect(body.data[0]).toEqual({
      id: 'event-1',
      event: 'lead.created',
      aggregate_type: 'lead',
      aggregate_id: 'lead-1',
      // PostgREST hands back +00:00; the API promises Z.
      occurred_at: '2026-09-01T10:00:00.000Z',
      data: { id: 'lead-1' },
    });
  });

  it('surfaces a database error rather than reporting no events', async () => {
    results.integration_events = { data: null, error: { message: 'connection reset' } };

    await expect(listEvents(request('https://api.letsgetquoted.com/api/v1/events'))).rejects.toMatchObject({
      message: 'connection reset',
    });
  });
});

describe('GET /api/v1/webhook-subscriptions', () => {
  const subscription = (overrides: Record<string, unknown> = {}) => ({
    id: 'sub-1',
    target_url: 'https://hooks.example.com/lgq',
    event_types: ['lead.created'],
    secret_preview: 'whsec_test...',
    status: 'active',
    disabled_reason: null,
    consecutive_failures: 0,
    created_at: '2026-09-01T10:00:00+00:00',
    updated_at: '2026-09-02T10:00:00+00:00',
    ...overrides,
  });

  it('lists only this workspace subscriptions, newest first', async () => {
    results.webhook_subscriptions = { data: [subscription()], error: null };

    await listSubscriptions(request('https://api.letsgetquoted.com/api/v1/webhook-subscriptions'));

    expect(queries[0].filters).toContainEqual(['account_id', ACCOUNT_ID]);
    expect(queries[0].order).toEqual([['created_at', { ascending: false }]]);
  });

  /**
   * The signing secret is stored encrypted and shown once, at creation. If it
   * ever appears in a list projection it is recoverable by anyone with a
   * read-scoped token, which defeats the point of signing at all.
   */
  it('never selects the stored secret, only its preview', async () => {
    results.webhook_subscriptions = { data: [subscription()], error: null };

    await listSubscriptions(request('https://api.letsgetquoted.com/api/v1/webhook-subscriptions'));

    expect(queries[0].select).toContain('secret_preview');
    expect(queries[0].select).not.toContain('encrypted_secret');
  });

  it('normalises both timestamps and echoes the failure counter', async () => {
    results.webhook_subscriptions = { data: [subscription({ consecutive_failures: 3, status: 'disabled', disabled_reason: 'too many failures' })], error: null };

    const body = await (await listSubscriptions(request('https://api.letsgetquoted.com/api/v1/webhook-subscriptions'))).json();

    expect(body.data[0]).toMatchObject({
      created_at: '2026-09-01T10:00:00.000Z',
      updated_at: '2026-09-02T10:00:00.000Z',
      consecutive_failures: 3,
      status: 'disabled',
      disabled_reason: 'too many failures',
    });
    expect(body.data[0]).not.toHaveProperty('encrypted_secret');
  });

  it('surfaces a database error rather than reporting no subscriptions', async () => {
    results.webhook_subscriptions = { data: null, error: { message: 'connection reset' } };

    await expect(
      listSubscriptions(request('https://api.letsgetquoted.com/api/v1/webhook-subscriptions')),
    ).rejects.toMatchObject({ message: 'connection reset' });
  });
});

describe('POST /api/v1/webhook-subscriptions', () => {
  const post = (body: unknown) =>
    request('https://api.letsgetquoted.com/api/v1/webhook-subscriptions', {
      method: 'POST',
      body: typeof body === 'string' ? body : JSON.stringify(body),
    });

  it.each([
    ['a body that is not JSON', 'not json'],
    ['an array body', [] as unknown],
    ['a body with no target_url', { event_types: ['lead.created'] }],
    ['a blank target_url', { target_url: '   ', event_types: ['lead.created'] }],
  ])('refuses %s without writing', async (_label, body) => {
    const response = await createSubscription(post(body));

    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe('invalid_request');
    expect(queries).toEqual([]);
  });

  it('refuses a target the SSRF guard rejects, and says why', async () => {
    mocks.validateWebhookUrl.mockResolvedValue({ safe: false, reason: 'resolves to a private address' });

    const response = await createSubscription(post({ target_url: 'http://169.254.169.254/latest', event_types: ['lead.created'] }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.message).toContain('resolves to a private address');
    expect(queries).toEqual([]);
    expect(mocks.generateWebhookSecret).not.toHaveBeenCalled();
  });

  it.each([
    ['no event_types at all', {}],
    ['an empty array', { event_types: [] }],
    ['a string instead of an array', { event_types: 'lead.created' }],
  ])('refuses %s', async (_label, extra) => {
    const response = await createSubscription(post({ target_url: 'https://hooks.example.com/lgq', ...extra }));

    expect(response.status).toBe(400);
    expect(queries).toEqual([]);
  });

  it('refuses a list of event types it does not publish, naming the ones it does', async () => {
    const response = await createSubscription(
      post({ target_url: 'https://hooks.example.com/lgq', event_types: ['invoice.paid', 'job.completed'] }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.message).toContain('lead.created');
    expect(queries).toEqual([]);
  });

  it('keeps the events it publishes and drops the rest', async () => {
    results.webhook_subscriptions = {
      data: {
        id: 'sub-1',
        target_url: 'https://hooks.example.com/lgq',
        event_types: ['lead.created'],
        secret_preview: 'whsec_test...',
        status: 'active',
        created_at: '2026-09-01T10:00:00+00:00',
        updated_at: '2026-09-01T10:00:00+00:00',
      },
      error: null,
    };

    await createSubscription(
      post({ target_url: 'https://hooks.example.com/lgq', event_types: ['lead.created', 'invoice.paid'] }),
    );

    expect(queries[0].insert?.event_types).toEqual(['lead.created']);
  });

  it('stores each event type once, however many times it was asked for', async () => {
    results.webhook_subscriptions = {
      data: { id: 'sub-1', target_url: 'https://hooks.example.com/lgq', event_types: ['lead.created'], secret_preview: 'p', status: 'active', created_at: '2026-09-01T10:00:00Z', updated_at: '2026-09-01T10:00:00Z' },
      error: null,
    };

    await createSubscription(
      post({ target_url: 'https://hooks.example.com/lgq', event_types: ['lead.created', 'lead.created', ' lead.created '] }),
    );

    expect(queries[0].insert?.event_types).toEqual(['lead.created']);
  });

  it('binds the subscription to the token workspace and credential, not to the body', async () => {
    results.webhook_subscriptions = {
      data: { id: 'sub-1', target_url: 'https://hooks.example.com/lgq', event_types: ['lead.created'], secret_preview: 'p', status: 'active', created_at: '2026-09-01T10:00:00Z', updated_at: '2026-09-01T10:00:00Z' },
      error: null,
    };

    await createSubscription(
      post({ target_url: 'https://hooks.example.com/lgq', event_types: ['lead.created'], account_id: 'workspace-b', status: 'disabled' }),
    );

    expect(queries[0].insert).toMatchObject({
      account_id: ACCOUNT_ID,
      credential_id: 'cred-1',
      status: 'active',
      encrypted_secret: 'encrypted-blob',
    });
  });

  it('returns the signing secret once, in plain text, and stores only the encrypted form', async () => {
    results.webhook_subscriptions = {
      data: { id: 'sub-1', target_url: 'https://hooks.example.com/lgq', event_types: ['lead.created'], secret_preview: 'whsec_tes...', status: 'active', created_at: '2026-09-01T10:00:00+00:00', updated_at: '2026-09-01T10:00:00+00:00' },
      error: null,
    };

    const response = await createSubscription(post({ target_url: 'https://hooks.example.com/lgq', event_types: ['lead.created'] }));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.secret).toBe('whsec_test_secret_value');
    // The plain secret is never what gets written.
    expect(queries[0].insert?.encrypted_secret).toBe('encrypted-blob');
    expect(JSON.stringify(queries[0].insert)).not.toContain('whsec_test_secret_value');
  });

  it('raises a failed insert rather than answering 201', async () => {
    results.webhook_subscriptions = { data: null, error: { message: 'unique violation' } };

    await expect(
      createSubscription(post({ target_url: 'https://hooks.example.com/lgq', event_types: ['lead.created'] })),
    ).rejects.toMatchObject({ message: 'unique violation' });
  });
});

describe('GET and DELETE /api/v1/webhook-subscriptions/[id]', () => {
  it('answers 404 when the route carries no id, on both verbs', async () => {
    const read = await getSubscription(request('https://api.letsgetquoted.com/api/v1/webhook-subscriptions/'), segment({}));
    const removed = await deleteSubscription(request('https://api.letsgetquoted.com/api/v1/webhook-subscriptions/', { method: 'DELETE' }), segment({}));

    expect(read.status).toBe(404);
    expect(removed.status).toBe(404);
    expect(queries).toEqual([]);
  });

  it('reads one subscription scoped to workspace and id', async () => {
    results.webhook_subscriptions = {
      data: { id: 'sub-1', target_url: 'https://hooks.example.com/lgq', event_types: ['lead.created'], secret_preview: 'p', status: 'active', disabled_reason: null, consecutive_failures: 0, created_at: '2026-09-01T10:00:00Z', updated_at: '2026-09-01T10:00:00Z' },
      error: null,
    };

    await getSubscription(request('https://api.letsgetquoted.com/api/v1/webhook-subscriptions/sub-1'), segment({ id: 'sub-1' }));

    expect(queries[0].filters).toContainEqual(['account_id', ACCOUNT_ID]);
    expect(queries[0].filters).toContainEqual(['id', 'sub-1']);
    expect(queries[0].select).not.toContain('encrypted_secret');
  });

  it('answers 404 for a subscription in another workspace', async () => {
    results.webhook_subscriptions = { data: null, error: null };

    const response = await getSubscription(
      request('https://api.letsgetquoted.com/api/v1/webhook-subscriptions/sub-from-workspace-b'),
      segment({ id: 'sub-from-workspace-b' }),
    );

    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe('not_found');
  });

  it('deletes scoped to workspace and id, and answers 204 with no body', async () => {
    results.webhook_subscriptions = { data: null, error: null };

    const response = await deleteSubscription(
      request('https://api.letsgetquoted.com/api/v1/webhook-subscriptions/sub-1', { method: 'DELETE' }),
      segment({ id: 'sub-1' }),
    );

    expect(response.status).toBe(204);
    expect(await response.text()).toBe('');
    expect(queries[0].deleted).toBe(true);
    expect(queries[0].filters).toContainEqual(['account_id', ACCOUNT_ID]);
    expect(queries[0].filters).toContainEqual(['id', 'sub-1']);
  });

  it('raises a failed delete rather than reporting success', async () => {
    results.webhook_subscriptions = { data: null, error: { message: 'permission denied' } };

    await expect(
      deleteSubscription(
        request('https://api.letsgetquoted.com/api/v1/webhook-subscriptions/sub-1', { method: 'DELETE' }),
        segment({ id: 'sub-1' }),
      ),
    ).rejects.toMatchObject({ message: 'permission denied' });
  });
});

describe('POST /api/v1/webhook-deliveries/[id]/retry', () => {
  const retryRequest = () =>
    request('https://api.letsgetquoted.com/api/v1/webhook-deliveries/delivery-1/retry', { method: 'POST' });

  it('answers 404 when the route carries no id', async () => {
    const response = await retryDelivery(retryRequest(), segment({}));

    expect(response.status).toBe(404);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('passes the workspace to the requeue function alongside the delivery', async () => {
    mocks.rpc.mockResolvedValue({ data: true, error: null });

    await retryDelivery(retryRequest(), segment({ id: 'delivery-1' }));

    expect(mocks.rpc).toHaveBeenCalledWith('retry_webhook_delivery', {
      p_delivery_id: 'delivery-1',
      p_account_id: ACCOUNT_ID,
    });
  });

  it('reports the delivery queued when the function says it was', async () => {
    mocks.rpc.mockResolvedValue({ data: true, error: null });

    const body = await (await retryDelivery(retryRequest(), segment({ id: 'delivery-1' }))).json();

    expect(body).toEqual({ success: true, delivery_id: 'delivery-1', status: 'pending' });
  });

  /**
   * The function returns false for a delivery that does not exist, belongs to
   * another account, or is not retryable — and all three answer the same 404, so
   * the caller cannot tell another workspace's delivery id from a made-up one.
   */
  it('answers the same 404 whether the delivery is missing, another workspace\'s, or not retryable', async () => {
    const outcomes = [
      { data: false, error: null },
      { data: null, error: { message: 'no such delivery' } },
      { data: null, error: null },
    ];
    const bodies: unknown[] = [];
    const statuses: number[] = [];

    for (const outcome of outcomes) {
      mocks.rpc.mockResolvedValue(outcome);
      const response = await retryDelivery(retryRequest(), segment({ id: 'delivery-1' }));
      statuses.push(response.status);
      bodies.push(await response.json());
    }

    expect(statuses).toEqual([404, 404, 404]);
    // Byte-identical, so a caller cannot probe for delivery ids belonging to
    // another workspace by reading the difference between the answers.
    expect(new Set(bodies.map((body) => JSON.stringify(body))).size).toBe(1);
    expect((bodies[0] as { error: { code: string } }).error.code).toBe('not_found');
  });

  it('does not leak the database error text to the caller', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'relation webhook_deliveries does not exist' } });

    const body = await (await retryDelivery(retryRequest(), segment({ id: 'delivery-1' }))).json();

    expect(JSON.stringify(body)).not.toContain('relation webhook_deliveries');
  });
});

describe('GET /api/v1/webhook-subscriptions/[id]/deliveries', () => {
  const delivery = (overrides: Record<string, unknown> = {}) => ({
    id: 'delivery-1',
    event_id: 'event-1',
    status: 'failed',
    attempt_count: 2,
    max_attempts: 5,
    next_attempt_at: '2026-09-02T10:00:00+00:00',
    delivered_at: null,
    last_error: 'connect ETIMEDOUT',
    created_at: '2026-09-01T10:00:00+00:00',
    updated_at: '2026-09-02T09:00:00+00:00',
    ...overrides,
  });

  const deliveriesRequest = (search = '') =>
    request(`https://api.letsgetquoted.com/api/v1/webhook-subscriptions/sub-1/deliveries${search}`);

  it('answers 404 when the route carries no subscription id', async () => {
    const response = await listDeliveries(deliveriesRequest(), segment({}));

    expect(response.status).toBe(404);
    expect(queries).toEqual([]);
  });

  /**
   * Both filters matter. Scoping to the subscription alone would list another
   * workspace's deliveries for anyone who guessed a subscription id.
   */
  it('narrows to this workspace and this subscription, newest first', async () => {
    results.webhook_deliveries = { data: [delivery()], error: null };

    await listDeliveries(deliveriesRequest(), segment({ id: 'sub-1' }));

    expect(queries[0].filters).toContainEqual(['account_id', ACCOUNT_ID]);
    expect(queries[0].filters).toContainEqual(['subscription_id', 'sub-1']);
    expect(queries[0].order).toEqual([['created_at', { ascending: false }]]);
  });

  it.each([
    ['', 20],
    ['?limit=1', 1],
    ['?limit=100', 100],
    ['?limit=10000', 100],
    ['?limit=junk', 20],
  ])('clamps the page size for %j', async (search, expected) => {
    results.webhook_deliveries = { data: [], error: null };

    await listDeliveries(deliveriesRequest(search), segment({ id: 'sub-1' }));

    expect(queries[0].limit).toBe(expected);
  });

  it('normalises the timestamps it has and leaves the absent ones null', async () => {
    results.webhook_deliveries = { data: [delivery()], error: null };

    const body = await (await listDeliveries(deliveriesRequest(), segment({ id: 'sub-1' }))).json();

    expect(body.data[0]).toMatchObject({
      next_attempt_at: '2026-09-02T10:00:00.000Z',
      delivered_at: null,
      created_at: '2026-09-01T10:00:00.000Z',
      updated_at: '2026-09-02T09:00:00.000Z',
      last_error: 'connect ETIMEDOUT',
      attempt_count: 2,
      max_attempts: 5,
    });
  });

  it('normalises a delivered timestamp once there is one', async () => {
    results.webhook_deliveries = {
      data: [delivery({ status: 'delivered', delivered_at: '2026-09-02T11:00:00+00:00', next_attempt_at: null, last_error: null })],
      error: null,
    };

    const body = await (await listDeliveries(deliveriesRequest(), segment({ id: 'sub-1' }))).json();

    expect(body.data[0]).toMatchObject({ delivered_at: '2026-09-02T11:00:00.000Z', next_attempt_at: null });
  });

  it('surfaces a database error rather than reporting no deliveries', async () => {
    results.webhook_deliveries = { data: null, error: { message: 'connection reset' } };

    await expect(listDeliveries(deliveriesRequest(), segment({ id: 'sub-1' }))).rejects.toMatchObject({
      message: 'connection reset',
    });
  });
});

describe('GET /api/v1/openapi.json', () => {
  it('serves the spec without a token, because it is the documentation', async () => {
    const response = await getOpenApi();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
  });

  it('is cacheable for an hour at the edge as well as the browser', async () => {
    const response = await getOpenApi();

    // A spec that changes only on deploy; serving it uncached puts a function
    // invocation behind every reader's refresh.
    expect(response.headers.get('cache-control')).toBe('public, max-age=3600, s-maxage=3600');
  });

  /**
   * One documented path per route file under /api/v1. A route shipped without
   * a spec entry is a route no integrator can find, and a spec entry with no
   * route is a promise the API does not keep.
   */
  it('documents every route this API actually serves, and invents none', async () => {
    const spec = await (await getOpenApi()).json();

    expect(spec.openapi).toBeDefined();
    expect(Object.keys(spec.paths).sort()).toEqual([
      '/events',
      '/leads',
      '/leads/{id}',
      '/me',
      '/webhook-deliveries/{id}/retry',
      '/webhook-subscriptions',
      '/webhook-subscriptions/{id}',
      '/webhook-subscriptions/{id}/deliveries',
    ]);
  });

  it('carries no real credential, only the token format an integrator needs', async () => {
    const body = JSON.stringify(await (await getOpenApi()).json());

    // The prefix appears on purpose, in bearerFormat, so callers know what a
    // token looks like. What must never appear is one with material after it.
    expect(body).not.toMatch(/lgq_live_[A-Za-z0-9]{12,}/);
    expect(body).not.toMatch(/whsec_[A-Za-z0-9]{12,}/);
    expect(body).not.toMatch(/sk_(live|test)_[A-Za-z0-9]{12,}/);
    expect(body).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
  });

  it('tells integrators the token goes in a bearer header', async () => {
    const spec = await (await getOpenApi()).json();
    const schemes = spec.components?.securitySchemes ?? {};

    expect(JSON.stringify(schemes)).toContain('lgq_live_');
    expect(Object.values(schemes).some((scheme: any) => scheme.scheme === 'bearer')).toBe(true);
  });
});
