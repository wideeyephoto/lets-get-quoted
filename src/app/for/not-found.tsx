/* The app's one 404, mounted inside this segment so it keeps the site header.
 *
 * Without this file an unknown slug here falls through to src/app/not-found.tsx
 * at the ROOT, which is above this segment's layout — so the page would render
 * with no header at all now that AppShell stands aside for these routes
 * (OWN_CHROME_MARKETING_ROUTES). Same component, same copy, just re-mounted a
 * level down where the layout can wrap it.
 */
export { default, dynamic, metadata } from '../not-found';
