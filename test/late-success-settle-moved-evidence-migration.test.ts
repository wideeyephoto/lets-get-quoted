import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * 20260818234500 adds an OUT column to settle_direct_checkout_late_success_task
 * so an `already_settled` replay can admit that live evidence has moved past
 * what the stored resolution covers.
 *
 * Adding an OUT column changes the return type, which CREATE OR REPLACE refuses
 * with 42P13. So unlike every other function patch in this repo, this one drops
 * and recreates -- and a drop-and-recreate can silently change who a SECURITY
 * DEFINER function runs as, what search_path it runs under, and who may execute
 * it. Those are what most of this file is about.
 */
const patch = readFileSync(join(
  process.cwd(),
  'migrations',
  '20260818234500_late_success_settle_reports_moved_evidence.sql',
), 'utf8');

const origin = readFileSync(join(
  process.cwd(),
  'migrations',
  '20260816213000_direct_checkout_late_success_operator_resolution.sql',
), 'utf8');

const GRANT_SIGNATURE = [
  'public.settle_direct_checkout_late_success_task(',
  '  uuid, uuid, uuid, text, text, text, text, uuid',
  ')',
].join('\n');

function occurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

// The migration patches pg_proc.prosrc, which is ONE function body -- not the
// migration file it came from. Scope every needle check the same way, or the
// test asks a question the migration never asks.
function settleBody(): string {
  const start = origin.indexOf('create function public.settle_direct_checkout_late_success_task(');
  expect(start).toBeGreaterThanOrEqual(0);
  const end = origin.indexOf('\n$$;', start);
  expect(end).toBeGreaterThan(start);
  return origin.slice(start, end);
}

describe('the patch targets text that actually exists', () => {
  // The real failure mode for a patch-by-text migration is not a bad patch, it
  // is a good patch aimed at a string the source no longer contains. The
  // migration asserts exactly-once at runtime and raises 55000, but that is a
  // production failure. Catch it here instead.
  it.each([
    ['the replay return', '      v_resolution.paid_operation_pk;'],
    ['the applied return', "    'settled'::text, p_payment_id, p_task_id, v_paid.id;"],
  ])('finds %s exactly once inside the function being patched', (_label, needle) => {
    expect(occurrences(patch, needle)).toBeGreaterThanOrEqual(1);
    expect(occurrences(settleBody(), needle)).toBe(1);
  });

  it('does not widen that check to the whole migration file', () => {
    // record_direct_checkout_late_success_manual_disposition, further down the
    // same file, ends with a byte-identical line. File-wide uniqueness would
    // fail here and tempt someone into loosening the assertion to
    // greaterThanOrEqual, which would stop catching drift entirely. The needle
    // is unique where it has to be, and prosrc never sees the other one.
    expect(occurrences(origin, '      v_resolution.paid_operation_pk;')).toBe(2);
  });

  it('has not already been applied to the source it patches', () => {
    // If someone hand-edits 20260816213000 to add the column, this migration
    // becomes a no-op that still claims to have done the work.
    expect(origin).not.toContain('evidence_moved');
  });
});

describe('the drop-and-recreate cannot quietly change how the function runs', () => {
  it('refuses to proceed if the recreate would change the owner', () => {
    // SECURITY DEFINER runs as the owner. A recreate under a different role
    // changes who it runs as, silently, with no error anywhere.
    expect(patch).toContain('v_owner is distinct from current_user');
    expect(patch).toContain('late-success settle owner would change on recreate');
  });

  it('refuses to proceed if the recreate would change search_path or timezone', () => {
    // Checked by PROPERTY, not by a literal array. The literal this used to
    // assert -- array['search_path=', 'timezone=UTC'] -- was written from the
    // DDL text, and PostgreSQL stores the normalised form instead:
    // search_path="" with quotes, and the GUC canonicalised to TimeZone. It
    // matched nothing on any engine, so the migration could never run, and this
    // test passed the whole time because it asserted the same wrong string.
    expect(patch).toContain("pg_catalog.array_length(v_config, 1) is distinct from 2");
    expect(patch).toContain("'search_path=\"\"', 'search_path='");
    expect(patch).toContain("= 'timezone=utc'");
    expect(patch).toContain('late-success settle config would change on recreate');
  });

  it('does not compare the config against the DDL spelling', () => {
    // The specific regression: an expectation built from what the CREATE says
    // rather than from what pg_proc.proconfig holds. Verified against a real
    // PostgreSQL 17 by scripts/verify-late-success-proconfig.mjs.
    //
    // Executable SQL only — the file's comment quotes the broken array to
    // explain it, and asserting over the prose fails on the explanation.
    const statements = patch
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('--'))
      .join('\n');
    expect(statements).not.toContain("array['search_path=', 'timezone=UTC']");
  });

  it('names the offending value when it refuses', () => {
    // The original raised a bare sentence. Diagnosing it needed a separate
    // read-only round trip to production to discover what the value actually was.
    expect(patch).toMatch(/config would change on recreate: %', v_config/);
  });

  it('restates the settings on the recreated function', () => {
    expect(patch).toContain("set search_path = ''");
    expect(patch).toContain("set timezone to 'UTC'");
    expect(patch).toContain('security definer');
  });

  it('re-checks all of them afterwards rather than trusting the DDL', () => {
    expect(patch).toContain('p.prosecdef');
    expect(patch).toContain('p.proretset');
    expect(patch).toContain("p.provolatile = 'v'");
    expect(patch).toContain('late-success settle recreate changed how the function runs');
  });
});

