/**
 * Which routes draw their own header and footer, so AppShell must stand aside.
 *
 * WHY THIS IS ITS OWN MODULE. The rule below has one special case and a
 * catastrophic failure mode, and it used to live inline in a client component
 * where nothing could reach it. `'/'` is on the list — the homepage is the
 * flagship marketing page now — and the ordinary rule claims a route AND its
 * subtree, so a route of `'/'` matched by `startsWith('/')` would claim
 * /dashboard, /login and every other path in the application and silently strip
 * the chrome off the whole product.
 *
 * That is not a bug anybody would catch by looking at the homepage.
 */

export const OWN_CHROME_MARKETING_ROUTES = [
  // EXACT MATCH ONLY — see isOwnChromeRoute.
  '/',
  '/features',
  '/how-it-works',
  '/founder',
  '/home-editorial',
  '/home-compact',
  '/home-classic',
  // The reproduction of the source site's Product page, shown beside our own
  // /features. It ships that site's header and footer, so the shell stands
  // aside here exactly as it does for the homepage.
  '/features-flagship',
];

/**
 * Every entry claims its own path and its subtree — that is what gives
 * /features its five detail pages — except `'/'`, whose subtree is everything.
 */
export function isOwnChromeRoute(pathname: string): boolean {
  return OWN_CHROME_MARKETING_ROUTES.some((route) =>
    route === '/' ? pathname === '/' : pathname === route || pathname.startsWith(`${route}/`),
  );
}
