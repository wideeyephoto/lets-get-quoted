import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { SELLABLE_TOP_UP_IDS, TOP_UPS_WITHHELD } from '@/lib/billing/catalog';
import { BYTES_PER_GB, METERED_STORAGE_BUCKETS } from '@/lib/billing/storage-usage';

/**
 * The storage meter: the table, the sweep, and the effective limit.
 *
 * Source assertions, not execution — there is no PostgreSQL in this suite, so
 * these catch shape and contract mistakes and cannot catch a statement that
 * parses and then fails at runtime. The three that matter most here are the
 * cross-checks that no single file could make on its own: that the metered
 * bucket list matches what the app actually writes, that the limit reads
 * purchased capacity, and that measuring storage did not quietly put the SKU on
 * sale.
 */

const ROOT = process.cwd();
const MIGRATIONS = join(ROOT, 'migrations');
const FILE = '20260819000000_workspace_storage_usage.sql';

function read(path: string): string {
  return readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
}

const sql = read(join(MIGRATIONS, FILE));

/** Executable SQL only. This file explains what it is not doing as much as what it is. */
function statementsOf(source: string): string {
  return source
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n');
}

const statements = statementsOf(sql);

describe('the storage usage migration', () => {
  it('is one exact timestamped, transactional migration', () => {
    expect(FILE).toMatch(/^\d{14}_[a-z0-9_]+\.sql$/);
    expect(sql).toContain('begin;');
    expect(sql.trimEnd().endsWith('commit;')).toBe(true);
  });

  it('can be applied twice', () => {
    expect(statements).toContain('create table if not exists public.workspace_storage_usage');
    // Every function is `create or replace`, which is re-appliable by definition.
    const bareCreates = statements.match(/^create function /gm) ?? [];
    expect(bareCreates).toEqual([]);
  });

  it('is owner-readable, unlike the purchased capacity ledger', () => {
    // The measurement is the workspace's own number and carries no price,
    // subscription, or receipt — so the owner may read it directly.
    expect(statements).toContain('alter table public.workspace_storage_usage enable row level security');
    expect(statements).toContain('create policy workspace_storage_usage_owner_read');
    expect(statements).toContain('using ((select public.is_owner(account_id)))');
    expect(statements).toContain('grant select on table public.workspace_storage_usage to authenticated');
  });

  it('grants execute on every function to service_role only', () => {
    const functions = [
      'public.workspace_storage_metered_buckets()',
      'public.reconcile_workspace_storage_usage_v1()',
      'public.workspace_storage_limit_bytes(uuid)',
      'public.workspace_storage_state_v1(uuid)',
    ];
    for (const fn of functions) {
      expect(statements).toContain(`revoke all on function ${fn}`);
      expect(statements).toContain(`grant execute on function ${fn} to service_role`);
      // These take an account id or read across every workspace. An execute
      // grant to authenticated would let one workspace read another's numbers.
      expect(statements).not.toContain(`grant execute on function ${fn} to authenticated`);
    }
  });
});

describe('the metered bucket list', () => {
  /**
   * Every bucket the app creates, read from the storage modules themselves.
   * A bucket that exists in the app and not in the meter is storage nobody is
   * ever charged or warned about — the exact omission this test exists to catch,
   * because it is invisible in every other way.
   */
  function bucketsDeclaredByTheApp(): string[] {
    const dir = join(ROOT, 'src', 'lib');
    const found = new Set<string>();
    for (const entry of readdirSync(dir)) {
      if (!entry.endsWith('.ts')) continue;
      const source = read(join(dir, entry));
      // Only modules that actually create a bucket, so a module merely naming
      // one in a comment or downloading from it is not mistaken for an owner.
      if (!source.includes('.storage.createBucket(')) continue;
      for (const match of source.matchAll(/const\s+[A-Z_]*BUCKET\s*=\s*'([^']+)'/g)) {
        found.add(match[1]);
      }
    }
    return [...found].sort();
  }

  it('matches the buckets the app creates', () => {
    expect(bucketsDeclaredByTheApp()).toEqual([...METERED_STORAGE_BUCKETS].sort());
  });

  it('matches the list the database sweeps', () => {
    const block = sql.match(/workspace_storage_metered_buckets\(\)[\s\S]*?select array\[([\s\S]*?)\]::text\[\]/);
    expect(block).not.toBeNull();
    const inSql = [...(block?.[1] ?? '').matchAll(/'([^']+)'/g)].map((match) => match[1]).sort();
    expect(inSql).toEqual([...METERED_STORAGE_BUCKETS].sort());
  });
});

