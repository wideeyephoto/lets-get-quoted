import { beforeEach, afterEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ run: vi.fn(), live: vi.fn(), wrapper: vi.fn() }));
vi.mock('@/lib/email-recovery-worker', () => ({ runEmailRecovery: mocks.run }));
vi.mock('@/lib/cron-runs', () => ({ cronRoute: mocks.wrapper.mockReturnValue(mocks.live) }));
import { GET } from '@/app/api/cron/email-recovery/route';
beforeEach(() => { vi.stubEnv('CRON_SECRET', 'test-secret'); mocks.run.mockReset().mockResolvedValue({ dryRun: true }); mocks.live.mockReset().mockResolvedValue(new Response('{}')); });
afterEach(() => vi.unstubAllEnvs());
it('rejects unauthorized previews without a worker call', async () => {
  expect((await GET(new Request('http://local/api/cron/email-recovery?dryRun=true'))).status).toBe(401);
  expect(mocks.run).not.toHaveBeenCalled(); expect(mocks.live).not.toHaveBeenCalled();
});
it('runs authorized preview outside the mutating heartbeat wrapper', async () => {
  expect((await GET(new Request('http://local/api/cron/email-recovery?dryRun=true', { headers: { authorization: 'Bearer test-secret' } }))).status).toBe(200);
  expect(mocks.run).toHaveBeenCalledWith(undefined, { dryRun: true }); expect(mocks.live).not.toHaveBeenCalled();
});
it('delegates actual runs to the existing authentication and heartbeat wrapper', async () => {
  await GET(new Request('http://local/api/cron/email-recovery'));
  expect(mocks.live).toHaveBeenCalledOnce(); expect(mocks.run).not.toHaveBeenCalled();
});
