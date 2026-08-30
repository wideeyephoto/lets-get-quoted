import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { stripComments } from './helpers/source-text';

/**
 * Neither delete path could succeed, and one of them said it had.
 *
 * Twenty-four tables hold a RESTRICT foreign key to `accounts` — `payments`
 * among them — so ANY workspace that has ever taken a customer payment is
 * undeletable, not only subscribers. Three of the six production workspaces
 * already have payments.
 *
 *  - The SELF-SERVE path cancelled Stripe first and then hit that wall. The
 *    contractor's plan was really gone, mid-period and unrefunded; they still
 *    had the account; and per the cancellation finding they could not
 *    resubscribe. Every retry repeated it.
 *
 *  - The ADMIN path scrubbed the privacy request, wrote an `account_delete`
 *    audit line, then fired the delete WITHOUT DESTRUCTURING ITS ERROR and
 *    redirected `deleted=1`. A GDPR erasure reported as done, the audit log
 *    agreeing, the free-text record of what the customer asked destroyed, and
 *    every row of their personal data still present.
 */

// Prose stripped: a comment quoting the OLD behaviour reads exactly like the
// old behaviour, and an ordering assertion here matched a comment saying the
// delete used to redirect deleted=1.
const read = (...p: string[]) => stripComments(readFileSync(join(process.cwd(), ...p), 'utf8'));
const settings = read('src', 'app', 'dashboard', 'settings', 'actions.ts');
const adminActions = read('src', 'app', 'admin', 'accounts', '[id]', 'actions.ts');
const adminPage = read('src', 'app', 'admin', 'accounts', '[id]', 'page.tsx');

/** The body of a named exported action, up to the next export. */
function actionBody(source: string, name: string): string {
  const start = source.indexOf(`export async function ${name}`);
  if (start === -1) throw new Error(`${name} not found`);
  const next = source.indexOf('\nexport ', start + 1);
  return source.slice(start, next === -1 ? undefined : next);
}

describe('the self-serve delete', () => {
  const body = actionBody(settings, 'deleteAccountAction');

  it('cancels subscription and processes durable closure job', () => {
    expect(body).toContain('cancelSubscriptionForAccountDeletion');
    expect(body).toContain('requestAccountClosure');
    expect(body).toContain('processClosureJob');
  });

  it('handles closure failures gracefully without redirecting to closed', () => {
    expect(body).toContain('if (!result.success)');
    expect(body).toContain("throw new Error(`Account closure failed:");
  });
});

describe('the admin hard delete', () => {
  const body = actionBody(adminActions, 'deleteAccountAction');

  it('destructures the delete error at all', () => {
    // The whole bug: `await admin.from('accounts').delete()...` with no error read.
    expect(body).toMatch(/const \{ error: deleteError \} = await admin\s*\n?\s*\.?from\('accounts'\)\.delete\(\)/);
  });

  it('does not report success when the delete failed', () => {
    const deleteAt = body.indexOf('deleteError');
    const redirectAt = body.indexOf("deleted=1");
    expect(deleteAt).toBeGreaterThan(-1);
    expect(deleteAt).toBeLessThan(redirectAt);
    expect(body).toMatch(/backTo\(accountId, deleteError\.code === '23503'/);
  });

  it('scrubs the privacy request only AFTER a confirmed delete', () => {
    // Destroying the customer's own words while leaving their data is the worst
    // possible ordering, and it was the shipped one.
    const deleteAt = body.indexOf("from('accounts').delete()");
    const scrubAt = body.indexOf("from('privacy_requests')");
    expect(scrubAt, 'no privacy scrub found').toBeGreaterThan(-1);
    expect(deleteAt, 'privacy request is still scrubbed before the delete').toBeLessThan(scrubAt);
  });

  it('writes the account_delete audit line only after a confirmed delete', () => {
    const deleteAt = body.indexOf("from('accounts').delete()");
    const logAt = body.indexOf("action: 'account_delete'");
    expect(logAt).toBeGreaterThan(-1);
    expect(deleteAt).toBeLessThan(logAt);
  });

  it('has copy for both refusal shapes, so the banner is not "Something went wrong"', () => {
    expect(adminPage).toContain('delete_blocked:');
    expect(adminPage).toContain('delete_failed:');
    expect(adminPage).toMatch(/NOTHING was deleted/);
  });
});
