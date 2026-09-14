vi.mock('@/lib/margin-evaluation-queue',()=>({runMarginEvaluations:mocks.margins}));
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ admin: vi.fn(), run: vi.fn(), finish: vi.fn(), margins: vi.fn() }));
vi.mock('@/lib/auth', () => ({ createAdminClient: mocks.admin }));
vi.mock('@/lib/owner-event-notices', () => ({ runOwnerEventNotices: mocks.run }));
import { GET } from '@/app/api/cron/owner-event-notices/route';

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('CRON_SECRET', 'local-cron-secret');
  vi.stubEnv('LGQ_OWNER_EVENT_NOTICES_ENABLED', 'false');
  vi.spyOn(Math, 'random').mockReturnValue(0.5);
  mocks.admin.mockReturnValue({ from: () => ({
    insert: () => ({ select: () => ({ maybeSingle: async () => ({ data: { id: 'run-1' }, error: null }) }) }),
    update: (patch: unknown) => { mocks.finish(patch); return { eq: async () => ({ error: null }) }; },
  }) });
  mocks.margins.mockResolvedValue({marginEvaluations:0,marginEvaluationFailures:0});
  mocks.run.mockResolvedValue({ ownersNotified: 1, errors: 0 });
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
const request = (authorization = 'Bearer local-cron-secret') => new Request('https://example.test/api/cron/owner-event-notices', { headers: { authorization } });

it('rejects unauthenticated requests before any database or sending work', async () => {
  expect((await GET(request('Bearer wrong'))).status).toBe(401);
  vi.stubEnv('CRON_SECRET', '');
  expect((await GET(request())).status).toBe(401);
  expect(mocks.admin).not.toHaveBeenCalled(); expect(mocks.run).not.toHaveBeenCalled();
});

it('records a disabled run without claiming or sending', async () => {
  const response = await GET(request());
  expect(response.status).toBe(200);
  expect(mocks.run).not.toHaveBeenCalled();
  expect(mocks.finish).toHaveBeenCalledWith(expect.objectContaining({ ok: true, summary: expect.objectContaining({ skipped: true }) }));
});

it('runs the bounded worker only when enabled and records its failures as unhealthy', async () => {
  vi.stubEnv('LGQ_OWNER_EVENT_NOTICES_ENABLED', 'true');
  expect((await GET(request())).status).toBe(200);
  expect(mocks.run).toHaveBeenCalledWith(mocks.admin.mock.results[0].value);
  mocks.run.mockResolvedValueOnce({ ownersNotified: 0, errors: 2, notificationBacklog: 2 });
  expect((await GET(request())).status).toBe(500);
  expect(mocks.finish).toHaveBeenLastCalledWith(expect.objectContaining({ ok: false }));
});

it('continues owner pickup and reports unhealthy when margin evaluation cannot start',async()=>{
  vi.stubEnv('LGQ_OWNER_EVENT_NOTICES_ENABLED','true');mocks.margins.mockRejectedValueOnce(new Error('database unavailable'));
  expect((await GET(request())).status).toBe(500);expect(mocks.run).toHaveBeenCalled();
});
