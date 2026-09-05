import { beforeEach, describe, expect, it, vi } from 'vitest';
import { measuredRoom } from './fixtures/room-scan';
import { parseCustomScanJson } from '@/lib/property-intel/room-scan-validation';

const mocks = vi.hoisted(() => ({ membership: vi.fn(), client: vi.fn(), getUser: vi.fn() }));
vi.mock('@/lib/auth', () => ({ getCurrentMembership: mocks.membership }));
vi.mock('@/lib/supabase-server', () => ({ createSupabaseServerClient: mocks.client }));
import { GET, PUT } from '@/app/api/room-scans/route';

const id = '11111111-1111-4111-8111-111111111111';
const leadId = '22222222-2222-4222-8222-222222222222';
const url = `http://localhost/api/room-scans?kind=job&id=${id}`;
let queries: Array<{ table: string; filters: Array<[string, unknown]>; update: unknown }>;
let replies: Array<{ data: unknown; error?: unknown }>;

beforeEach(() => {
  vi.clearAllMocks(); queries = []; replies = [];
  mocks.getUser.mockResolvedValue({ data: { user: { id: 'user-a' } } });
  mocks.membership.mockResolvedValue({ accountId: 'account-a', role: 'owner' });
  mocks.client.mockResolvedValue({ auth: { getUser: mocks.getUser }, from: (table: string) => {
    const log = { table, filters: [] as Array<[string, unknown]>, update: undefined as unknown };
    queries.push(log);
    const q = { select: () => q, eq: (key: string, value: unknown) => { log.filters.push([key, value]); return q; },
      is: (key: string, value: unknown) => { log.filters.push([key, value]); return q; },
      update: (value: unknown) => { log.update = value; return q; }, maybeSingle: async () => replies.shift() ?? { data: null } };
    return q;
  } });
});

describe('room scan persistence API', () => {
  it('requires a signed-in owner before reading or writing', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    expect((await GET(new Request(url))).status).toBe(401);
    expect((await PUT(new Request(url, { method: 'PUT', body: '{}' }))).status).toBe(401);
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'crew' } } });
    mocks.membership.mockResolvedValue({ accountId: 'account-a', role: 'crew' });
    expect((await PUT(new Request(url, { method: 'PUT', body: '{}' }))).status).toBe(403);
    expect(queries).toHaveLength(0);
  });

  it('validates target identifiers and scan geometry before mutation', async () => {
    expect((await GET(new Request('http://localhost/api/room-scans?kind=accounts&id=nope'))).status).toBe(400);
    expect((await PUT(new Request(url, { method: 'PUT', body: '{"walls":[{}]}' }))).status).toBe(400);
    expect(queries).toHaveLength(0);
  });

  it('saves canonical geometry on the specific active account-owned job', async () => {
    replies.push({ data: { id } });
    const response = await PUT(new Request(url, { method: 'PUT', body: JSON.stringify(measuredRoom) }));
    expect(response.status).toBe(200);
    const { scan } = await response.json();
    expect(scan.floorPolygon).toHaveLength(4);
    expect(scan.confidenceScore).toBe(0);
    expect(queries[0]).toEqual({ table: 'jobs', filters: [['account_id', 'account-a'], ['id', id], ['deleted_at', null]], update: { room_spatial_scan: scan } });
  });

  it('does not report a successful save when the target belongs to another account or was deleted', async () => {
    replies.push({ data: null });
    expect((await PUT(new Request(url, { method: 'PUT', body: JSON.stringify(measuredRoom) }))).status).toBe(404);
  });

  it('loads a converted lead scan only through the same account and active-row filters', async () => {
    const scan = parseCustomScanJson(JSON.stringify(measuredRoom));
    replies.push({ data: { room_spatial_scan: null, lead_id: leadId } }, { data: { room_spatial_scan: scan } });
    const response = await GET(new Request(url));
    expect(await response.json()).toEqual({ scan });
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(queries[1]).toMatchObject({ table: 'leads', filters: [['account_id', 'account-a'], ['id', leadId], ['deleted_at', null]] });
  });

  it('returns no scan for a job without measurements instead of choosing a preset', async () => {
    replies.push({ data: { room_spatial_scan: null, lead_id: null } });
    expect(await (await GET(new Request(url))).json()).toEqual({ scan: null });
  });

  it('never exposes database errors or treats an invalid saved scan as empty', async () => {
    replies.push({ data: null, error: { message: 'private database details' } });
    const response = await GET(new Request(url));
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain('private database');
    replies.push({ data: { room_spatial_scan: { walls: [{}] } } });
    expect((await GET(new Request(url))).status).toBe(500);
  });

  it('caps actual request bytes even without a Content-Length header', async () => {
    const response = await PUT(new Request(url, { method: 'PUT', body: ' '.repeat(1048577) }));
    expect(response.status).toBe(413);
    expect(queries).toHaveLength(0);
  });
});
