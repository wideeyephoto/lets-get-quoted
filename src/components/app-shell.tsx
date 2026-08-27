'use client';

import Image from 'next/image';
import BrandLogo from '@/components/brand-logo';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { useAppShell } from './app-shell-provider';
import { NavIcon } from './nav-icons';
import ActionIcon from './action-icon';
import ThemeFab from './theme-fab';
import { SmartSearch } from './smart-search';
import { supabase } from '@/lib/supabase';
import { isOwnChromeRoute } from '@/lib/marketing-chrome';
import { APP_LOGIN_URL, APP_SIGNUP_URL } from '@/components/marketing/links';
import { isSectionNew, markNavSeen, navAttentionLabel, parseNavSeen, NAV_SEEN_STORAGE_KEY, type NavSeenMap } from '@/lib/nav-helpers';
import { attentionBadgeLabel } from '@/lib/lead-queue';

// The leads badge is the only one of the four fed by a capped scan (500 rows,
// see the status route), so it is the only one whose digits can run away from
// the box they sit in. They stop at "50+"; the label beside them keeps the
// exact figure, which is where a precise number was ever any use.
function attentionDigits(href: string, count: number): string {
  return href === '/dashboard/leads' ? attentionBadgeLabel(count) : String(count);
}

// Order follows the pipeline (Leads -> Jobs -> Schedule) with Crew, a resource,
// after the stages instead of splitting them. `hint` surfaces the vocabulary
// each stage owns (quotes/invoices/payments live inside Jobs) as a hover title.
/**
 * What "+ New" can create. ONE list, rendered by both triggers.
 *
 * There are two of them — the rail's button on a wide screen, and the mobile
 * top bar's. The mobile one used to be a plain link straight to
 * /dashboard/jobs?new=1, so a contractor on a phone — the device they actually
 * start the day on — could only ever create a job, and the other three were
 * reachable only by opening the Menu drawer first. Both now open this.
 *
 * Every href lands on the record's own page with its add form already open,
 * which is why they carry a query flag rather than pointing at a /new route.
 */
const NEW_MENU_ITEMS: { href: string; icon: string; label: string }[] = [
  { href: '/dashboard/jobs?new=1#new-job', icon: '/dashboard/jobs', label: 'New job' },
  { href: '/dashboard/leads?add=1#add-lead', icon: '/dashboard/leads', label: 'New lead' },
  // The two records you create without a job in front of you: a customer you
  // met, and somebody you hired.
  { href: '/dashboard/clients?add=1', icon: '/dashboard/clients', label: 'New client' },
  // The Crew tab is called People now that it holds subcontractors too.
  // ?tab=crew still resolves to it (see normalizeTab), but a link we ship should
  // name the tab it opens rather than lean on an alias kept for bookmarks.
  { href: '/dashboard/crew?tab=people&add=1', icon: '/dashboard/crew', label: 'New crew member' },
  { href: '/dashboard/crew?tab=people&add=sub', icon: '/dashboard/crew', label: 'New subcontractor' },
];

const baseNavItems: { href: string; label: string; hint?: string }[] = [
  { href: '/', label: 'Home' },
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/dashboard/leads', label: 'Leads', hint: 'New & website leads' },
  { href: '/dashboard/jobs', label: 'Jobs', hint: 'Quotes · Invoices · Payments' },
  { href: '/dashboard/clients', label: 'Clients', hint: 'Customer profiles & history' },
  { href: '/dashboard/schedule', label: 'Schedule', hint: 'Calendar & unscheduled work' },
  { href: '/dashboard/schedule/booking', label: 'Online Booking', hint: 'Lets customers book an available time through your website.' },
  { href: '/dashboard/quick-stops', label: 'Quick Stops', hint: 'Lets customers pay to be fitted in sooner.' },
  { href: '/dashboard/recurring', label: 'Recurring', hint: 'Repeating jobs & auto-billing' },
  { href: '/dashboard/cash-flow', label: 'Cash flow', hint: 'Upcoming bills, payroll & projected balance' },
  { href: '/dashboard/services', label: 'Price book', hint: 'Saved services & prices' },
  // Crew and hours are one destination, not two. They were split across a
  // "Crew" page and a "Payroll" page that could only be reached from a link
  // buried in the roster header — and neither could answer "who worked, on
  // what, for how much" without a page load between the halves.
  { href: '/dashboard/crew', label: 'Crew & Labor', hint: 'Your team, their hours & pay' },
  // A PRODUCT, NOT AN ACCOUNT SETTING. This was a sublink hanging off Account in
  // the footer — the strip reserved for the things that are not the day's work —
  // pointing at a tab inside Settings. It is the machinery that answers leads,
  // chases quotes and asks for reviews while nobody is watching, so it sits with
  // the other things that talk to customers on your behalf, above them because
  // it does the talking without being asked.
  { href: '/dashboard/automations', label: 'Automations', hint: 'The follow-ups, reminders and review asks that run without you' },
  { href: '/dashboard/voice-calls', label: 'AI Voice Assistant', hint: '24/7 AI receptionist, live booking & call log' },
  { href: '/dashboard/messages', label: 'Messages', hint: 'Two-way customer texts' },
  // One destination, not two. "Marketing" (the composer) and "Calendar" (the
  // seasonal topics) were the same workflow split across two pages that linked
  // to each other in both directions — and the nav item called "Calendar" sat
  // four rows under Schedule, which is the actual calendar.
  { href: '/dashboard/marketing', label: 'Marketing', hint: 'Seasonal topics, email & text campaigns' },
  // A sub-item, the same way Online Booking sits under Schedule. Writing posts
  // used to mean opening the website builder and expanding one section among a
  // dozen, which made it feel like editing a website rather than doing
  // marketing — which is what it is.
  { href: '/dashboard/marketing/blog', label: 'Blog', hint: 'Posts for your website' },
  // Rebook is NOT a rail item. It reached the rail as a destination but it is a
  // reason to send something, so it is surfaced on the Marketing overview
  // instead. The page itself is still at /dashboard/rebook, still linked from
  // there and from the dashboard.
  { href: '/dashboard/insights', label: 'Insights', hint: 'Sales activity & revenue trends' },
  { href: '/dashboard/reviews', label: 'Reviews', hint: 'Ratings & private feedback' },
  { href: '/dashboard/sites', label: 'Website' },
  { href: '/dashboard/settings', label: 'Account' },
  // Beside Account in the rail's footer rather than in a group. It is not part
  // of the day's work, and it needs to be findable from every page — the only
  // support route from inside the product used to be an email address on the
  // account-suspended page, which you reach by being suspended.
  { href: '/dashboard/help', label: 'Help', hint: 'Ask us a question and track the answer' },
];

// The connected-pill "flow" styling now spans all three pipeline stages.
// Which rail entry owns the highlight for a path.
//
// Plain startsWith stopped being enough once one nav entry sat underneath
// another: on /dashboard/schedule/booking both Schedule and Online Booking
// match, and two lit rows say you are in two places at once. Longest match wins.
function isActiveNav(pathname: string, href: string): boolean {
  if (href === '/dashboard') return pathname === href;
  if (!pathname.startsWith(href)) return false;
  return !baseNavItems.some(
    (other) => other.href.length > href.length && other.href.startsWith(href) && pathname.startsWith(other.href),
  );
}

const FLOW_CLASS: Record<string, string> = {
  '/dashboard/leads': ' flow-link flow-start',
  '/dashboard/jobs': ' flow-link flow-mid',
  '/dashboard/schedule': ' flow-link flow-end',
};

// Grouping used only by the signed-in dashboard's left sidebar. The flat
// `baseNavItems` order still drives the marketing/top-bar render; here the same
// items are bucketed so the rail reads as labeled sections instead of one long
// list. Website is promoted to its own badge and Account drops to the sidebar
// footer, so neither appears here.
//
// Dashboard is not in a group either: it is rendered BELOW all of them, with a
// rule above it — see the note at the `renderSideLink('/dashboard', …)` call.
// This comment used to say it sat above the groups, which stopped being true
// when it moved and is the kind of stale note that gets read as the spec.
//
// `accent` is the group's hue, carried as a class rather than a style so the
// value itself stays in globals.css — see --nav-work and the .sidenav-group--*
// block there. Spelled out rather than derived from the label because a group
// that ever gets a two-word name would otherwise emit a class with a space in
// it and silently lose its accent.
const NAV_GROUPS: { label: string; accent: string; hrefs: string[] }[] = [
  { label: 'Work', accent: 'work', hrefs: ['/dashboard/leads', '/dashboard/jobs', '/dashboard/schedule', '/dashboard/schedule/booking', '/dashboard/quick-stops', '/dashboard/clients'] },
  { label: 'Team', accent: 'team', hrefs: ['/dashboard/crew'] },
  // Insights first, cash flow last — the group reads backwards in time. What
  // happened, what repeats, what things cost, then what the balance does next.
  { label: 'Money', accent: 'money', hrefs: ['/dashboard/insights', '/dashboard/recurring', '/dashboard/services', '/dashboard/cash-flow'] },
  // Automations leads the group: it is the only row here that reaches customers
  // without somebody pressing something, so it is what the rest of Grow runs on
  // top of.
  { label: 'Grow', accent: 'grow', hrefs: ['/dashboard/automations', '/dashboard/voice-calls', '/dashboard/messages', '/dashboard/marketing', '/dashboard/marketing/blog', '/dashboard/reviews'] },
];

