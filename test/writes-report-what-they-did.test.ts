import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * A write that matched nothing must not report success.
 *
 * THE FACT UNDERNEATH ALL OF THIS: a PostgREST UPDATE or DELETE that matches
 * zero rows returns NO ERROR. So `const { error } = await supabase.update(...)`
 * followed by `if (error) throw` proves only that the statement was accepted,
 * never that it changed anything. `.select()` is what makes the two
 * distinguishable.
 *
 * This was found while auditing the jobs surface for office access, and the
 * instinct was to file it as latent -- an office user hits it because RLS
 * refuses their rows silently. That reasoning was too generous. An owner reaches
 * the same zero-row match through a stale page, a double submit, a concurrent
 * edit, or a process that dies between two statements. The three below are the
 * ones where being wrong costs something.
 */
const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8').replace(/\r\n/g, '\n');

const stripComments = (source: string) => source
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .filter((line) => !/^\s*\/\//.test(line))
  .join('\n');

/** One exported function's body, signature to the next top-level export. */
function body(source: string, name: string): string {
  const at = source.indexOf(`export async function ${name}`);
  expect(at, `${name} not found`).toBeGreaterThan(-1);
  const next = source.indexOf('\nexport ', at + 1);
  return source.slice(at, next === -1 ? source.length : next);
}

describe('billing a change order twice is not one failed write away', () => {
  const CODE = stripComments(read('src/app/dashboard/jobs/[id]/change-order-actions.ts'));
  const action = body(CODE, 'requestChangeOrderPaymentAction');

  it('checks that the payment actually got linked', () => {
    // The duplicate guard is `if (order.paymentId) return` -- it reads the exact
    // column this write sets, and the payment row is created BEFORE it, so an
    // unchecked link is the difference between one bill and two.
    expect(action).toContain('.select(\'id\')');
    expect(action).toContain('maybeSingle()');
    expect(action).toMatch(/if \(linkError \|\| !linked\)/);
  });

  it('refuses to report success when the link did not land', () => {
    const failure = action.slice(action.indexOf('if (linkError || !linked)'));
    expect(failure).toContain('ok: false');
    // And says what exists, because the payment is real and somebody has to
    // reconcile it rather than click again.
    expect(failure).toMatch(/asked to pay twice/);
  });

  it('still reports success on the happy path', () => {
    expect(action).toContain('return { ok: true };');
  });

  it('guards the guard: the duplicate check still reads paymentId', () => {
    // If this ever stopped being the thing that prevents a second bill, the
    // assertions above would be protecting the wrong write.
    expect(action).toContain('if (order.paymentId)');
  });
});

describe('a warranty write says whether it changed anything', () => {
  const DATA = stripComments(read('src/lib/warranties-data.ts'));

  it('updateClaim does not call a zero-row match resolved', () => {
    // Its result is rendered by the claim panel as "resolved" or "declined".
    const fn = body(DATA, 'updateClaim');
    expect(fn).toContain('.select(\'id\').maybeSingle()');
    expect(fn).toMatch(/if \(!data\) return \{ ok: false/);
  });

  it('recordService only reports ok when the schedule actually moved', () => {
    // A service recorded against nothing leaves next_service_due where it was,
    // which is the quiet drift this file exists to prevent.
    const fn = body(DATA, 'recordService');
    expect(fn).toContain('data: updated');
    expect(fn).toContain('ok: !error && Boolean(updated)');
  });

  it('recordServiceAction stops discarding the result', () => {
    const fn = body(stripComments(read('src/app/dashboard/jobs/[id]/warranty-actions.ts')), 'recordServiceAction');
    expect(fn).toContain('const result = await recordService(');
    expect(fn).toMatch(/if \(!result\.ok\) throw/);
  });
});

describe('the pattern itself', () => {
  it('names the three sites fixed, so a fourth is a deliberate addition', () => {
    // Not a repo-wide ban: plenty of `if (error) throw` writes are fine, because
    // a zero-row match there is either impossible or harmless. These three were
    // picked because the failure costs money, lies to the operator, or silently
    // stops a reminder.
    const fixed = [
      ['src/app/dashboard/jobs/[id]/change-order-actions.ts', 'requestChangeOrderPaymentAction'],
      ['src/lib/warranties-data.ts', 'updateClaim'],
      ['src/lib/warranties-data.ts', 'recordService'],
    ] as const;
    for (const [file, name] of fixed) {
      expect(stripComments(read(file)), `${name} lost its row check`).toContain('maybeSingle()');
    }
  });
});
