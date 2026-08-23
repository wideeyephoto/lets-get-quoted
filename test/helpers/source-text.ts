/**
 * Source with the prose removed, for tests that assert on source text.
 *
 * WHY THIS IS SHARED NOW. Three separate tests in this repo have failed against
 * their own explanatory comments — the ones quoting a removed claim in order to
 * explain why it was removed. A comment ABOUT a string is indistinguishable from
 * the string:
 *
 *   - customer-money-is-exact.test.ts hit it first and wrote the original fix.
 *   - pricing-copy-matches-what-ships.test.ts hit it on 2026-08-23 and copied it.
 *   - account-deletion-tells-the-truth.test.ts hit it an hour later, where a
 *     comment saying the old code redirected `deleted=1` made an ordering
 *     assertion compare against the comment instead of the redirect.
 *
 * Copying it a fourth time is how it drifts, so it lives here.
 *
 * BLOCK COMMENTS GO WHOLE. A per-line filter keyed on a leading star leaves every
 * continuation line of a JSDoc block behind — and those lines are exactly where
 * the prose discusses the thing it is explaining the absence of. JSX comments
 * are `{/* … *\/}`, so stripping the block form covers them too.
 */
export function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');
}
