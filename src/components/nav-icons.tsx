// A leading line icon per dashboard destination, so the grouped rail reads at a
// glance. Stored as raw SVG inner markup (stroke, 24x24) and injected into a
// shared <svg> shell — the strings are static, so there's no hydration mismatch.
// Keyed by the /dashboard/* href; the demo rail reuses the same keys for icons.
export const NAV_ICON_PATHS: Record<string, string> = {
  '/dashboard': '<rect x="3.5" y="3.5" width="7" height="7" rx="1.2"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.2"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.2"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.2"/>',
  '/dashboard/leads': '<circle cx="10" cy="8.5" r="3.1"/><path d="M4 20a6 6 0 0 1 12 0"/><path d="M19 7.5v5M16.5 10h5"/>',
  '/dashboard/jobs': '<rect x="3" y="7.5" width="18" height="12.5" rx="2"/><path d="M8 7.5V5.5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M3 12.5h18"/>',
  '/dashboard/schedule': '<rect x="3.5" y="4.8" width="17" height="15.7" rx="2"/><path d="M3.5 9.4h17M8 2.6v4M16 2.6v4"/>',
  '/dashboard/clients': '<circle cx="9" cy="8.5" r="3"/><path d="M3.6 20a5.4 5.4 0 0 1 10.8 0"/><path d="M16 5.7a3 3 0 0 1 0 5.6"/><path d="M18.4 20a5.4 5.4 0 0 0-3.2-4.9"/>',
  // A calendar with a tick: the schedule icon, but the slot is already taken —
  // which is what a customer booking themselves in actually does.
  '/dashboard/schedule/booking': '<rect x="3.5" y="4.8" width="17" height="15.7" rx="2"/><path d="M3.5 9.4h17M8 2.6v4M16 2.6v4"/><path d="m8.6 14.6 2.4 2.4 4.4-4.6"/>',
  '/dashboard/quick-stops': '<path d="M20 10c0 5-8 11-8 11s-8-6-8-11a8 8 0 0 1 16 0z"/><path d="M12.5 5.5l-3 4h3l-1 4 3.2-4.4h-2.9z"/>',
  '/dashboard/crew': '<path d="M2.6 17.5h18.8"/><path d="M4.5 17.5a7.5 7.5 0 0 1 15 0"/><path d="M9.4 8.6V6.4A1.6 1.6 0 0 1 11 4.8h2a1.6 1.6 0 0 1 1.6 1.6v2.2"/>',
  '/dashboard/recurring': '<path d="M17 3l3.2 3.2L17 9.4"/><path d="M20.2 6.2H8.5a4.3 4.3 0 0 0-4.3 4.3v.6"/><path d="M7 21l-3.2-3.2L7 14.6"/><path d="M3.8 17.8h11.7a4.3 4.3 0 0 0 4.3-4.3v-.6"/>',
  // A balance line riding over a dashed floor — deliberately not the Insights
  // icon, which is a line going cleanly up. This one dips.
  '/dashboard/cash-flow': '<path d="M3.5 7.8l4.2 4.6 3.4-2.8 3.6 5.2 5.8-7.4"/><path d="M3.5 18.8h17" stroke-dasharray="2.5 2.5"/>',
  '/dashboard/services': '<path d="M11.5 3.5H5a1.5 1.5 0 0 0-1.5 1.5v6.5a1.5 1.5 0 0 0 .44 1.06l7.5 7.5a1.5 1.5 0 0 0 2.12 0l6.5-6.5a1.5 1.5 0 0 0 0-2.12l-7.5-7.5A1.5 1.5 0 0 0 11.5 3.5z"/><circle cx="8" cy="8" r="1.3"/>',
  '/dashboard/insights': '<path d="M3.5 17.5l5.5-5.5 3.5 3.5 7.5-7.5"/><path d="M15 7.5h5.5V13"/>',
  '/dashboard/messages': '<path d="M3.6 6.6A2 2 0 0 1 5.6 4.6h12.8a2 2 0 0 1 2 2v6.6a2 2 0 0 1-2 2H9l-4.2 3.6v-3.6H5.6a2 2 0 0 1-2-2z"/>',
  // Keyed to /dashboard/marketing, where the composer now lives. It was on
  // /dashboard/campaigns, which meant the merged page rendered with no glyph at
  // all while every item around it had one.
  '/dashboard/marketing': '<path d="M3.5 10.5v3a1 1 0 0 0 1 1h2.2l5.3 3.6V6.4L6.7 9.5H4.5a1 1 0 0 0-1 1z"/><path d="M16 9a4 4 0 0 1 0 6"/>',
  // A page with a pen on it — writing, not broadcasting.
  '/dashboard/marketing/blog': '<path d="M11 3.5H5.5a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-5"/><path d="M14.6 3.1a1.4 1.4 0 0 1 2 2L11.4 10.3l-2.7.7.7-2.7z"/>',
  '/dashboard/rebook': '<path d="M4 11.5a8 8 0 1 1 2.3 6.3"/><path d="M3.5 4.5v5h5"/>',
  '/dashboard/reviews': '<path d="M12 3.7l2.55 5.17 5.7.83-4.12 4.02.97 5.68L12 16.72l-5.1 2.68.97-5.68L3.75 9.7l5.7-.83z"/>',
  '/dashboard/settings': '<circle cx="12" cy="8.4" r="3.4"/><path d="M5.5 20a6.5 6.5 0 0 1 13 0"/>',
  '/dashboard/sites': '<rect x="3" y="4.5" width="18" height="12" rx="2"/><path d="M3 9h18M8 20h8M12 16.5V20"/>',
};

// `iconHref` is the /dashboard/* key above; callers whose links point elsewhere
// (e.g. the demo rail's /demo/* links) pass the matching dashboard href for the
// icon while linking wherever they like.
export function NavIcon({ href }: { href: string }) {
  const inner = NAV_ICON_PATHS[href];
  if (!inner) return null;
  return <svg className="sidenav-ic" viewBox="0 0 24 24" aria-hidden="true" dangerouslySetInnerHTML={{ __html: inner }} />;
}
