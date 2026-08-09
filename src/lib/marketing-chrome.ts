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

  /* THE REST OF THE PUBLIC SITE.
     ------------------------------------------------------------------------
     These used to render inside the shell's own public top bar, which meant
     the marketing site had two headers and clicking between them redrew the
     map: 82px fixed on /features, 70px sticky with an extra button on
     /pricing. Every one of them now draws <SiteHeaderSlot /> — the same
     header the homepage has — so the shell has to stand aside here too.

     Losing the shell also loses the "See everything included" drawer, which
     was the locked app preview. That drawer existed because the rail could
     not be deleted; /features is the page that answers the same question, and
     it is now two links away from every one of these pages instead of being
     in the footer.

     The four legal routes are here for the same reason: they are linked from
     the footer of every marketing page, and a visitor clicking Privacy from
     the homepage should not arrive somewhere that looks like a different
     site. */
  '/for',
  '/pricing',
  '/faq',
  '/security',
  '/resources',
  '/contact',
  '/privacy',
  '/terms',
  '/sms-terms',
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
