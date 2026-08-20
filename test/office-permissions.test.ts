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