describe('the grants survive the drop', () => {
  it('re-revokes and re-grants around the recreate', () => {
    expect(patch).toContain('from public, anon, authenticated, service_role;');
    expect(patch).toContain(`grant execute on function ${GRANT_SIGNATURE} to service_role;`);
  });

  it('proves the outcome instead of assuming the grant worked', () => {
    expect(patch).toContain("has_function_privilege('service_role', v_oid, 'EXECUTE')");
    expect(patch).toContain('late-success settle is not executable by service_role');
  });

  it('proves no untrusted role picked up execute along the way', () => {
    // A dropped function takes its ACL with it. If the recreate landed in a
    // database where PUBLIC has a default execute grant, service_role being
    // correct would not be the whole story.
    expect(patch).toContain("has_function_privilege('anon', v_oid, 'EXECUTE')");
    expect(patch).toContain("has_function_privilege('authenticated', v_oid, 'EXECUTE')");
    expect(patch).toContain('late-success settle became executable by an untrusted role');
  });
});

describe('the body is carried across, not retyped', () => {
  it('takes the body from prosrc and requotes it', () => {
    expect(patch).toContain('p.prosrc');
    expect(patch).toContain('pg_catalog.quote_literal(v_new_body)');
  });

  it('normalises CRLF on the body and on every needle', () => {
    // Production has held a mix, and exact-match patching has already failed
    // here once -- 20260817120000 exists solely because of it.
    const normalisations = occurrences(
      patch,
      'pg_catalog.chr(13) || pg_catalog.chr(10), pg_catalog.chr(10)',
    );
    expect(normalisations).toBe(5);
  });

  it('asserts each needle matched exactly once before rewriting', () => {
    expect(patch).toContain('late-success settle replay return drifted');
    expect(patch).toContain('late-success settle applied return drifted');
    expect(occurrences(patch, "using errcode = '55000'")).toBeGreaterThanOrEqual(4);
  });

  it('short-circuits if the column is already there', () => {
    expect(patch).toContain("pg_get_function_result(v_oid), 'evidence_moved') > 0");
    expect(patch).toContain('return;');
  });

  it('re-checks that the guards inside the body survived', () => {
    for (const guard of [
      'late-success settle replay conflicts with durable outcome',
      'late-success settle evidence changed after planning',
      'late-success settlement actor identity is not a live Auth user',
      'payment already has a different late-success settlement resolution',
      'late-success settlement task was not atomically enqueued',
    ]) {
      expect(patch).toContain(guard);
    }
    expect(patch).toContain('late-success settle lost its session mutex');
  });
});

describe('the reported value is derived, never assumed', () => {
  it('compares the freshly computed fingerprints, not the stored ones', () => {
    // The whole defect was that the stored and caller fingerprints agree with
    // each other while both describe a past that has moved on. Comparing them
    // again here would reproduce the bug and report false forever.
    expect(patch).toContain('v_expected_task_set is distinct from p_task_set_sha256');
    expect(patch).toContain('v_expected_evidence is distinct from p_evidence_sha256');
    expect(patch).not.toContain('v_resolution.task_set_sha256 is distinct from');
  });

  it('reports false on the applied path, where the check already ran', () => {
    // Reaching the applied return means the 40001 comparison passed, so false
    // is provable there rather than optimistic.
    expect(patch).toContain('p_task_id, v_paid.id, false;');
  });

  it('adds the column to the return type', () => {
    expect(patch).toContain('  evidence_moved boolean\n)');
    expect(patch).toContain("strpos(v_result, 'evidence_moved boolean') = 0");
  });
});
