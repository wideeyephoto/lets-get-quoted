// A leading line icon per dashboard destination, so the grouped rail reads at a
// glance. Stored as raw SVG inner markup (stroke, 24x24) and injected into a
// shared <svg> shell — the strings are static, so there's no hydration mismatch.
// Keyed by the /dashboard/* href; the demo rail reuses the same keys for icons.
export const NAV_ICON_PATHS: Record<string, string> = {
  '/dashboard': '<rect x="3.5" y="3.5" width="7" height="7" rx="1.2"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.2"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.2"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.2"/>',
  '/dashboard/leads': '<circle cx="10" cy="8.5" r="3.1"/><path d="M4 20a6 6 0 0 1 12 0"/><path d="M19 7.5v5M16.5 10h5"/>',
  '/dashboard/jobs': '<rect x="3" y="7.5" width="18" height="12.5" rx="2"/><path d="M8 7.5V5.5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M3 12.5h18"/>',
  '/dashboard/schedule': '<rect x="3.5" y="4.8" width="17" height="15.7" rx="2"/><path d="M3.5 9.4h17M8 2.6v4M16 2.6v4"/>',
  '/dashboard/clients': '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  // A calendar with a tick: the schedule icon, but the slot is already taken —
  // which is what a customer booking themselves in actually does.
  '/dashboard/schedule/booking': '<rect x="3.5" y="4.8" width="17" height="15.7" rx="2"/><path d="M3.5 9.4h17M8 2.6v4M16 2.6v4"/><path d="m8.6 14.6 2.4 2.4 4.4-4.6"/>',
  '/dashboard/quick-stops': '<path d="M20 10c0 5-8 11-8 11s-8-6-8-11a8 8 0 0 1 16 0z"/><path d="M12.5 5.5l-3 4h3l-1 4 3.2-4.4h-2.9z"/>',
  // Lucide hard-hat, same shape the trade glyphs are baked from (see
  // service-icons.data.ts). The hand-drawn one it replaced hung its dome off a
  // full-width brim line, so at 18px it read as a bowl on a shelf.
  '/dashboard/crew': '<path d="M10 10V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v5m0-4a6 6 0 0 1 6 6v3M4 15v-3a6 6 0 0 1 6-6"/><rect x="2" y="15" width="20" height="4" rx="1"/>',
  '/dashboard/inventory': '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
  '/dashboard/recurring': '<path d="M17 3l3.2 3.2L17 9.4"/><path d="M20.2 6.2H8.5a4.3 4.3 0 0 0-4.3 4.3v.6"/><path d="M7 21l-3.2-3.2L7 14.6"/><path d="M3.8 17.8h11.7a4.3 4.3 0 0 0 4.3-4.3v-.6"/>',
  // Money going round: a dollar inside a clockwise loop. It wears the Money
  // section's mint like the other three rows in that group — see
  // .sidenav-group--money in globals.css; it used to own a green of its own.
  //
  // A trend arrow was the wrong idea for this page. It says "up", and cash flow
  // is not a direction — it is money arriving and leaving on a cycle, which is
  // exactly what the page projects. The dollar is also the only glyph in the
  // rail that names its subject outright.
  //
  // Two arcs of 130° with a 50° gap at each side, so the arrowheads have room to
  // read as arrowheads at 18px rather than thickening the ring. The dollar is
  // 58% of the ring's diameter: big enough to survive the size, small enough
  // that the loop still closes around it. Recurring is two rows down and also
  // cycles, but it is a flat racetrack with nothing inside it — the $ is what
  // keeps these two apart at a glance.
  '/dashboard/payments': '<rect x="2" y="4" width="20" height="16" rx="2.5"/><path d="M2 9.5h20"/><path d="M6 14.5h4"/><circle cx="16.5" cy="14.5" r="1"/>',
  '/dashboard/cash-flow': '<path d="M4.93 8.7A7.8 7.8 0 0 1 19.07 8.7"/><path d="M19.87 5.7 19.07 8.7 16.26 7.39"/><path d="M19.07 15.3A7.8 7.8 0 0 1 4.93 15.3"/><path d="M4.13 18.3 4.93 15.3 7.74 16.61"/><path d="M15 9h-4.5a1.5 1.5 0 1 0 0 3h3a1.5 1.5 0 1 1 0 3H9"/><path d="M12 16.5V7.5"/>',
  '/dashboard/expenses': '<rect x="2.5" y="5" width="19" height="14" rx="2"/><path d="M2.5 10h19"/><path d="M6 14.5h3"/><circle cx="16.5" cy="14.5" r="1.2"/>',
  // A book, because the page is called the Price book. With the ribbon: a plain
  // closed book is a rounded rectangle at 18px and sat in the rail as an empty
  // box, while the ribbon notch survives the size and says "book" on its own.
  '/dashboard/services': '<path d="M10 2v8l3-3 3 3V2"/><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20"/>',
  // A rising line with a corner arrowhead — Lucide's trending-up.
  //
  // Bars lived here for a while, and only because cash flow used to be a trend
  // arrow too: two lit diagonals three rows apart were indistinguishable at
  // 18px. Cash flow is now a dollar inside a loop, so the collision is gone and
  // the line can come back — which is the better glyph anyway, because Insights
  // is about which way things are going, not about four discrete quantities.
  '/dashboard/insights': '<path d="M3.5 17.5 10 11l4 4 6.5-6.5"/><path d="M15.5 8.5h5v5"/>',
  // Two lines inside the bubble. An empty speech bubble at 18px is a rounded
  // rectangle with a nick in it; the lines are what make it read as a message
  // rather than as a tooltip or a tag.
  '/dashboard/messages': '<path d="M3.6 6.6A2 2 0 0 1 5.6 4.6h12.8a2 2 0 0 1 2 2v6.6a2 2 0 0 1-2 2H9l-4.2 3.6v-3.6H5.6a2 2 0 0 1-2-2z"/><path d="M7.4 8.8h9M7.4 11.8h5.8"/>',
  // A STROKED bolt, not the filled one.
  //
  // AUTOMATIONS_BOLT_PATH (lib/nav-helpers) is a solid silhouette, drawn filled
  // by its own rule in globals.css. Dropping that same `d` in here would inherit
  // this shell's `fill: none; stroke: currentColor` and render a 1.7px outline
  // of a solid shape — a smudge at 18px. So the rail's bolt is redrawn as an
  // outline that reads at that size, with the two long diagonals kept parallel
  // so it still says "lightning" beside a speech bubble and a megaphone.
  '/dashboard/automations': '<path d="M13.2 2.8 5.4 13.4a.6.6 0 0 0 .5 1h4.3l-.8 6.8 7.9-10.6a.6.6 0 0 0-.5-1h-4.3z"/>',
  '/dashboard/text-to-job': '<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M12 18h.01M9 6h6M9 9h4"/>',
  '/dashboard/voice-calls': '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>',
  // Keyed to /dashboard/marketing, where the composer now lives. It was on
  // /dashboard/campaigns, which meant the merged page rendered with no glyph at
  // all while every item around it had one.
  // A megaphone, not a speaker. A speaker cone is what a volume control looks
  // like — this page is about broadcasting to a list, and the handle is the
  // whole difference between "sound" and "announcement".
  '/dashboard/marketing': '<path d="m3.2 11 17.6-5.4v13L3.2 13.2z"/><path d="M11.4 17.4a3 3 0 0 1-5.7-1.5"/>',
  // A page with writing on it and a pencil at the corner — writing, not
  // broadcasting, which is the whole distinction from Marketing above it. The
  // two text lines matter: a bare outline with a pencil reads as "edit", and
  // this is a place you go, not an action you take.
  '/dashboard/marketing/blog': '<path d="M14.6 3.4H6a1.5 1.5 0 0 0-1.5 1.5v14A1.5 1.5 0 0 0 6 20.4h9a1.5 1.5 0 0 0 1.5-1.5v-6.2"/><path d="M8 9h4.2M8 12.6h3.4M8 16.2h5.4"/><path d="M17.7 3.1a1.5 1.5 0 0 1 2.1 2.1l-5.3 5.3-2.8.7.7-2.8z"/>',
  '/dashboard/rebook': '<path d="M4 11.5a8 8 0 1 1 2.3 6.3"/><path d="M3.5 4.5v5h5"/>',
  // A star in a badge rather than a bare star. A loose star is the most reused
  // glyph there is — favorite, rating, featured — and the frame is what says
  // this row is a place where reviews are collected rather than a thing you
  // press to rate something.
  '/dashboard/reviews': '<rect x="3.3" y="3.3" width="17.4" height="17.4" rx="4.2"/><path d="M12 7.5l1.72 3.48 3.84.56-2.78 2.71.66 3.82L12 16.27l-3.44 1.8.66-3.82-2.78-2.71 3.84-.56z"/>',
  '/dashboard/settings': '<circle cx="12" cy="8.4" r="3.4"/><path d="M5.5 20a6.5 6.5 0 0 1 13 0"/>',
  // Lucide help-circle. A question mark rather than a lifebuoy: this is where
  // you ask something, not a rescue you have to be drowning to deserve.
  '/dashboard/help': '<circle cx="12" cy="12" r="9.2"/><path d="M9.2 9.3a2.9 2.9 0 0 1 5.6 1c0 1.9-2.8 2.5-2.8 4"/><path d="M12 17.4h.01"/>',
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