type AccountStatus = {
  onboarded: boolean;
  sitePublished: boolean;
  siteUrl: string | null;
  businessName: string | null;
  newQuoteRequestCount: number;
  jobsNeedingAttentionCount: number;
  unreadMessageCount: number;
  unscheduledJobCount: number;
  openQuickStopRequestCount?: number;
  /** Leads still being worked — excludes won (now a job) and lost. */
  openLeadCount: number;
  /** The same total, spelled out. Built server-side by lib/lead-summary. */
  leadRailTitle: string | null;
  /** Live work only — excludes completed and archived. */
  activeJobCount: number;
  newestQuoteRequestId: string | null;
  newestQuoteRequestCreatedAt: string | null;
  newestQuoteRequestHighValue: boolean;
  /** When the newest live job arrived — drives the rail's "New" badge. */
  newestJobCreatedAt: string | null;
  /** Whether Quick Stop is accepting expedited work right now. */
  quickStopState: NavState;
  /** Whether the public booking page is actually live. */
  bookingState: NavState;
  /** Whether any communication or AI credit balance is low. */
  lowCreditAlert?: boolean;
};

// Whether an automation is actually accepting work right now. 'paused' is the
// case that matters most: the owner's switch says on, but something else means
// nothing is really on offer. Green there would say the opposite of the truth,
// and OFF would blame the owner for something they did not do.
export type NavState = 'on' | 'off' | 'paused' | 'unknown';

// Nav entries that carry their own on/off state. The WORD is the state and the
// color only agrees with it, so it still reads without color vision.
const NAV_STATE_PILL: Record<string, Record<Exclude<NavState, 'unknown'>, { label: string; title: string }>> = {
  '/dashboard/quick-stops': {
    on: { label: 'ON', title: 'Quick Stops is ON — nearby customers can pay to be fitted in sooner' },
    off: { label: 'OFF', title: 'Quick Stops is OFF — nobody can ask to be added to today' },
    paused: { label: 'PAUSED', title: 'Quick Stops is paused by support — nothing new can be added to a day' },
  },
  '/dashboard/schedule/booking': {
    on: { label: 'ON', title: 'Online booking is live — customers can grab an open slot from your website' },
    off: { label: 'OFF', title: 'Online booking is off — your booking page is not accepting requests' },
    // Switched on, but there is nothing to book: no published site, no open days,
    // or no arrival windows. ON here would be a promise the page cannot keep.
    paused: { label: 'NOT LIVE', title: 'Online booking is on but nothing is on offer — publish your website, or open some days and arrival windows' },
  },
};

function navState(value: unknown): NavState {
  return value === 'on' || value === 'off' || value === 'paused' ? value : 'unknown';
}

// Both Stripe pills land on the Payments tab, not the top of Settings. Settings
// opens on its first tab, so "Connect Stripe" used to drop you on a page of
// unrelated cards with no Stripe in sight and leave you to find the right tab.
export const STRIPE_SETUP_HREF = '/dashboard/settings#payments';

const QUOTE_REQUEST_ALERT_DISMISSED_KEY = 'lgq-dismissed-quote-request-alert';

/**
 * The width at which the rail stops being furniture and becomes a drawer.
 *
 * It is 1080 in globals.css — the media query that gives .sidenav its
 * translateX(-100%) — and it was 900 here, in the body-lock effect, which meant
 * that between 901 and 1080px the drawer opened over a page that was still
 * scrolling under it. One constant now, named after what it means.
 */
const DRAWER_QUERY = '(max-width: 1080px)';

/**
 * Everything inside the drawer that a Tab can land on, in DOM order.
 *
 * Queried fresh on each Tab rather than cached: the Account menu opens and
 * closes inside the rail, and a list captured on open would send Shift+Tab to
 * a button that is no longer there.
 */
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Marketing pages that draw their OWN header — see the early return below. One
// list rather than eight prefix checks so adding a page is one line and cannot
// drift from the others.
//
// Matching is `=== route` OR `startsWith(route + '/')`, never a bare prefix.
// A bare prefix is wrong twice over here: '/for' would swallow the live
// /for/[trade] pages, and '/features' would swallow any future /features-*
// route. The trailing slash makes /features cover its five sub-pages
// (/features/ai-intake, /quick-stops, /client-portal, /website-builder,
// /back-office) without covering anything else.
//
// '/' IS here now. The flagship tour won the homepage bake-off and ships its
// own fixed header and footer, so the shell has to stand aside exactly as it
// does for /features — a second header on top would put two brands on the one
// page every visitor sees first.
//
// That has a consequence worth naming: this early-return drops the dashboard
// rail for a SIGNED-IN owner on '/' too. The flagship header covers it — it
// swaps its CTA to "Dashboard" when there is a session (site-chrome.tsx) — and
// that swap is the reason removing the rail here is acceptable rather than a
// dead end back into the product.
//
// /home-next is deliberately NOT here: it still wants the shell's chrome.
//
// /home-editorial, /home-compact and /home-classic are here because each is a
// homepage candidate (or the previous homepage) carrying its own header and
// footer, and one wearing this app's chrome on top of its own is not the
// design being compared.
// The list and the matcher live in lib/marketing-chrome.ts so the '/' special
// case can be tested — see the note there.

/**
 * The public marketing site, for the rail that stands in for its header.
 *
 * Deliberately the same five destinations, in the same order, as the flagship
 * header's NAV (site-chrome.tsx) — the two chromes wrap different halves of the
 * same site and a visitor crossing between them should not find the map
 * redrawn.
 */
const PUBLIC_NAV = [
  ['/features', 'Features'],
  ['/how-it-works', 'How it works'],
  ['/for', 'For your trade'],
  ['/pricing', 'Pricing'],
  ['/founder', 'Founder'],
] as const;

/**
 * The app root lands on a form headed "Sign in", so this used to send a
 * first-time visitor to the wrong half of the login screen — same bug the
 * flagship header had, on the chrome that wraps the other marketing pages.
 * The label matches those pages now too: one promise across the whole site.
 */
function getPrimaryAction(isLoggedIn = false, pathname: string | null = null) {
  if (isLoggedIn) {
    return { href: '/dashboard', label: 'Open dashboard' };
  }
  if (pathname?.startsWith('/help')) {
    return { href: APP_LOGIN_URL, label: 'Sign in to Dashboard' };
  }
  return { href: APP_SIGNUP_URL, label: 'Build my free site' };
}

