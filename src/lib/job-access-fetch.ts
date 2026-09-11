/**
 * Session clients use the RLS-backed job_access view for both reads and writes.
 * The base jobs table intentionally denies direct financial-column SELECTs.
 * This adapter does not grant authority: the view and underlying write guards
 * enforce the caller's real database role, membership and current permissions.
 * Service-role clients keep using jobs directly.
 */
export function jobAccessRequestUrl(input: string): string {
  const url = new URL(input);
  if (!url.pathname.startsWith('/rest/v1/')) return input;
  if (url.pathname === '/rest/v1/jobs') url.pathname = '/rest/v1/job_access';
  const select = url.searchParams.get('select');
  if (select) {
    // Preserve embedded response names and explicit FK/inner-join hints.
    url.searchParams.set('select', select.replace(
      /(^|[,\(])\s*(?:([a-zA-Z_][\w]*):)?jobs(?=[!(])/g,
      (_match, prefix: string, alias: string | undefined) => `${prefix}${alias || 'jobs'}:job_access`,
    ));
  }
  return url.toString();
}

export const jobAccessFetch: typeof fetch = (input, init) => {
  const original = input instanceof Request ? input.url : String(input);
  const rewritten = jobAccessRequestUrl(original);
  return fetch(input instanceof Request ? new Request(rewritten, input) : rewritten, init);
};
