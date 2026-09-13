import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  createAdminClient: mocks.createAdminClient,
}));

function getCronRouteDirs(): string[] {
  const base = join(process.cwd(), 'src/app/api/cron');
  return readdirSync(base).filter((entry) => {
    try {
      return statSync(join(base, entry, 'route.ts')).isFile();
    } catch {
      return false;
    }
  });
}

describe('Cron Route Execution & Security Matrix', () => {
  const cronDirs = getCronRouteDirs();
  const ORIGINAL_ENV = process.env;
  let fakeAdmin: any;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...ORIGINAL_ENV, CRON_SECRET: 'super-secret-cron-token' };

    fakeAdmin = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'cron-run-123' }, error: null }),
          }),
        }),
        update: vi.fn().mockResolvedValue({ error: null }),
        delete: vi.fn().mockReturnValue({
          lt: vi.fn().mockResolvedValue({ error: null }),
        }),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
    };
    mocks.createAdminClient.mockReturnValue(fakeAdmin);
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  it(`discovers all expected cron routes on disk (${cronDirs.length} total)`, () => {
    expect(cronDirs.length).toBeGreaterThanOrEqual(45);
  });

  for (const dir of cronDirs) {
    describe(`Cron Route: /api/cron/${dir}`, () => {
      it('rejects unauthenticated GET with 401 (or 404 if gated)', async () => {
        const mod = await import(`@/app/api/cron/${dir}/route`);
        expect(mod.GET).toBeDefined();

        const req = new Request(`http://localhost:3010/api/cron/${dir}`);
        const res = await mod.GET(req);
        expect([401, 404]).toContain(res.status);
        if (res.status === 401) {
          const data = await res.json();
          expect(data.error).toBe('Unauthorized');
        }
      });

      it('rejects GET with incorrect bearer token with 401 (or 404 if gated)', async () => {
        const mod = await import(`@/app/api/cron/${dir}/route`);
        const req = new Request(`http://localhost:3010/api/cron/${dir}`, {
          headers: { authorization: 'Bearer attacker-fake-token' },
        });
        const res = await mod.GET(req);
        expect([401, 404]).toContain(res.status);
      });

      it('rejects POST with 401 when unauthenticated if POST is exported', async () => {
        const mod = await import(`@/app/api/cron/${dir}/route`);
        if (typeof mod.POST === 'function') {
          const req = new NextRequest(`http://localhost:3010/api/cron/${dir}`, {
            method: 'POST',
            headers: { authorization: 'Bearer wrong-secret' },
          });
          const res = await mod.POST(req);
          expect([401, 404]).toContain(res.status);
        }
      });
    });
  }
});
