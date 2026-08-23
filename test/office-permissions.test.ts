import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  OFFICE_CAPABILITIES,
  OFFICE_CAPABILITIES_REQUIRING_DELIBERATION,
  OFFICE_CAPABILITY_KEYS,
  officeCapabilitiesByBand,
} from '@/lib/office-permissions';

const migration = () => readFileSync(
  join(process.cwd(), 'migrations', '20260819220000_office_capabilities.sql'), 'utf8');

/** The migration that makes the decision the one above deliberately refused to. */
const grantMigration = () => readFileSync(
  join(process.cwd(), 'migrations', '20260820220000_office_capabilities_v1_grant.sql'), 'utf8');

/**
 * The thirteen the v1 grant turns on, read out of the migration's own
 * post-condition rather than its UPDATE.
 *
 * The post-condition is the stricter of the two: the UPDATE's `in (...)` list
 * would still pass if it named a capability that does not exist, whereas
 * `v_expected` is compared against the whole enabled set with `is distinct
 * from`, so it cannot be a subset or a superset of what actually ends up on.
 */
function grantedKeys(): string[] {
  const sql = grantMigration();
  const start = sql.indexOf('v_expected text[] := array[');
  const end = sql.indexOf('];', start);
  return [...sql.slice(start, end).matchAll(/'([a-z_.]+)'/g)].map((m) => m[1]).sort();
}