export function AppShell({ children, forceStandaloneSite = false }: { children: ReactNode; forceStandaloneSite?: boolean }) {
  const pathname = usePathname();
  const { isNavOpen, closeNav, toggleNav } = useAppShell();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [stripeOnboarded, setStripeOnboarded] = useState<boolean | null>(null);
  const [sitePublished, setSitePublished] = useState(false);
  const [siteUrl, setSiteUrl] = useState<string | null>(null);
  const [businessName, setBusinessName] = useState<string | null>(null);
  // WHICH trigger is open, not merely whether one is. Both the rail and the
  // mobile bar render a "+ New", and both are in the DOM at once (the rail is a
  // drawer on a phone, not an unmounted branch). A shared boolean would open
  // both menus together and leave the outside-click handler pointed at the
  // wrong one — the visible menu would refuse to close.
  const [newMenuAt, setNewMenuAt] = useState<'rail' | 'bar' | null>(null);
  // One wrapper per trigger. Whichever is open is the one outside-click, Escape
  // and the arrow keys address — see the `wrap` local in each handler.
  const railNewRef = useRef<HTMLDivElement>(null);
  const barNewRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLElement>(null);
  // The two things the open drawer covers. Both are made `inert` while it is
  // open — see the containment effect below.
  const mainRef = useRef<HTMLDivElement>(null);
  const mobileBarRef = useRef<HTMLElement>(null);
  const [newQuoteRequestCount, setNewQuoteRequestCount] = useState(0);
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);
  const [jobsNeedingAttentionCount, setJobsNeedingAttentionCount] = useState(0);
  const [unscheduledJobCount, setUnscheduledJobCount] = useState(0);
  const [openQuickStopCount, setOpenQuickStopCount] = useState(0);
  const [openLeadCount, setOpenLeadCount] = useState(0);
  // Built server-side by lead-summary, so the rail cannot drift from the
  // dashboard's card. Falls back to the plain count until the first poll lands.
  const [leadTitle, setLeadTitle] = useState<string | null>(null);
  const [activeJobCount, setActiveJobCount] = useState(0);
  const [newestQuoteRequestId, setNewestQuoteRequestId] = useState<string | null>(null);
  const [newestQuoteRequestCreatedAt, setNewestQuoteRequestCreatedAt] = useState<string | null>(null);
  const [newestLeadHighValue, setNewestLeadHighValue] = useState(false);
  const [newestJobCreatedAt, setNewestJobCreatedAt] = useState<string | null>(null);
  // Per-section "you've looked at this" marks, read from localStorage after
  // mount. Empty on the server and on the first client render, which is what we
  // want: the badge appears a beat later rather than hydrating wrong.
  const [navSeen, setNavSeen] = useState<NavSeenMap>({});
  // 'unknown' until the first status check answers — a pill that guessed OFF for
  // a second on every page load would be worse than one that waits.
  const [quickStopState, setQuickStopState] = useState<NavState>('unknown');
  const [bookingState, setBookingState] = useState<NavState>('unknown');
  const [lowCreditAlert, setLowCreditAlert] = useState(false);
  const [dismissedQuoteRequestId, setDismissedQuoteRequestId] = useState<string | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const isDashboard = pathname.startsWith('/dashboard');
  // Homeowner-facing transactional pages (paying, approving a quote, an invoice)
  // stay on the minimal top bar — a big marketing rail there would be off-key.
  const isTransactional = pathname.startsWith('/pay') || pathname.startsWith('/client') || pathname.startsWith('/invoice') || pathname.startsWith('/track') || pathname.startsWith('/portal');
  // The subset that now wears the CONTRACTOR's brand instead of a top bar. /track
  // is deliberately not here: it's a live arrival map with its own full-bleed
  // chrome, and a header above it would push the map below the fold on a phone.
  const isHomeownerBranded =
    pathname.startsWith('/pay') ||
    pathname.startsWith('/client') ||
    pathname.startsWith('/invoice') ||
    pathname.startsWith('/portal');
  // First run (/welcome) renders bare — see the early return below.
  const isFirstRun = pathname === '/welcome';
  // The marketing cluster that ships its own header/footer (see the route list
  // above) — the shell stays out of its way so the page has one header, not two.
  const isOwnChromeMarketing = isOwnChromeRoute(pathname);
  // A signed-in contractor gets the FULL dashboard rail on every app/marketing
  // page (incl. the homepage) — same live counts, Website badge, New button and
  // Stripe pill as inside /dashboard — never the logged-out marketing teaser.
  // /login stays bare so auth forms render isolated.
  const showAppRail = isLoggedIn && !isTransactional && !pathname.startsWith('/login');
  const primaryAction = getPrimaryAction(isLoggedIn, pathname);
  // The bare host for the live badge — "yoursite.letsgetquoted.com", no scheme.
  const siteHost = siteUrl ? siteUrl.replace(/^https?:\/\//, '').replace(/\/+$/, '') : null;
  // Middleware rewrites a wildcard subdomain/custom-domain request to
  // /site/[subdomain] (or /site-domain/[host]) internally, but that rewrite
  // is transparent to the browser — usePathname() still reports the
  // ORIGINAL external path (e.g. "/"), not the rewritten one. So the
  // pathname-based check below only catches direct navigation to these
  // routes (e.g. dashboard preview links); `forceStandaloneSite` (set from
  // a request header middleware attaches on rewrite) catches the subdomain
  // case where the visible pathname doesn't reveal it's a site route.
  const isStandaloneSite =
    forceStandaloneSite ||
    pathname.startsWith('/site/') ||
    pathname.startsWith('/site-domain/') ||
    pathname.startsWith('/themes/') ||
    pathname.startsWith('/field') ||
    pathname === '/site-preview-frame' ||
    pathname === '/dashboard/sites/preview';
  // The signed-in app nav lives in the dashboard's left sidebar (rendered
  // below), so it never belongs in this top bar. On marketing pages the top bar
  // stays clean: a signed-in visitor gets a single "Dashboard" link back into
  // the app, and a logged-out prospect (or a homeowner paying an invoice) gets
  // just a "Sign in" link — never the internal Leads/Jobs/Clients/… links,
  // which would only dead-end at a login wall and clutter the landing page.
  const navItems: { href: string; label: string; hint?: string }[] = isLoggedIn
    ? [{ href: '/dashboard', label: 'Dashboard' }]
    : isStandaloneSite || pathname.startsWith('/demo')
      ? []
      : [{ href: '/login', label: 'Sign in' }];

  useEffect(() => {
    closeNav();
    setNewMenuAt(null);
  }, [pathname, closeNav]);

  // Freeze the page behind the open drawer.
  //
  // `body { overflow: hidden }` is the usual way and it is NOT enough here.
  // Measured in WebKit with the drawer open: document.scrollingElement is
  // <html>, body computes to overflow:hidden, and window.scrollTo(0, 400) still
  // puts the page at 400. So the page goes on being the scroller under your
  // finger, and the first drag on the nav moves the dashboard instead — until
  // you tap the rail once and WebKit latches the gesture onto it.
  //
  // Pinning the body is the version that actually holds: a fixed element cannot
  // scroll, whatever the engine thinks of the overflow rules. The offset has to
  // be carried across by hand (top: -scrollY, then scroll back on release) or
  // opening the menu would throw the page back to the top.
  //
  // Only below the breakpoint. Above it the rail is docked furniture, not a
  // drawer, and isNavOpen means nothing — so a stale `true` carried in by a
  // resize must not leave the page pinned. The media listener releases it.
  useEffect(() => {
    if (!isNavOpen) return;
    const body = document.body;
    const drawer = window.matchMedia(DRAWER_QUERY);
    const saved = {
      overflow: body.style.overflow,
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
    };
    let offset = 0;
    let locked = false;

    const lock = () => {
      if (locked) return;
      offset = window.scrollY;
      body.style.overflow = 'hidden';
      body.style.position = 'fixed';
      body.style.top = `-${offset}px`;
      // Without these the pinned body shrinks to fit its content.
      body.style.left = '0';
      body.style.right = '0';
      locked = true;
    };
    const release = () => {
      if (!locked) return;
      Object.assign(body.style, saved);
      window.scrollTo(0, offset);
      locked = false;
    };
    const sync = () => (drawer.matches ? lock() : release());

    sync();
    drawer.addEventListener('change', sync);
    return () => {
      drawer.removeEventListener('change', sync);
      release();
    };
  }, [isNavOpen]);

  // In a short viewport the whole rail scrolls rather than just the nav list
  // (see the max-height rule in globals.css), and the rail is never unmounted —
  // it is translated off-screen. So a drawer left scrolled halfway down reopens
  // halfway down, with the wordmark and the business name off the top, which
  // reads as a broken panel rather than as a remembered position. Opening it is
  // a fresh look at the whole nav; start at the top. A no-op on tall viewports,
  // where the rail itself never scrolls.
  useEffect(() => {
    if (isNavOpen) railRef.current?.scrollTo({ top: 0 });
  }, [isNavOpen]);

  // Escape closes the mobile nav drawer (it already closes on scrim tap and on
  // navigation) — the keyboard equivalent of tapping the scrim.
  useEffect(() => {
    if (!isNavOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeNav();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isNavOpen, closeNav]);

  /**
   * THE OPEN DRAWER IS MODAL, so make it behave like one.
   *
   * It already looks modal — it comes with a scrim, it pins the body, Escape
   * shuts it — and it was none of those things to a keyboard. Tab walked
   * straight past the nav into the dashboard behind the scrim, where you could
   * operate controls you could not see, and Shift+Tab from the first link went
   * up into the mobile top bar. Two halves fix it: `inert` on everything the
   * drawer covers (the page, and the bar the toggle lives in), and a wrap at
   * each end of the rail so Tab cycles inside it.
   *
   * `inert` is set imperatively because React 18 has no typed prop for it and
   * a stringly-typed one hydrates as the literal "true". Feature detection is
   * unnecessary: on a browser without it, toggleAttribute is a no-op on an
   * attribute nothing reads, and the visibility:hidden rule on the CLOSED rail
   * — which is the finding that mattered — does not depend on this at all.
   *
   * Above the drawer width the rail is docked furniture and none of this
   * applies; the media listener releases it if the window is widened while the
   * drawer happens to be open.
   */
  useEffect(() => {
    if (!isNavOpen) return;
    const drawer = window.matchMedia(DRAWER_QUERY);
    const covered = () => [mainRef.current, mobileBarRef.current].filter(Boolean) as HTMLElement[];
    let contained = false;

    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || !railRef.current) return;
      const items = Array.from(railRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !railRef.current.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    const contain = () => {
      if (contained) return;
      covered().forEach((el) => el.toggleAttribute('inert', true));
      document.addEventListener('keydown', onKey);
      // Into the drawer, not merely near it — otherwise the first Tab still
      // starts from wherever the toggle was, which is now inert.
      railRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
      contained = true;
    };
    const release = () => {
      if (!contained) return;
      covered().forEach((el) => el.toggleAttribute('inert', false));
      document.removeEventListener('keydown', onKey);
      contained = false;
    };
    const sync = () => (drawer.matches ? contain() : release());

    sync();
    drawer.addEventListener('change', sync);
    return () => {
      drawer.removeEventListener('change', sync);
      release();
    };
  }, [isNavOpen]);

  // The "+ New" menu closes on outside click or Escape. On open, focus moves to
  // the first item; on Escape it returns to the trigger.
  useEffect(() => {
    if (!newMenuAt) return;
    const wrap = newMenuAt === 'bar' ? barNewRef : railNewRef;
    wrap.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const onPointerDown = (event: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(event.target as Node)) setNewMenuAt(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setNewMenuAt(null);
        // The trigger, by its ROLE rather than by a class. Reusing `.sidenav-new`
        // on the mobile bar's button would have dragged that rule's width:100%
        // and gradient onto a 44px pill in a flex header.
        wrap.current?.querySelector<HTMLElement>('button[aria-haspopup="menu"]')?.focus();
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [newMenuAt]);

  /**
   * The "+ New" menu itself. Rendered by whichever trigger is open, from the one
   * NEW_MENU_ITEMS list — so the phone and the desktop can never offer a
   * different set of things to create.
   *
   * The id is passed in because both triggers point at their menu with
   * aria-controls, and two elements sharing an id would make one of those
   * references resolve to the wrong menu.
   */
  function renderNewMenu(id: string) {
    return (
      <div className="sidenav-new-menu" id={id} role="menu" onKeyDown={onNewMenuKeyDown}>
        {NEW_MENU_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            role="menuitem"
            className="sidenav-new-item"
            onClick={() => setNewMenuAt(null)}
          >
            <NavIcon href={item.icon} />
            {item.label}
          </Link>
        ))}
      </div>
    );
  }

  // Arrow keys move focus between "+ New" menu items (wrapping).
  function onNewMenuKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const wrap = newMenuAt === 'bar' ? barNewRef : railNewRef;
    const items = Array.from(wrap.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    if (!items.length) return;
    event.preventDefault();
    const idx = items.indexOf(document.activeElement as HTMLElement);
    const nextIdx = event.key === 'ArrowDown' ? (idx + 1) % items.length : (idx - 1 + items.length) % items.length;
    items[nextIdx].focus();
  }

  // Track sign-in state client-side so the logo can route logged-in
  // contractors straight to their dashboard from anywhere in the app
  // (marketing pages, etc.), not just while already inside /dashboard.
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setIsLoggedIn(!!data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsLoggedIn(!!session);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  // Stripe payouts are core to the business — keep a persistent, always-
  // visible status pill in the topbar across every dashboard page (not just
  // the dashboard home), so the owner can never lose track of onboarding
  // status. Re-checked on every dashboard navigation (e.g. right after
  // returning from Stripe's hosted onboarding flow).
  useEffect(() => {
    if (!showAppRail) {
      setNewQuoteRequestCount(0);
      setUnreadMessageCount(0);
      setJobsNeedingAttentionCount(0);
      setUnscheduledJobCount(0);
      setOpenLeadCount(0);
      setActiveJobCount(0);
      setNewestQuoteRequestId(null);
      setNewestQuoteRequestCreatedAt(null);
      setNewestLeadHighValue(false);
      setQuickStopState('unknown');
      setBookingState('unknown');
      setLowCreditAlert(false);
      setSiteUrl(null);
      setBusinessName(null);
      return;
    }
    let cancelled = false;
    const loadStatus = () => {
      fetch('/api/account/status', { cache: 'no-store' })
        .then((res) => (res.ok ? res.json() as Promise<AccountStatus> : null))
        .then((data) => {
          if (!cancelled && data) {
            setStripeOnboarded(Boolean(data.onboarded));
            setSitePublished(Boolean(data.sitePublished));
            setSiteUrl(data.siteUrl ?? null);
            setBusinessName(data.businessName ?? null);
            setNewQuoteRequestCount(Number(data.newQuoteRequestCount ?? 0));
            setUnreadMessageCount(Number(data.unreadMessageCount ?? 0));
            setJobsNeedingAttentionCount(Number(data.jobsNeedingAttentionCount ?? 0));
            setUnscheduledJobCount(Number(data.unscheduledJobCount ?? 0));
            setOpenQuickStopCount(Number(data.openQuickStopRequestCount ?? 0));
            setOpenLeadCount(Number(data.openLeadCount ?? 0));
            setLeadTitle(typeof data.leadRailTitle === 'string' ? data.leadRailTitle : null);
            setActiveJobCount(Number(data.activeJobCount ?? 0));
            setNewestQuoteRequestId(data.newestQuoteRequestId ?? null);
            setNewestQuoteRequestCreatedAt(data.newestQuoteRequestCreatedAt ?? null);
            setNewestLeadHighValue(Boolean(data.newestQuoteRequestHighValue));
            setNewestJobCreatedAt(data.newestJobCreatedAt ?? null);
            setQuickStopState(navState(data.quickStopState));
            setBookingState(navState(data.bookingState));
            setLowCreditAlert(Boolean(data.lowCreditAlert));
          }
        })
        .catch(() => {});
    };
    loadStatus();
    // Surface a new lead/job even while the owner sits on one page: re-check on
    // an interval, and immediately whenever they switch back to the tab.
    const interval = window.setInterval(loadStatus, 60000);
    const onFocus = () => loadStatus();
    window.addEventListener('focus', onFocus);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [showAppRail, pathname]);

  useEffect(() => {
    if (!isDashboard || !isLoggedIn) return;
    setDismissedQuoteRequestId(window.localStorage.getItem(QUOTE_REQUEST_ALERT_DISMISSED_KEY));
  }, [isDashboard, isLoggedIn, newestQuoteRequestId]);

  // Read the seen marks once, after mount.
  useEffect(() => {
    if (!isLoggedIn) return;
    setNavSeen(parseNavSeen(window.localStorage.getItem(NAV_SEEN_STORAGE_KEY)));
  }, [isLoggedIn]);

  // Landing on a section clears its badge. It runs on the newest-arrival value
  // too, not just the pathname: sitting on Leads while a lead comes in should
  // clear that one as well — it arrived on a screen that was already showing it,
  // so it has been seen by any reasonable meaning of the word.
  useEffect(() => {
    if (!isLoggedIn) return;
    const newestFor: Record<string, string | null> = {
      '/dashboard/leads': newestQuoteRequestCreatedAt,
      '/dashboard/jobs': newestJobCreatedAt,
    };
    const href = Object.keys(newestFor).find((section) => isActiveNav(pathname, section));
    if (!href) return;
    setNavSeen((current) => {
      const next = markNavSeen(current, href, newestFor[href]);
      // markNavSeen returns the same object when nothing moved forward, so this
      // never writes storage or re-renders on every poll.
      if (next === current) return current;
      try {
        window.localStorage.setItem(NAV_SEEN_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Private mode / storage full. The badge just stays until the next
        // visit — not worth failing a navigation over.
      }
      return next;
    });
  }, [isLoggedIn, pathname, newestQuoteRequestCreatedAt, newestJobCreatedAt]);

  if (isStandaloneSite) {
    return <>{children}</>;
  }

  // The /demo experience renders its own sidebar chrome (see demo/layout.tsx),
  // so the app shell stays out of its way — no marketing top bar wrapping it.
  if (pathname.startsWith('/demo')) {
    return <>{children}</>;
  }

  // /features (+ its five sub-pages), /how-it-works and /founder each render a
  // full marketing header and SiteFooter of their own. Unconditional, like
  // /demo above: this is the same page for a prospect and for a signed-in
  // owner, and the alternative — letting `showAppRail` win below — would wrap
  // an indexed marketing page in the dashboard rail, live lead counts and all,
  // underneath the header the page already drew.
  if (isOwnChromeMarketing) {
    return <>{children}</>;
  }

  // First run is a WALL, not a page inside the app, so it gets no chrome at all.
  // Neither rail is right here: the signed-in rail invites the owner to click
  // straight past the thing they have to do first (every link bounces them back
  // — requireOwnerContext gates them — which reads as a broken sidebar), and the
  // logged-out rail advertises the demo and the templates to somebody who has
  // already signed up and is three fields from being done.
  if (isFirstRun) {
    return <>{children}</>;
  }

  // The internal /admin console renders its own chrome (see admin/layout.tsx)
  // and is not an owner-account surface, so keep the owner/marketing shell off it.
  if (pathname.startsWith('/admin')) {
    return <>{children}</>;
  }

  // Pages a HOMEOWNER opens from a text or an email: the quote, the invoice, the
  // payment page, their own portal. Each draws its own <ContractorBrandBar> with
  // the contractor's logo and name, so this shell must render no bar at all.
  //
  // It cannot do the branding itself and never could: this is a client component
  // in the root layout with no idea which account a link token belongs to, so
  // the best it could ever do was our mark and our wordmark — the wrong name on
  // the door on the one page where the customer is deciding whether to pay.
  if (isHomeownerBranded) {
    return <div className="chrome-shell chrome-shell-bare">{children}</div>;
  }

  // A contractor's public booking page wears THEIR brand, not ours (see
  // book/[subdomain]/BookingChrome.tsx). This shell has no business around it:
  // a homeowner was being shown the whole locked app nav — eighteen padlocked
  // rows of a CRM they will never own — with "Create free account" as the
  // largest button on the page, competing with the one that books the job. And
  // a signed-in owner opening their own booking link (the dashboard's own
  // Preview does exactly that) got the full dashboard rail, live lead counts
  // and all, wrapped around their customer's page.
  if (pathname.startsWith('/book/')) {
    return <>{children}</>;
  }

  const brandHref = isLoggedIn ? '/dashboard' : '/';
  const showQuoteRequestAlert = isDashboard && isLoggedIn && newQuoteRequestCount > 0 && newestQuoteRequestId && dismissedQuoteRequestId !== newestQuoteRequestId;
  const newestQuoteRequestAge = newestQuoteRequestCreatedAt
    ? Math.max(1, Math.round((Date.now() - new Date(newestQuoteRequestCreatedAt).getTime()) / 3600000))
    : null;

  function dismissQuoteRequestAlert() {
    if (!newestQuoteRequestId) return;
    window.localStorage.setItem(QUOTE_REQUEST_ALERT_DISMISSED_KEY, newestQuoteRequestId);
    setDismissedQuoteRequestId(newestQuoteRequestId);
  }

  // Signed-in contractors get the grouped left sidebar on every app/marketing
  // page (incl. the homepage) — the Website badge, Stripe pill, New button and
  // the live Leads / Jobs / Schedule counts ride along everywhere, so the nav
  // "functions as logged in" no matter where they land.
  if (showAppRail) {
    const byHref = new Map(baseNavItems.map((item) => [item.href, item] as const));
    const countByHref: Record<string, number> = {
      '/dashboard/leads': newQuoteRequestCount,
      '/dashboard/jobs': jobsNeedingAttentionCount,
      '/dashboard/schedule': unscheduledJobCount,
      // A customer text is exactly the kind of thing this dot exists for.
      '/dashboard/messages': unreadMessageCount,
      '/dashboard/quick-stops': openQuickStopCount,
    };
    // Inventory beside attention. The filled circle has always meant "these
    // need you today" and stays that way; the hollow one is simply how much is
    // in the pipeline, so a quiet day reads as 0 needing you out of 12 open
    // rather than as an empty rail.
    const totalByHref: Record<string, { count: number; title: string }> = {
      '/dashboard/leads': { count: openLeadCount, title: leadTitle ?? `${openLeadCount} open lead${openLeadCount === 1 ? '' : 's'} (won, lost, archived and snoozed not counted)` },
      '/dashboard/jobs': { count: activeJobCount, title: `${activeJobCount} live job${activeJobCount === 1 ? '' : 's'}. Completed and archived jobs are not counted.` },
    };
    // "Something arrived here that you haven't opened yet." The numbers say how
    // much; this says whether any of it is news. It clears on the visit, so it
    // is only ever pointing at the gap between the two.
    const newestByHref: Record<string, string | null> = {
      '/dashboard/leads': newestQuoteRequestCreatedAt,
      '/dashboard/jobs': newestJobCreatedAt,
    };
    const newLabelByHref: Record<string, string> = {
      '/dashboard/leads': 'New leads have come in since you last opened Leads',
      '/dashboard/jobs': 'New work has landed since you last opened Jobs',
    };
    const renderSideLink = (href: string, extraClass = '') => {
      const item = byHref.get(href);
      if (!item) return null;
      const active = isActiveNav(pathname, href);
      const count = countByHref[href] ?? 0;
      const total = totalByHref[href];
      // Never on the page you're standing on — the effect above marks it seen
      // the moment you arrive, but the badge shouldn't flicker in the gap.
      const isNew = !active && isSectionNew(newestByHref[href], navSeen[href]);
      const state =
        href === '/dashboard/quick-stops' ? quickStopState : href === '/dashboard/schedule/booking' ? bookingState : 'unknown';
      // Quick Stops wears its logo instead of an icon and a word. The wordmark
      // carries its own pin, so the line icon goes with the text — side by side
      // the row would show two pins in 150px.
      const brand = href === '/dashboard/quick-stops';
      return (
        <Link
          href={href}
          key={href}
          data-tour-id={`nav:${href}`}
          className={`sidenav-link${brand ? ' sidenav-link-brand' : ''}${extraClass ? ` ${extraClass}` : ''}${active ? ' active' : ''}`}
          // Which row you are standing on was said in color and in nothing
          // else, so a screen reader had no way to know — 18 identical links.
          aria-current={active ? 'page' : undefined}
          // Also on the row, not just the pill inside it, so the row can carry
          // the state's color without CSS having to reach into a child with
          // :has() — which not every browser this ships to supports.
          data-state={state !== 'unknown' && NAV_STATE_PILL[href] ? state : undefined}
          title={item.hint}
        >
          {brand ? (
            <Image
              src="/brand/quick-stops-wordmark.png"
              alt={item.label}
              width={287}
              height={50}
              className="sidenav-brandmark"
            />
          ) : (
            <>
              <NavIcon href={href} />
              <span>{item.label}</span>
            </>
          )}
          {/* The two automations that can put work on your calendar without you
              touching anything. Both switches are pages deep, so the rail says
              which way they are set from wherever you happen to be. */}
          {state !== 'unknown' && NAV_STATE_PILL[href] ? (
            <span className="sidenav-state" data-state={state} title={NAV_STATE_PILL[href][state].title}>
              {NAV_STATE_PILL[href][state].label}
            </span>
          ) : null}
          {/* Ahead of the numbers, so the badge cluster reads left to right as
              "is there news, then how much". */}
          {/* EVERY BADGE SAYS WHAT IT IS, IN TEXT.
              The row read "Leads New 3 12" to a screen reader — four things,
              none of them explained — and the explanations were all sitting in
              `title` attributes on these spans, where a phone cannot hover and
              an accessible name does not look. The digits are now decoration
              beside a real label. See navAttentionLabel in lib/nav-helpers. */}
          {isNew ? (
            <span className="sidenav-unseen" title={newLabelByHref[href]}>
              <span aria-hidden="true">New</span>
              <span className="sr-only">{newLabelByHref[href] ?? 'New since your last visit'}</span>
            </span>
          ) : null}
          {count > 0 ? (
            <span className="sidenav-count" title={navAttentionLabel(href, count) ?? undefined}>
              <span aria-hidden="true">{attentionDigits(href, count)}</span>
              <span className="sr-only">{navAttentionLabel(href, count) ?? `${count} need your attention`}</span>
            </span>
          ) : null}
          {total && total.count > 0 ? (
            <span className="sidenav-total" title={total.title}>
              <span aria-hidden="true">{total.count}</span>
              <span className="sr-only">{total.title}</span>
            </span>
          ) : null}
        </Link>
      );
    };

    return (
      <div className="chrome-shell chrome-shell-sidenav">
        <header className="sidenav-mobilebar" ref={mobileBarRef}>
          <Link href={brandHref} className="sidenav-brand" aria-label="Let&apos;s Get Quoted home">
            <span className="sidenav-wordmark">Let&apos;s Get <span>Quoted</span></span>
          </Link>
          {/* The two things a contractor starts the day with were both behind
              the Menu button on a phone — the one device they actually start the
              day on. Plan my day is icon-only here because its meaning survives
              the icon and the words do not survive the width; + New keeps its
              word because a bare plus could add anything. */}
          {isLoggedIn ? (
            <>
              <SmartSearch variant="mobile" onOpenChange={setIsSearchOpen} />
              <Link
                href="/dashboard/schedule/plan"
                className={`mobilebar-plan${pathname.startsWith('/dashboard/schedule/plan') ? ' active' : ''}`}
                aria-label="Plan my day"
                title="Plan my day"
              >
                <ActionIcon name="plan" />
              </Link>
              {/* A menu, not a shortcut. This was a plain link to
                  /dashboard/jobs?new=1, so the only thing a contractor could
                  create from their phone's top bar was a job — a new client or
                  a new crew member meant opening the Menu drawer first. It
                  offers the same four things the rail does now. */}
              <div className="mobilebar-new-wrap" ref={barNewRef}>
                <button
                  type="button"
                  className="mobilebar-new"
                  aria-haspopup="menu"
                  aria-expanded={newMenuAt === 'bar'}
                  // renderNewMenu only runs while this is open, so the id it
                  // names exists only then — see the note on the rail's copy.
                  aria-controls={newMenuAt === 'bar' ? 'mobilebar-new-menu' : undefined}
                  onClick={() => setNewMenuAt((at) => (at === 'bar' ? null : 'bar'))}
                >
                  <span aria-hidden="true">+</span> New
                  <span className={`sidenav-new-caret${newMenuAt === 'bar' ? ' open' : ''}`} aria-hidden="true">▾</span>
                </button>
                {newMenuAt === 'bar' ? renderNewMenu('mobilebar-new-menu') : null}
              </div>
            </>
          ) : null}
          <button
            type="button"
            className="nav-toggle"
            onClick={toggleNav}
            aria-expanded={isNavOpen}
            aria-controls="primary-nav"
          >
            Menu
          </button>
        </header>

        {isNavOpen ? <div className="sidenav-scrim" onClick={closeNav} aria-hidden="true" /> : null}

        <aside id="primary-nav" ref={railRef} className={`sidenav${isNavOpen ? ' open' : ''}`} aria-label="Primary">
          <Link href={brandHref} className="sidenav-brand" aria-label="Let&apos;s Get Quoted home">
            <span className="sidenav-wordmark">Let&apos;s Get <span>Quoted</span></span>
          </Link>

          <div className="sidenav-lead">
            {businessName ? <p className="sidenav-bizname" title={businessName}>{businessName}</p> : null}
            <SmartSearch variant="rail" onOpenChange={setIsSearchOpen} />
            {/* The two things a contractor starts the day with, on one row.
                Plan my day is the wider of the two because it carries three
                words; "+ New" only ever says one, so it takes what it needs and
                gives the rest back rather than both being forced to half. */}
            <div className="sidenav-actions">
              <Link
                href="/dashboard/schedule/plan"
                className={`action-btn action-btn--plan sidenav-plan${pathname.startsWith('/dashboard/schedule/plan') ? ' active' : ''}`}
                title="Order today's stops into the shortest sensible route"
              >
                <ActionIcon name="plan" />
                Plan my day
              </Link>
              <div className="sidenav-new-wrap" ref={railNewRef}>
                <button
                  type="button"
                  className="sidenav-new"
                  aria-haspopup="menu"
                  aria-expanded={newMenuAt === 'rail'}
                  /* Conditional, because the menu is not rendered while shut.
                     Chrome drops a controls relation whose target is missing
                     OR hidden, so this reads identically in the tree either
                     way — but written unconditionally the attribute names an
                     element that is not in the document, which is the same
                     dangling reference the labels in 6fe6f462 had. */
                  aria-controls={newMenuAt === 'rail' ? 'sidenav-new-menu' : undefined}
                  onClick={() => setNewMenuAt((at) => (at === 'rail' ? null : 'rail'))}
                >
                  <span className="sidenav-new-plus" aria-hidden="true">+</span> New
                  <span className={`sidenav-new-caret${newMenuAt === 'rail' ? ' open' : ''}`} aria-hidden="true">▾</span>
                </button>
                {newMenuAt === 'rail' ? renderNewMenu('sidenav-new-menu') : null}
              </div>
            </div>
          </div>

          <Link
            href="/dashboard/sites"
            data-tour-id="nav:/dashboard/sites"
            className={`website-nav-badge sidenav-website${sitePublished ? ' live' : ''}`}
            title={sitePublished ? `Your website is live${siteHost ? ` at ${siteHost}` : ''} — manage it` : 'Build your free contractor website'}
          >
            {sitePublished ? (
              <>
                <span className="website-nav-signal" aria-hidden="true"><i /><i /><i /></span>
                {siteHost ? (
                  <span className="website-nav-live-text">
                    <span className="website-nav-live-top">
                      <span className="website-nav-live-label">Website: Live</span>
                      <span className="website-nav-live-edit">(edit)</span>
                    </span>
                    <span className="website-nav-live-host">{siteHost}</span>
                  </span>
                ) : (
                  'Website: Live'
                )}
              </>
            ) : (
              <>
                <span aria-hidden="true">✨</span> Build your Website
              </>
            )}
          </Link>

          <nav className="sidenav-nav" aria-label="Dashboard">
            {NAV_GROUPS.map((group) => (
              <div className={`sidenav-group sidenav-group--${group.accent}`} key={group.label}>
                <p className="sidenav-glabel">{group.label}</p>
                {group.hrefs.map((href) => renderSideLink(href))}
              </div>
            ))}
            {/* Dashboard closes the rail rather than opening it. It is the
                summary of everything above, not a step before any of it, and at
                the top it took the first slot from Leads — which is where the
                day actually starts. */}
            {renderSideLink('/dashboard', 'sidenav-bottom')}
          </nav>

          {/* A DOOR, NOT A DRAWER OF DOORS.
              This was a dropdown gathering Account settings, Help, the theme
              switch, a Stripe row and Sign out behind the business name. Every
              one of those was either a duplicate or a page:

              — Stripe was listed INSIDE the menu and again as the pill right
                below it, so the rail said the same sentence twice.
              — Sign out lives on the Account page, in Login & security, next to
                the sign-in methods it belongs with.
              — Help and the theme control moved onto the Account page too (see
                its 'account' tab), which is what "Account" now opens.
              — And the trigger itself said the business name, which is not what
                is behind it. Nobody clicks their own company to change their
                password.

              So the whole menu collapses to the row that was always doing the
              work: one link, labelled with the destination. Two clicks became
              one everywhere except the two things the menu had that the page
              does not — and the page has both now.

              The Stripe pill stays BELOW as its own row, not folded into this
              link. It is not a setting; it is a live warning about whether money
              can reach the contractor, and a warning behind a click stops being
              one. */}
          <div className="sidenav-foot">
            <Link
              href="/dashboard/settings"
              className={`sidenav-account${isActiveNav(pathname, '/dashboard/settings') ? ' active' : ''}`}
              title={lowCreditAlert ? 'Account settings (Low credit balance — tap to manage)' : 'Account settings'}
            >
              <NavIcon href="/dashboard/settings" />
              <span className="sidenav-account-name">Account</span>
              {lowCreditAlert ? (
                <span
                  className="sidenav-credit-dot"
                  title="Low credit balance — tap to view plan & credits"
                  aria-label="Low credit balance"
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    backgroundColor: 'var(--amber-9, #f59e0b)',
                    boxShadow: '0 0 6px rgba(245, 158, 11, 0.6)',
                    marginLeft: 'auto',
                    flexShrink: 0,
                    display: 'inline-block',
                  }}
                />
              ) : null}
            </Link>

            {/* Whether money can actually reach this contractor. Beside Account
                rather than under it — see the note above.

                THE LABEL IS SHORTER WHEN THE NEWS IS GOOD. Sharing a 244px line
                means one of these two labels gives way, and "Stripe connected"
                is the one that can: the pill is green, the "$" tile is green and
                it carries a green underline, so the word "connected" was the
                fourth thing saying so. "Connect Stripe" keeps every word — it is
                an instruction, not a status — and the CSS lets the pill take a
                line of its own rather than truncate that. The title says the
                whole sentence in both states. */}
            <Link
              href={STRIPE_SETUP_HREF}
              className={`stripe-status-pill sidenav-stripe${stripeOnboarded === null ? ' checking' : stripeOnboarded ? ' connected' : ' warning'}`}
              title={stripeOnboarded ? 'Stripe payouts connected' : 'Stripe payouts not connected — click to finish setup'}
            >
              <span className="stripe-status-tile" aria-hidden="true">$</span>
              <span className="stripe-status-label">
                {stripeOnboarded === null ? 'Checking…' : stripeOnboarded ? 'Stripe' : 'Connect Stripe'}
              </span>
            </Link>
          </div>
        </aside>

        <div className={`app-main app-main-sidenav${showQuoteRequestAlert ? " app-main-alerted" : ""}`} ref={mainRef}>
          {/* THE ? IS GONE. Support lives under Account.

              It floated over all ~35 dashboard pages — top-right on desktop,
              bottom-right on a phone — and a permanent overlay has to earn its
              square inch on every screen it covers, not just the one where
              somebody is stuck. Support is not a per-page action: it is a thing
              you go and find, once, and Account is where you look for the
              things that belong to you rather than to the job in front of you.
              See dashboard/settings#support.

              The theme switch below stays floating, and the difference is the
              point: "I cannot read this screen" is a statement about THIS page
              at THIS moment, and a control for it that lives two taps away in a
              settings page has failed on the occasion it exists for. Wanting
              help is not like that. */}
          {/* LIGHT/DARK, ONE TAP, FROM ANYWHERE. ALWAYS.
              Rendered by the shell because there is no shared page header in
              this app to hang it on: 20 of the ~35 dashboard pages draw their
              own .workspace-hero and the rest — Leads, Jobs, Schedule,
              Messages, Crew, Insights, Quick Stops — have none at all. It is a
              sibling of {children}, exactly like the lead alert below it.

              At every width and on every page: this is the only
              control in the product whose whole job is "I cannot read this
              screen right now", and a control for that which is missing on
              some pages, or only under 1080px, has failed on exactly the
              occasion it exists for. It sits inside the showAppRail branch, so
              a rail is always present for its desktop offset to clear. */}
          <ThemeFab />
          <SmartSearch variant="palette-only" isOpen={isSearchOpen} onOpenChange={setIsSearchOpen} />
          {/* INSIDE the page, above its content. Fixed to the bottom-right it
              covered what you were reading and the controls you'd tap next —
              351x98 of it on a phone — and every dashboard page had to reserve
              14rem of empty space underneath so nothing hid behind it. */}
          {showQuoteRequestAlert ? (
            <aside className={`quote-request-alert${newestLeadHighValue ? ' high-value' : ''}`} role="status" aria-live="polite">
              {/* A 44px target. It sits a thumb's width from "View lead", and
                  the one misfire that matters is dismissing the thing you were
                  being nudged about. */}
              <button type="button" className="quote-request-alert-close" onClick={dismissQuoteRequestAlert} aria-label="Dismiss lead alert">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                  <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />
                </svg>
              </button>
              <p>{newestLeadHighValue ? '🔥 High-value lead — respond now' : 'New lead needs a response'}</p>
              <strong>{newQuoteRequestCount === 1 ? '1 website lead is waiting' : `${newQuoteRequestCount} website leads are waiting`}</strong>
              {newestQuoteRequestAge ? <span>Newest lead received {newestQuoteRequestAge}h ago.</span> : null}
              <Link href={`/dashboard/leads/${newestQuoteRequestId}`} className="btn primary">{newestLeadHighValue ? 'Respond now' : 'View lead'}</Link>
            </aside>
          ) : null}
          {children}
        </div>
      </div>
    );
  }

  // Marketing / public site (homepage, legal, login) — same VERTICAL left rail
  // as the backend so the brand reads consistently. Two things are openly
  // accessible up top (Explore the demo, View templates); below them the FULL app
  // nav is shown but LOCKED — dimmed with a padlock, linking to sign-up — so a
  // prospect can see everything the app offers and that it's gated behind a free
  // account. A signed-in visitor sees the same nav unlocked (real dashboard
  // links). Homeowner transactional pages keep the minimal top bar.
  if (!isTransactional) {
    const byHref = new Map(baseNavItems.map((item) => [item.href, item] as const));
    // A row of the full app nav: a real dashboard link when signed in, otherwise
    // a dimmed, padlocked teaser that routes to sign-up.
    const renderAppLink = (href: string, extraClass = '') => {
      const item = byHref.get(href);
      if (!item) return null;
      const cls = `sidenav-link${extraClass ? ` ${extraClass}` : ''}`;
      if (isLoggedIn) {
        const active = isActiveNav(pathname, href);
        return (
          <Link href={href} key={href} className={`${cls}${active ? ' active' : ''}`} title={item.hint}>
            <NavIcon href={href} />
            <span>{item.label}</span>
          </Link>
        );
      }
      return (
        /* Eighteen of these, and every one used to be a next/link to a bare
           `/login` on the marketing host — a route that exists only to
           redirect, so the router prefetched eighteen redirects on page load
           and logged an error for each before falling back. They point at the
           signup the title already promises, on the host that serves it. */
        <a href={APP_SIGNUP_URL} key={href} className={`${cls} preview`} title="Included — create a free account to use it">
          <NavIcon href={href} />
          <span>{item.label}</span>
          <svg className="sidenav-lock" viewBox="0 0 24 24" aria-hidden="true">
            <rect x="4.8" y="10.5" width="14.4" height="9" rx="2" />
            <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
          </svg>
        </a>
      );
    };
    const brand = <span className="sidenav-wordmark">Let&apos;s Get <span>Quoted</span></span>;

    return (
      /* THE APP PREVIEW IS A DRAWER NOW, NOT FURNITURE.
         ------------------------------------------------------------------
         These are the public pages — /for, /pricing, /faq, /security,
         /resources — and every one of them spent 244px of every desktop
         screen, permanently, on a locked preview of software the reader does
         not have yet. Eighteen padlocked rows competing with the pricing
         narrative, as the audit put it, while the actual site navigation was
         somewhere below them.

         Inverted: the public site is a top bar, and the preview is behind one
         button that says what it is. Nothing is removed — the same rail, the
         same rows, the same "free to unlock" note — it is one tap away instead
         of always there, and the page gets its full width back.

         The signed-in dashboard rail (the branch above) is untouched. That one
         is a tool somebody uses all day and it earns its width. */
      <div className="chrome-shell chrome-shell-public">
        {/* THE FIRST TAB STOP, AND IT HAS TO LIVE HERE.
            The page can't supply this one: the rail is rendered by the shell
            and comes before {children} in the DOM, so a skip link written into
            a page sits AFTER the eighteen rows it exists to skip. Measured on
            /for before this: the first tab stop was the rail's wordmark and the
            page's own link was somewhere past row nineteen. */}
        <a className="skip-link shell-skip-link" href="#app-main">Skip to content</a>

        <header className="public-topbar">
          <Link href={brandHref} className="public-topbar-brand" aria-label="Let&apos;s Get Quoted home">{brand}</Link>
          {/* The real site, on the bar. On a phone it is hidden and the same
              five links are the first thing inside the drawer. */}
          <nav className="public-topbar-nav" aria-label="Site">
            {PUBLIC_NAV.map(([href, label]) => (
              <Link
                key={href}
                href={href}
                className={isActiveNav(pathname, href) ? 'active' : undefined}
              >
                {label}
              </Link>
            ))}
          </nav>
          {/* NAMED FOR WHAT IS BEHIND IT. "Menu" was the old label and the old
              contents were the app nav, which is not a menu of anywhere this
              visitor can go — it is a look at what they would get. */}
          <button
            type="button"
            className="public-topbar-preview"
            onClick={toggleNav}
            aria-expanded={isNavOpen}
            aria-controls="primary-nav"
          >
            <span aria-hidden="true">✦</span> See everything included
          </button>
          <a className="public-topbar-signin" href={APP_LOGIN_URL}>Sign in</a>
          <a className="btn primary public-topbar-cta" href={primaryAction.href}>{primaryAction.label}</a>
          <button
            type="button"
            className="nav-toggle public-topbar-toggle"
            onClick={toggleNav}
            aria-expanded={isNavOpen}
            aria-controls="primary-nav"
          >
            Menu
          </button>
        </header>

        {isNavOpen ? <div className="sidenav-scrim" onClick={closeNav} aria-hidden="true" /> : null}

        <aside
          id="primary-nav"
          ref={railRef}
          className={`sidenav sidenav-drawer${isNavOpen ? ' open' : ''}${!isLoggedIn ? ' marketing-locked' : ''}`}
          aria-label="Everything included"
        >
          <Link href={brandHref} className="sidenav-brand" aria-label="Let&apos;s Get Quoted home">{brand}</Link>
          {/* Escape and a tap outside both closed the drawer already, and
              neither is visible. This is. Rendered only while the drawer is
              open, so it never appears on the docked desktop rail. */}
          {isNavOpen ? (
            <button type="button" className="sidenav-close" onClick={closeNav}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />
              </svg>
              <span className="sr-only">Close menu</span>
            </button>
          ) : null}

          {/* THE PUBLIC SITE, FIRST.
              This rail replaces the marketing header on every page it wraps —
              /for, /pricing, /faq, /security, /resources — and it used to open
              with a locked preview of the app. So Features, Pricing and How it
              works existed on those pages only in the footer, which on /for is
              7,200px down on a phone. A visitor on the pricing page had no way
              to reach the features it was pricing.

              Above the app preview, because these are the pages a logged-out
              visitor is actually entitled to open. */}
          {!isLoggedIn ? (
            <nav className="sidenav-public" aria-label="Site">
              <p className="sidenav-glabel">The site</p>
              {PUBLIC_NAV.map(([href, label]) => (
                <Link
                  key={href}
                  href={href}
                  className={`sidenav-public-link${isActiveNav(pathname, href) ? ' active' : ''}`}
                >
                  {label}
                </Link>
              ))}
            </nav>
          ) : null}

          {/* Openly accessible — try before you sign up. */}
          <div className="sidenav-try">
            <Link href="/demo" className={`sidenav-try-link${pathname.startsWith('/demo') ? ' active' : ''}`}>
              <span className="sidenav-try-ic" aria-hidden="true">▶</span>
              <span>Explore the demo</span>
            </Link>
            <Link href="/demo/sites" className="sidenav-try-link">
              <span className="sidenav-try-ic" aria-hidden="true">✦</span>
              <span>View site templates</span>
            </Link>
          </div>

          {/* The full app — grouped exactly like the backend rail (Work / Team /
              Money / Grow), locked with a padlock until sign-in. */}
          <nav className="sidenav-nav" aria-label={isLoggedIn ? 'Your workspace' : 'The full app'}>
            {isLoggedIn ? (
              <p className="sidenav-glabel">Your workspace</p>
            ) : (
              // "Locked — sign in to unlock" reads as a gate on something the
              // visitor was already entitled to. They are browsing a product
              // they have not bought; the honest framing is that this is a
              // preview of what is included.
              <p className="sidenav-glabel sidenav-lockhdr"><span aria-hidden="true">✦</span> Preview everything included</p>
            )}
            {NAV_GROUPS.map((group) => (
              <div className={`sidenav-group sidenav-group--${group.accent}`} key={group.label}>
                <p className="sidenav-glabel">{group.label}</p>
                {group.hrefs.map((href) => renderAppLink(href))}
              </div>
            ))}
            <div className="sidenav-group">
              <p className="sidenav-glabel">Site</p>
              {renderAppLink('/dashboard/sites')}
            </div>
            {/* Last here too — this rail is grouped exactly like the backend
                one on purpose, and a Dashboard row in a different place would
                be the one thing that did not match. */}
            {renderAppLink('/dashboard', 'sidenav-bottom')}
          </nav>

          <div className="sidenav-foot">
            <div className="sidenav-fcard">{renderAppLink('/dashboard/settings')}</div>
            {!isLoggedIn ? (
              <>
                <p className="sidenav-locknote"><span aria-hidden="true">🔒</span> Free to unlock — no card required.</p>
                {!pathname.startsWith('/login') ? (
                  <>
                    {/* A plain anchor: the destination is another host, so
                        next/link has nothing to prefetch or client-navigate,
                        and the router should not touch the click. */}
                    <a href={primaryAction.href} className="btn primary sidenav-marketing-cta">
                      {primaryAction.label}
                    </a>
                    <a href={APP_LOGIN_URL} className="sidenav-marketing-login">
                      Already have an account? <strong>Log in</strong>
                    </a>
                  </>
                ) : null}
              </>
            ) : null}
          </div>
        </aside>

        {/* tabIndex -1 so the skip link can actually put focus here; without
            it the browser scrolls to the target and leaves focus behind, which
            means the next Tab lands back at the top of the rail. */}
        <div id="app-main" tabIndex={-1} className={`app-main app-main-public${showQuoteRequestAlert ? " app-main-alerted" : ""}`}>
          <ThemeFab />
          {children}
        </div>
      </div>
    );
  }

  return (
    <div className="chrome-shell">
      <header className="topbar">
        <div className="topbar-inner">
          <Link
            href={brandHref}
            className={`brand-mark${isDashboard && isLoggedIn ? ' brand-mark-compact' : ''}`}
            aria-label="Let&apos;s Get Quoted home"
          >
            {/* The mark every HOMEOWNER sees. This bar is the chrome on the
                client job dashboard, an invoice and a payment page, and it was
                still carrying /SITE-LOGO-1.png — a green-and-yellow lockup from
                a previous brand that matches nothing else in the product. */}
            <BrandLogo className="brand-logo-img" size={34} />
            <strong className="brand-title">LET&apos;S GET QUOTED</strong>
          </Link>

          {isDashboard && isLoggedIn ? (
            <Link
              href="/dashboard/sites"
              className={`website-nav-badge${sitePublished ? ' live' : ''}`}
              title={sitePublished ? `Your website is live${siteHost ? ` at ${siteHost}` : ''} — manage it` : 'Build your free contractor website'}
            >
              {sitePublished ? (
                <>
                  <span className="website-nav-signal" aria-hidden="true"><i /><i /><i /></span>
                  {siteHost ? (
                    <span className="website-nav-live-text">
                      <span className="website-nav-live-top">
                        <span className="website-nav-live-label">Website: Live</span>
                        <span className="website-nav-live-edit">(edit)</span>
                      </span>
                      <span className="website-nav-live-host">{siteHost}</span>
                    </span>
                  ) : (
                    'Website: Live'
                  )}
                </>
              ) : (
                <>
                  <span aria-hidden="true">✨</span> Build your Website
                </>
              )}
            </Link>
          ) : null}

          {isDashboard && isLoggedIn ? (
            <Link
              href={STRIPE_SETUP_HREF}
              className={`stripe-status-pill topbar-stripe${stripeOnboarded === null ? ' checking' : stripeOnboarded ? ' connected' : ' warning'}`}
              title={stripeOnboarded ? 'Stripe payouts connected' : 'Stripe payouts not connected — click to finish setup'}
            >
              {/* A constant "$" mark — the state is carried by the tile color AND
                  the label wording ("connected" / "Connect" / "checking"), so it
                  never depends on color alone. */}
              <span className="stripe-status-tile" aria-hidden="true">$</span>
              {stripeOnboarded === null ? 'Stripe: checking…' : stripeOnboarded ? 'Stripe connected' : 'Connect Stripe'}
            </Link>
          ) : null}

          <button
            type="button"
            className="nav-toggle"
            onClick={toggleNav}
            aria-expanded={isNavOpen}
            aria-controls="primary-nav"
          >
            Menu
          </button>

          <div className={`nav-panel${isNavOpen ? ' open' : ''}`} id="primary-nav">
            <nav className="topnav" aria-label="Primary">
              {navItems.map((item) => {
                const active = item.href === '/' ? pathname === item.href : pathname.startsWith(item.href);
                const flowClass = FLOW_CLASS[item.href] ?? '';

                return (
                  <Link
                    href={item.href}
                    className={`topnav-link${active ? ' active' : ''}${flowClass}`}
                    key={item.href}
                    title={item.hint}
                  >
                    {item.label}
                    {/* The same three counts the rail draws, in a different
                        component — which is why the wording comes from one
                        place rather than being typed out twice. */}
                    {[
                      ['/dashboard/leads', newQuoteRequestCount],
                      ['/dashboard/jobs', jobsNeedingAttentionCount],
                      ['/dashboard/schedule', unscheduledJobCount],
                      ['/dashboard/quick-stops', openQuickStopCount],
                    ].map(([href, n]) =>
                      item.href === href && (n as number) > 0 ? (
                        <span className="topnav-count" key={href as string} title={navAttentionLabel(href as string, n as number) ?? undefined}>
                          <span aria-hidden="true">{attentionDigits(href as string, n as number)}</span>
                          <span className="sr-only">{navAttentionLabel(href as string, n as number)}</span>
                        </span>
                      ) : null,
                    )}
                  </Link>
                );
              })}
            </nav>

            {!isDashboard && !pathname.startsWith('/login') && !isLoggedIn ? (
              <a href={primaryAction.href} className="btn primary topbar-cta">
                {primaryAction.label}
              </a>
            ) : null}
          </div>
        </div>
      </header>

      {/* In the flow at the top of the page, not floating over the bottom of it.
          Fixed, it covered the content you were reading and the controls you'd
          tap next — and it reserved 14rem of empty page underneath so the
          footer could clear it, on a page that was already five screens tall.
          Same urgency, none of the obstruction. */}
      {showQuoteRequestAlert ? (
        <aside className={`quote-request-alert${newestLeadHighValue ? ' high-value' : ''}`} role="status" aria-live="polite">
          {/* A 44px target, not 27. This sits a thumb's width from "View lead",
              and the one misfire that matters is dismissing the thing you were
              being nudged about. */}
          <button type="button" className="quote-request-alert-close" onClick={dismissQuoteRequestAlert} aria-label="Dismiss lead alert">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
              <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />
            </svg>
          </button>
          <p>{newestLeadHighValue ? '🔥 High-value lead — respond now' : 'New lead needs a response'}</p>
          <strong>{newQuoteRequestCount === 1 ? '1 website lead is waiting' : `${newQuoteRequestCount} website leads are waiting`}</strong>
          {newestQuoteRequestAge ? <span>Newest lead received {newestQuoteRequestAge}h ago.</span> : null}
          <Link href={`/dashboard/leads/${newestQuoteRequestId}`} className="btn primary">{newestLeadHighValue ? 'Respond now' : 'View lead'}</Link>
        </aside>
      ) : null}

      <div className={`app-main${showQuoteRequestAlert ? " app-main-alerted" : ""}`}>{children}</div>
    </div>
  );
}