describe('the sweep', () => {
  it('reads sizes from storage.objects rather than a ledger of our own', () => {
    expect(statements).toContain('from storage.objects o');
    expect(statements).toContain("o.metadata ->> 'size'");
    expect(statements).toContain('public.workspace_storage_metered_buckets()');
  });

  it('guards the uuid cast so one stray file cannot abort every workspace', () => {
    expect(statements).toContain("split_part(o.name, '/', 1))::uuid");
    expect(statements).toMatch(/o\.name ~\* '\^\[0-9a-f\]\{8\}-/);
  });

  it('joins accounts so an orphaned folder is skipped, not a failed sweep', () => {
    expect(statements).toContain('join public.accounts a on a.id = m.account_id');
  });

  it('zeroes a workspace whose objects are all gone', () => {
    // Without this a workspace that emptied its buckets would report the last
    // number it ever had, and would sit over its cap forever.
    expect(statements).toContain('set bytes_used = 0');
    expect(statements).toContain('where u.measured_at < pg_catalog.now()');
  });

  it('does not use pg_catalog-qualified grammar constructs', () => {
    // coalesce and nullif are grammar, not functions: pg_catalog.coalesce does
    // not exist and would fail at runtime rather than at parse time. The same
    // trap the purchased-capacity migration documents.
    expect(statements).not.toContain('pg_catalog.coalesce');
    expect(statements).not.toContain('pg_catalog.nullif');
    // pg_catalog.sum IS a real aggregate and is expected to stay qualified.
    expect(statements).toContain('pg_catalog.sum(');
  });
});

describe('the effective limit', () => {
  it('adds purchased capacity to the plan allowance', () => {
    expect(statements).toContain("public.workspace_purchased_capacity_units(p_account_id, 'storage_gb')");
  });

  it('never writes the purchased sum into feature_limits', () => {
    // The subscription projector recomputes that column wholesale from the plan
    // and refuses any projection whose limits differ from its own copy, so a
    // purchased GB written there is rejected on the way in and erased later.
    expect(statements).not.toMatch(/update\s+public\.workspace_entitlements/i);
    expect(statements).not.toContain('set feature_limits');
  });

  it('uses the same gigabyte the application does', () => {
    expect(BYTES_PER_GB).toBe(1_073_741_824);
    expect(statements).toContain('1073741824');
  });

  it('returns null rather than zero when there is no entitlement row', () => {
    // A missing entitlement is an unknown limit. Zero would mean "allowed
    // nothing" and would block every upload in an unprovisioned workspace.
    expect(sql).toContain('NULL, NOT ZERO');
    expect(statements).toMatch(/from public\.workspace_entitlements e\s*\n\s*where e\.account_id = p_account_id/);
  });

  it('always returns exactly one row from the state read', () => {
    expect(statements).toContain('left join public.workspace_storage_usage u on u.account_id = k.account_id');
  });
});

describe('what this migration deliberately does not do', () => {
  it('leaves storage_100gb withheld from sale', () => {
    // Measuring storage is the prerequisite for selling it, not the sale. The
    // SKU goes on sale when its live Price exists and the sweep has run — a
    // deliberate act, not a side effect of this migration.
    expect(TOP_UPS_WITHHELD).toHaveProperty('storage_100gb');
    expect(SELLABLE_TOP_UP_IDS).not.toContain('storage_100gb');
  });
});