/** The capability keys the migration actually seeds. */
function seededKeys(): string[] {
  const sql = migration();
  const start = sql.indexOf('insert into public.office_capabilities');
  const end = sql.indexOf('on conflict', start);
  return [...sql.slice(start, end).matchAll(/\('([a-z_.]+)',/g)].map((m) => m[1]);
}

describe('the catalog exists twice and must not drift', () => {
  it('seeds exactly the capabilities the code names', () => {
    // SQL cannot import TypeScript, so the list is written twice and this
    // assertion is the only thing keeping them the same. A capability in one and
    // not the other is a switch that either cannot be rendered or cannot be
    // granted, and neither fails anywhere else.
    expect(seededKeys().sort()).toEqual([...OFFICE_CAPABILITY_KEYS].sort());
  });

  it('agrees about which band each one is in', () => {
    const sql = migration();
    for (const capability of OFFICE_CAPABILITIES) {
      expect(sql, `${capability.key} band`).toContain(`('${capability.key}', '${capability.band}'`);
    }
  });

  it('has no duplicates in either', () => {
    expect(new Set(OFFICE_CAPABILITY_KEYS).size).toBe(OFFICE_CAPABILITY_KEYS.length);
    const seeded = seededKeys();
    expect(new Set(seeded).size).toBe(seeded.length);
  });
});

describe('what the switches ship as', () => {
  it('ships every one off', () => {
    // Proven against a real PostgreSQL 17 by verify-office-seat-collision.mjs.
    // Here: the INSERT must not name `enabled` at all, so there is nothing to
    // set it to.
    const sql = migration();
    const start = sql.indexOf('insert into public.office_capabilities');
    const end = sql.indexOf('on conflict', start);
    expect(sql.slice(start, end)).not.toContain('enabled');
    expect(sql).toContain('enabled boolean not null default false');
  });

  it('never rewrites `enabled` on a re-run', () => {
    // The conflict clause updates the description and the band, deliberately not
    // the switch: re-running must not undo a decision somebody made.
    const sql = migration();
    // The SET clause only. Slicing to the next statement swept up the comment
    // underneath it, which explains the rule by naming the column -- and an
    // assertion that forbids the word forbids the explanation.
    const from = sql.indexOf('on conflict');
    const clause = sql.slice(from, sql.indexOf(';', from));
    expect(clause).toContain('band = excluded.band');
    expect(clause).not.toContain('enabled');
  });

  it('is wired to nothing', () => {
    // The whole migration adds a mechanism. If a policy referenced it, this
    // would be changing behaviour instead.
    expect(migration()).toContain('this migration must ship inert');
  });
});

describe('the v1 grant: which thirteen, and why the other twelve wait', () => {
  it('turns on exactly the office-manager job and nothing adjacent to it', () => {
    // Pinned as a literal rather than derived from the bands, because the set is
    // deliberately not a band boundary: crew.read is banded with the payroll
    // switches, and enabling `people` wholesale would have taken pay rates too.
    expect(grantedKeys()).toEqual([
      'clients.read', 'clients.write', 'crew.read', 'invoices.read',
      'jobs.read', 'jobs.write', 'leads.read', 'leads.write',
      'messages.read', 'messages.send', 'payments.read', 'quotes.read',
      'schedule.write',
    ]);
  });

  it('grants nothing that moves money, exposes pay, or controls the account', () => {
    // The independent restatement. The list above could be edited; this asks the
    // separate question -- is anything requiring deliberation now on -- and the
    // migration asks it of the database too, in a loop over the same six.
    for (const key of OFFICE_CAPABILITIES_REQUIRING_DELIBERATION) {
      expect(grantedKeys(), key).not.toContain(key);
    }
    // And the three that are not on that list but still change money or the
    // business's public face.
    for (const key of ['quotes.write', 'invoices.write', 'settings.write']) {
      expect(grantedKeys(), key).not.toContain(key);
    }
  });

  it('only names capabilities that exist', () => {
    // A typo would update zero rows, change nothing, and pass any check that
    // counts what is enabled rather than checking what was asked for.
    for (const key of grantedKeys()) {
      expect(OFFICE_CAPABILITY_KEYS, key).toContain(key);
    }
  });

  it('stays inert, so the decision lands before the tenant boundary is touched', () => {
    // Enabling a switch no policy reads changes nothing for anybody. That is
    // what makes it safe to agree the list first and rewrite ~54 for-all
    // policies second, rather than inventing the list while rewriting them.
    expect(grantMigration()).toContain('this migration is a decision, not a behaviour change');
  });

  it('says why each withheld capability is withheld', () => {
    // A capability that is off for no recorded reason gets switched on by the
    // next person who needs it, and the reason it was off is discovered
    // afterwards. Every one of the twelve is named in the header with its cost.
    const sql = grantMigration();
    const off = OFFICE_CAPABILITY_KEYS.filter((key) => !grantedKeys().includes(key));
    expect(off).toHaveLength(12);
    for (const key of off) {
      expect(sql, key).toContain(key);
    }
  });
});

describe('the shape of the decision a contractor is being asked to make', () => {
  it('sorts into bands, least consequential first', () => {
    const bands = officeCapabilitiesByBand();
    expect(bands.map((b) => b.band)).toEqual([
      'work', 'money_visible', 'money_moving', 'people', 'account',
    ]);
    // Every capability lands in exactly one band, or the list a contractor is
    // shown is not the list that exists.
    expect(bands.flatMap((b) => b.capabilities)).toHaveLength(OFFICE_CAPABILITIES.length);
  });

  it('says what each one exposes, in terms of what the person could then do', () => {
    for (const capability of OFFICE_CAPABILITIES) {
      // A label alone ("See payments") does not tell a contractor that it also
      // reveals the fee on every transaction.
      expect(capability.grants.length, capability.key).toBeGreaterThan(30);
      expect(capability.grants.trim().endsWith('.'), capability.key).toBe(true);
      expect(capability.grants, capability.key).not.toBe(capability.label);
    }
  });

  it('separates seeing money from moving it', () => {
    const byKey = new Map(OFFICE_CAPABILITIES.map((c) => [c.key, c]));
    expect(byKey.get('payments.read')?.band).toBe('money_visible');
    expect(byKey.get('payments.collect')?.band).toBe('money_moving');
    expect(byKey.get('payments.refund')?.band).toBe('money_moving');
    // Reading an invoice and writing one are not the same decision either.
    expect(byKey.get('invoices.read')?.band).not.toBe(byKey.get('invoices.write')?.band);
  });

  it('puts what people earn in its own band, apart from customer money', () => {
    // A bookkeeper who needs invoices very often must not see crew pay rates.
    // Filing those together would make that impossible to express.
    const byKey = new Map(OFFICE_CAPABILITIES.map((c) => [c.key, c]));
    expect(byKey.get('crew_pay.read')?.band).toBe('people');
    expect(byKey.get('crew_pay.read')?.grants).toMatch(/every person/i);
  });

  it('names the ones that must never be defaulted on', () => {
    for (const key of OFFICE_CAPABILITIES_REQUIRING_DELIBERATION) {
      const capability = OFFICE_CAPABILITIES.find((c) => c.key === key);
      expect(capability, `${key} is named but does not exist`).toBeTruthy();
      // Each moves money, exposes what individuals earn, or can end the account.
      expect(['money_moving', 'people', 'account']).toContain(capability!.band);
    }
    expect(OFFICE_CAPABILITIES_REQUIRING_DELIBERATION).toContain('billing.manage');
    expect(OFFICE_CAPABILITIES_REQUIRING_DELIBERATION).toContain('payments.refund');
  });
});

describe('the activation guide matches the database it describes', () => {
  const guide = () => readFileSync(
    join(process.cwd(), 'docs', 'office-capability-activation.md'), 'utf8');

  it('counts the for-all policies that actually exist', () => {
    // The guide's whole argument rests on this number: 44 policies each cover
    // select, insert, update and delete together, so a capability named "read"
    // cannot be wired to one without granting writes. A stale count would make
    // the argument look like an estimate.
    const schema = readFileSync(join(process.cwd(), 'schema.sql'), 'utf8');
    const forAll = [...schema.matchAll(
      /create policy \S+\s+on \S+\s+for all\s+using \(\s*is_owner/gi)].length;
    expect(guide()).toContain(`**${forAll} such policies**`);
  });

  it('warns that a split without `with check` is silently wrong later', () => {
    // `using` defaults into `with check`, so omitting it changes nothing today
    // and permits unintended writes the moment the two predicates differ.
    expect(guide()).toContain('with check');
    expect(guide()).toMatch(/defaulted from it/);
  });

  it('orders the bands the way the catalog does', () => {
    const text = guide();
    const positions = ['work', 'money_visible', 'money_moving', 'people', 'account']
      .map((band) => text.indexOf(`**\`${band}\`**`));
    expect(positions.every((p) => p > 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it('names every capability band that exists', () => {
    const text = guide();
    for (const band of ['work', 'money_visible', 'money_moving', 'people', 'account']) {
      expect(text, band).toContain(band);
    }
  });
});

describe('step one of the wiring: the split that grants nothing', () => {
  const split = () => readFileSync(
    join(process.cwd(), 'migrations', '20260820230000_split_core_work_policies.sql'), 'utf8');

  it('drops the combined for-all policy on each of the three tables', () => {
    // Leaving it behind would make the split cosmetic: one predicate would keep
    // granting everything, and the next migration's narrowing would do nothing
    // while appearing to have been applied.
    const sql = split();
    for (const policy of ['lead_all', 'clients_all', 'job_owner']) {
      expect(sql, policy).toContain(`drop policy if exists ${policy} on public.`);
    }
  });

  it('creates a select-only read policy, not another for-all', () => {
    // A read policy created `for all` would grant exactly the writes this
    // migration exists to separate out -- and would look right in a diff.
    const sql = split();
    for (const policy of ['lead_owner_read', 'clients_owner_read', 'job_owner_read']) {
      const from = sql.indexOf(`create policy ${policy}`);
      expect(from, policy).toBeGreaterThan(-1);
      const statement = sql.slice(from, sql.indexOf(';', from));
      expect(statement, policy).toContain('for select');
      expect(statement, policy).not.toContain('for all');
    }
  });

  it('writes `with check` out explicitly on every write policy', () => {
    // A `for all` policy given only `using` inherits `with check` from it. That
    // inheritance is invisible in the catalog and silently wrong the moment the
    // two predicates differ, which is exactly what the next migration does to
    // one side. The migration asserts polwithcheck is non-null for this reason.
    const sql = split();
    for (const policy of ['lead_owner_write', 'clients_owner_write', 'job_owner_write']) {
      const from = sql.indexOf(`create policy ${policy}`);
      expect(from, policy).toBeGreaterThan(-1);
      const clause = sql.slice(from, sql.indexOf(';', from));
      expect(clause, policy).toContain('using (public.is_owner(account_id))');
      expect(clause, policy).toContain('with check (public.is_owner(account_id))');
    }
    expect(sql).toContain('it would be inherited and invisible');
  });

  it('still tests is_owner everywhere, so behaviour is unchanged', () => {
    // The whole claim of this migration is "nothing moved". An office_can in a
    // CREATE POLICY would make that false and merge two steps whose failures
    // could then not be told apart.
    //
    // Checked per statement rather than across the file: the post-condition
    // legitimately mentions office_can, to assert that nothing else does, and a
    // whole-file search cannot tell the guard apart from the thing it guards.
    // Comment lines are stripped first: the header quotes the old combined
    // policy as the thing being replaced, and counting that as a seventh
    // statement would make the count assertion below meaningless.
    const sql = split().split('\n').filter((line) => !line.trim().startsWith('--')).join('\n');
    const statements = sql.split('create policy').slice(1)
      .map((chunk) => chunk.slice(0, chunk.indexOf(';')));
    // Two per table, three tables. A seventh would mean a policy nobody
    // described; a fifth would mean a table was left combined.
    expect(statements).toHaveLength(6);
    for (const statement of statements) {
      expect(statement).toContain('is_owner(account_id)');
      expect(statement).not.toContain('office_can');
    }
    expect(sql).toContain('it must only split');
  });

  it('keeps the crew reading their own jobs', () => {
    // job_crew_read is a different audience on the same table. Dropping it while
    // refactoring the owner's policy is an easy accident and a silent one: the
    // crew app would simply show an empty list.
    expect(split()).toContain('job_crew_read');
    expect(split()).toContain('the crew can no longer read their jobs');
  });

  it('refuses to leave row-level security disabled', () => {
    // Dropping the last policy on an RLS-enabled table denies everyone, and
    // disabling RLS to "fix" that opens the table to every tenant. The migration
    // must not be able to exit in either state.
    expect(split()).toContain('row-level security is disabled on one of the split tables');
  });
});
