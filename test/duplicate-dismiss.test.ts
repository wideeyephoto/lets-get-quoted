import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { duplicateMemberKey, findDuplicateGroups } from '@/lib/client-duplicates';

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8').split('\r\n').join('\n');
const FORM = read('src', 'app', 'dashboard', 'clients', 'DuplicateGroupForm.tsx');
const ACTIONS = read('src', 'app', 'dashboard', 'clients', 'actions.ts');
const PAGE = read('src', 'app', 'dashboard', 'clients', 'page.tsx');
const DATA = read('src', 'lib', 'client-duplicates-data.ts');
const MIGRATION = read('migrations', '2026-08-16-duplicate-dismissals.sql');

const client = (id: string, over: Partial<{ name: string; phone: string | null; email: string | null; address: string | null }> = {}) => ({
  id,
  name: 'Dana Whitfield',
  phone: '2485550117',
  email: null,
  address: null,
  ...over,
});

/**
 * A SUGGESTION YOU CANNOT DECLINE IS NOT A SUGGESTION.
 *
 * findDuplicateGroups proposes and a person decides — but the panel only ever
 * offered one of the two answers. A landlord and their tenant on one phone
 * number, a father and son at one address, two crews of a franchise sharing an
 * office line: all real, all correctly grouped, all back at the top of the
 * customer book on every load, for ever. The panel gets collapsed and never
 * opened again, and the real duplicates go unfound with it.
 */
describe('turning down a duplicate suggestion', () => {
  it('is keyed on the members, not on what they share', () => {
    // group.key is "phone:+12485550117", which survives the membership changing
    // underneath it.
    const [group] = findDuplicateGroups([client('a'), client('b')]);
    expect(group.key).toContain('phone:');
    expect(duplicateMemberKey(group.members)).toBe('a:b');
  });

  /**
   * THE CASE THE OTHER KEY WOULD HAVE HIDDEN. Two people sharing a number is
   * ordinary. A THIRD record on that number is the one worth looking at, and
   * keying the dismissal on the shared value would have swallowed it silently.
   */
  it('comes back when a third record joins the group', () => {
    const two = duplicateMemberKey(findDuplicateGroups([client('a'), client('b')])[0].members);
    const three = duplicateMemberKey(findDuplicateGroups([client('a'), client('b'), client('c')])[0].members);
    expect(three).not.toBe(two);
  });

  it('does not depend on the order the finder happened to produce', () => {
    expect(duplicateMemberKey([{ id: 'c' }, { id: 'a' }, { id: 'b' }])).toBe('a:b:c');
    expect(duplicateMemberKey([{ id: 'a' }, { id: 'b' }, { id: 'c' }])).toBe('a:b:c');
  });

  it('filters at the page, leaving the finder pure', () => {
    expect(PAGE).toContain('.filter((group) => !dismissed.has(duplicateMemberKey(group.members)))');
    expect(read('src', 'lib', 'client-duplicates.ts')).not.toContain('supabase');
  });

  /** Nothing is deleted or archived: both records stay exactly as they are. */
  it('writes one row and touches neither customer', () => {
    const fn = ACTIONS.slice(ACTIONS.indexOf('export async function dismissDuplicateGroupAction'));
    expect(fn).toContain(".from('client_duplicate_dismissals')");
    expect(fn).not.toContain(".from('clients')");
    expect(fn).not.toContain('.delete()');
  });

  /**
   * It ships ahead of its migration. The READ degrades to "nothing dismissed",
   * because a customer book that will not render over a missing suggestions
   * table is a far worse outcome than a suggestion reappearing. The WRITE says
   * so out loud — a dismiss button that appears to work and leaves the group
   * there tomorrow is the failure worth naming.
   */
  it('degrades on read and speaks up on write', () => {
    expect(DATA).toContain('if (error || !data) return new Set();');
    // On the page, not thrown: a server action that throws reaches production
    // as a blank boundary with the message redacted.
    expect(ACTIONS).toContain("redirect(error ? '/dashboard/clients?dismissError=schema'");
    expect(read('src', 'app', 'dashboard', 'clients', 'DuplicateClients.tsx'))
      .toContain('migrations/2026-08-16-duplicate-dismissals.sql');
    expect(read('src', 'app', 'dashboard', 'clients', 'DuplicateClients.tsx'))
      .toContain('Both records are untouched.');
    expect(MIGRATION).toContain('create table if not exists client_duplicate_dismissals');
    expect(MIGRATION).toContain('unique (account_id, member_key)');
    // Owner-scoped like every other account table.
    expect(MIGRATION).toContain('using (is_owner(account_id))');
  });
});

/**
 * Two submits over one set of fields. They cannot be two forms — the ids the
 * dismiss needs are these hidden inputs, and nesting forms is invalid HTML: the
 * browser drops the inner one and posts a merge with no survivor.
 */
describe('the second button in the merge form', () => {
  it('carries its own action and skips the merge confirm', () => {
    expect(FORM).toContain('formAction={dismissAction}');
    expect(FORM).toContain("if (submitter?.value === 'dismiss') return;");
  });

  /** The survivor radio is `required`, and this button has no interest in
   *  which record would have survived. */
  it('is not blocked by a field it does not use', () => {
    expect(FORM).toContain('formNoValidate');
    expect(read('src', 'components', 'save-button.tsx')).toContain('formNoValidate={formNoValidate}');
  });

  it('says what it does, which is nothing to either record', () => {
    expect(FORM).toContain('Not duplicates');
    expect(FORM).toContain('Keeps both records exactly as they are');
  });

  /** Withheld on the demo, like the merge, where nothing may write. */
  it('is absent where nothing may write', () => {
    expect(read('src', 'app', 'dashboard', 'clients', 'ClientsScreen.tsx'))
      .toContain('dismissAction={readOnly ? undefined : dismissDuplicateAction}');
  });
});
