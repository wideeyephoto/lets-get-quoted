/**
 * Escaping for values interpolated into a PostgREST filter string.
 *
 * `.or()` does not take parameters. Its argument is a filter EXPRESSION that
 * PostgREST parses — `name.ilike.%foo%,phone.ilike.%foo%` is three tokens and
 * two conditions, and the commas and dots are the grammar, not data. A search
 * term carrying one of those characters is read as more grammar:
 *
 *     term = "a,status.eq.won"
 *     .or(`name.ilike.%${term}%`)  ->  name.ilike.%a , status.eq.won%
 *
 * which is a second condition the caller never wrote.
 *
 * This is NOT the tenant boundary and never was: every call site pairs its
 * `.or()` with a separate `.eq('account_id', …)`, and PostgREST ANDs the two,
 * so an injected condition can only ever widen a result set inside the caller's
 * own workspace. What it can do is match on columns the caller did not intend
 * to expose, and produce parse errors on input a user could reasonably type —
 * an apostrophe in a client's name, a comma in an address.
 *
 * The fix is to escape rather than strip, so a legitimate search for "Smith,
 * John" still finds the row.
 *
 * PostgREST's own quoting rule: wrap the value in double quotes and backslash
 * any double quote or backslash inside it. A quoted value is one token however
 * many commas, dots or parentheses it contains.
 */

/**
 * Escapes a value for use inside a PostgREST filter expression.
 *
 * Returns the value already wrapped in double quotes, so call sites interpolate
 * it bare — `name.ilike.${filterValue(`%${term}%`)}` — rather than adding their
 * own quoting on top.
 */
export function filterValue(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/**
 * Builds an `ilike` OR-group across several columns for one search term.
 *
 * The common shape at every call site, in one place so the escaping cannot be
 * forgotten at the next one.
 *
 *     ilikeAcross(['name', 'phone'], term)
 *     -> 'name.ilike."%term%",phone.ilike."%term%"'
 */
export function ilikeAcross(columns: readonly string[], term: string): string {
  const needle = filterValue(`%${term}%`);
  return columns.map((column) => `${column}.ilike.${needle}`).join(',');
}
