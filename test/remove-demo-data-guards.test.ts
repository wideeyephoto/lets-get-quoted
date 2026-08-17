import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Line endings normalised on read: core.autocrlf is true in this repo, so a clean
// checkout on Windows puts CRLF on disk and a needle spanning lines would fail
// against a file whose contracts are all intact.
const SWEEP = readFileSync(join(process.cwd(), 'scripts/remove-demo-data.mjs'), 'utf8').replace(/\r\n/g, '\n');

// Matched with runs of whitespace collapsed, so reformatting the SQL does not
// fail the build. The first draft of this file asserted exact strings and flagged
// `in ('a', 'r')` -> `in ('a','r')` as a regression, which is the kind of false
// alarm that gets a test deleted rather than fixed.
// \s* rather than \s+, because the formatting change to guard against is a space
// being REMOVED -- `in ('a', 'r')` becoming `in ('a','r')` -- and \s+ cannot match
// zero characters, so it failed on exactly the case this helper exists for.
const loose = (sql: string) =>
  new RegExp(sql.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s*'));

// One flattened copy, used for BOTH containment and the ordering checks. The
// ordering checks originally ran indexOf against the raw source, which meant an
// extra space anywhere made a position come back -1 and failed the build for no
// reason -- the same brittleness `loose` exists to remove, one layer down.
const FLAT = SWEEP.replace(/\s+/g, ' ');
const contains = (sql: string) => expect(FLAT).toMatch(loose(sql));
const positionOf = (sql: string) => FLAT.search(loose(sql));

// Why this file exists. remove-demo-data.mjs deletes production rows, and its job
// match protects one specific thing that no other test could notice was gone:
// payment 6e2e7689 is a real live Stripe capture sitting on job J-1038, and
// J-1038 is itself marked demo. The protection is that a seeded job holding a
// payment with no test_marker is held back. Simplifying that to
// `test_marker is not null` is the natural-looking edit, it makes the script
// delete more demo data, every rehearsal still reports success -- and it cascades
// the only genuine payment on the platform out of the ledger.
//
// So these assert the guards' PRESENCE, not their behaviour. Behaviour is covered
// by --rehearse, which needs a database; a unit test cannot reach it. What a unit
// test can do is fail the build when a guard is removed. Each assertion below was
// mutation-tested: break the guard it names and this file goes red.
describe('remove-demo-data keeps the guards that protect real payments', () => {
  it('holds back a seeded job that carries a payment with no test_marker', () => {
    contains('exists (select 1 from payments p where p.job_id = j.id and p.test_marker is null)');
    // The carve-out has to be part of the match itself. A JOB_MATCH of just
    // `account_id = $1 and JOB_SEEDED` deletes J-1038 and the real payment on it.
    contains('and not ${JOB_HOLDS_REAL_PAYMENT}');
  });

  it('aborts before opening the transaction if an unmarked payment is in the delete set', () => {
    contains('and p.test_marker is null');
    contains('payment(s) with no test_marker are in the delete set');
    const abortAt = positionOf('payment(s) with no test_marker are in the delete set');
    const beginAt = positionOf("await client.query('begin')");
    expect(abortAt).toBeGreaterThan(0);
    expect(beginAt).toBeGreaterThan(0);
    expect(abortAt).toBeLessThan(beginAt);
  });

  it('preflights the blocking foreign keys before opening the transaction', () => {
    contains("con.confdeltype in ('a', 'r')");
    // RESTRICT and NO ACTION both, and both target tables.
    contains("tgt.relname in ('payments', 'jobs')");
    const preflightAt = positionOf('con.confdeltype in');
    const beginAt = positionOf("await client.query('begin')");
    expect(preflightAt).toBeGreaterThan(0);
    expect(preflightAt).toBeLessThan(beginAt);
  });

  it('keeps a demo client that a SURVIVING job or lead still points at', () => {
    // Referenced by a survivor, not by anything. The plain version reports zero
    // deletable clients in a dry run and then removes them under --apply, because
    // at report time the seeded jobs holding those references still exist.
    contains('exists (select 1 from jobs j where j.client_id = t.id and not (${JOB_MATCH}))');
    contains('and not ${CUSTOMER_STILL_REFERENCED}');
  });

  it('reads the SET NULL children of clients from the catalogue instead of listing them', () => {
    // clients.id has five SET NULL children, not two: jobs, leads,
    // recurring_plans, warranties, extra_stop_requests. A hand-written pair let
    // 23 recurring plans lose their customer silently, and the post-delete check
    // — written from the same hand-written pair — reported a clean run.
    contains("tgt.relname = 'clients' and pat.attname = 'id' and con.confdeltype = 'n'");
    contains('const CUSTOMER_STILL_REFERENCED = clientReferenceGuard(clientRefParents)');
    // A table this script does not delete from counts as a survivor if it holds
    // any row, so a sixth child added later holds clients back by default.
    contains('return `exists (select 1 from public.${child} x where x.${col} = t.id)`');
    // Vacuous guard means something is wrong with the catalogue read, not that
    // there is nothing to protect.
    contains('found no SET NULL children of clients');
  });

  it('post-checks every parent it guards, not a shorter list', () => {
    // A check covering fewer tables than the guard agrees with the guard by
    // construction and verifies nothing.
    contains('for (const parent of clientRefParents) baseline.set(parent.child, await withCustomer(parent))');
    contains('for (const parent of clientRefParents) {');
  });

  it('aborts on RESTRICT but only warns on NO ACTION', () => {
    // NO ACTION is checked no earlier than end-of-statement, and the one such key
    // here is DEFERRABLE INITIALLY DEFERRED, so a row the teardown itself removes
    // never violates it. Treating it as fatal refuses a run that would commit.
    contains("const fatal = hits.filter((h) => h.rule === 'RESTRICT')");
    contains('ABORT: these RESTRICT keys would raise 23503');
  });

  it('measures orphaning by identity rather than by counting nulls', () => {
    // A count of null client_ids falls as seeded jobs are deleted, so a run that
    // orphaned three survivors while deleting five already-customerless jobs
    // would show a negative delta and read as clean.
    contains('where x.id = any($1::uuid[]) and x.${col} is null');
    contains('ROLLED BACK: this run orphaned a survivor');
  });

  it('still refuses to default to an account', () => {
    contains('Never defaults to an account.');
    contains("const APPLY = process.argv.includes('--apply') || REHEARSE;");
  });
});
