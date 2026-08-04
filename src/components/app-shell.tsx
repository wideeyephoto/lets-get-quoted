'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { useAppShell } from './app-shell-provider';
import { NavIcon } from './nav-icons';
import ActionIcon from './action-icon';
import ThemeToggle from './theme-toggle';
import { supabase } from '@/lib/supabase';
import { isSectionNew, markNavSeen, parseNavSeen, settingsTabEvent, NAV_SEEN_STORAGE_KEY, type NavSeenMap } from '@/lib/nav-helpers';

// Order follows the pipeline (Leads -> Jobs -> Schedule) with Crew, a resource,
// after the stages instead of splitting them. `hint` surfaces the vocabulary
// each stage owns (quotes/invoices/payments live inside Jobs) as a hover title.
const baseNavItems: { href: string; label: string; hint?: string }[] = [
  { href: '/', label: 'Home' },
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/dashboard/leads', label: 'Leads', hint: 'New & website leads' },
  { href: '/dashboard/jobs', label: 'Jobs', hint: 'Quotes · Invoices · Payments' },
  { href: '/dashboard/clients', label: 'Clients', hint: 'Customer profiles & history' },
  { href: '/dashboard/schedule', label: 'Schedule', hint: 'Calendar & unscheduled work' },
  { href: '/dashboard/schedule/booking', label: 'Online Booking', hint: 'Your public booking page & availability' },
  { href: '/dashboard/quick-stops', label: 'Quick Stops', hint: 'Same-day route add-ons' },
  { href: '/dashboard/recurring', label: 'Recurring', hint: 'Repeating jobs & auto-billing' },
  { href: '/dashboard/cash-flow', label: 'Cash flow', hint: 'Upcoming bills, payroll & projected balance' },
  { href: '/dashboard/services', label: 'Price book', hint: 'Saved services & prices' },
  // Crew and hours are one destination, not two. They were split across a
  // "Crew" page and a "Payroll" page that could only be reached from a link
  // buried in the roster header — and neither could answer "who worked, on
  // what, for how much" without a page load between the halves.
  { href: '/dashboard/crew', label: 'Crew & Labor', hint: 'Your team, their hours & pay' },
  { href: '/dashboard/messages', label: 'Messages', hint: 'Two-way customer texts' },
  // One destination, not two. "Marketing" (the composer) and "Calendar" (the
  // seasonal topics) were the same workflow split across two pages that linked
  // to each other in both directions — and the nav item called "Calendar" sat
  // four rows under Schedule, which is the actual calendar.
  { href: '/dashboard/marketing', label: 'Marketing', hint: 'Seasonal topics, email & text campaigns' },
  { href: '/dashboard/rebook', label: 'Rebook', hint: 'Win back past customers' },
  { href: '/dashboard/insights', label: 'Insights', hint: 'Funnel & revenue trends' },
  { href: '/dashboard/reviews', label: 'Reviews', hint: 'Ratings & private feedback' },
  { href: '/dashboard/sites', label: 'Website' },
  { href: '/dashboard/settings', label: 'Account' },
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
// list. Dashboard (home) sits above the groups; Website is promoted to its own
// badge and Account drops to the sidebar footer, so neither appears here.
const NAV_GROUPS: { label: string; hrefs: string[] }[] = [
  { label: 'Work', hrefs: ['/dashboard/leads', '/dashboard/jobs', '/dashboard/schedule', '/dashboard/schedule/booking', '/dashboard/quick-stops', '/dashboard/clients'] },
  { label: 'Team', hrefs: ['/dashboard/crew'] },
  { label: 'Money', hrefs: ['/dashboard/cash-flow', '/dashboard/recurring', '/dashboard/services', '/dashboard/insights'] },
  { label: 'Grow', hrefs: ['/dashboard/messages', '/dashboard/marketing', '/dashboard/rebook', '/dashboard/reviews'] },
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
  /** Leads still being worked — excludes won (now a job) and lost. */
  openLeadCount: number;
  /** Live work only — excludes completed and archived. */
  activeJobCount: number;
  newestQuoteRequestId: string | null;
  newestQuoteRequestCreatedAt: string | null;
  newestQuoteRequestHighValue: boolean;
  /** When the newest live job arrived — drives the rail's "New" badge. */
  newestJobCreatedAt: string | null;
  /** Whether Quick Stop is accepting same-day work right now. */
  quickStopState: NavState;
  /** Whether the public booking page is actually live. */
  bookingState: NavState;
};

// Whether an automation is actually accepting work right now. 'paused' is the
// case that matters most: the owner's switch says on, but something else means
// nothing is really on offer. Green there would say the opposite of the truth,
// and OFF would blame the owner for something they did not do.
export type NavState = 'on' | 'off' | 'paused' | 'unknown';

// Nav entries that carry their own on/off state. The WORD is the state and the
// colour only agrees with it, so it still reads without colour vision.
const NAV_STATE_PILL: Record<string, Record<Exclude<NavState, 'unknown'>, { label: string; title: string }>> = {
  '/dashboard/quick-stops': {
    on: { label: 'ON', title: 'Quick Stops is ON — customers can ask to be squeezed into today' },
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

function getPrimaryAction() {
  return { href: '/login', label: 'Create Free Account' };
}

export function AppShell({ children, forceStandaloneSite = false }: { children: ReactNode; forceStandaloneSite?: boolean }) {
  const pathname = usePathname();
  const { isNavOpen, closeNav, toggleNav } = useAppShell();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [stripeOnboarded, setStripeOnboarded] = useState<boolean | null>(null);
  const [sitePublished, setSitePublished] = useState(false);
  const [siteUrl, setSiteUrl] = useState<string | null>(null);
  const [businessName, setBusinessName] = useState<string | null>(null);
  const [newMenuOpen, setNewMenuOpen] = useState(false);
  const newMenuRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLElement>(null);
  const [newQuoteRequestCount, setNewQuoteRequestCount] = useState(0);
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);
  const [jobsNeedingAttentionCount, setJobsNeedingAttentionCount] = useState(0);
  const [unscheduledJobCount, setUnscheduledJobCount] = useState(0);
  const [openLeadCount, setOpenLeadCount] = useState(0);
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
  const [dismissedQuoteRequestId, setDismissedQuoteRequestId] = useState<string | null>(null);
  const isDashboard = pathname.startsWith('/dashboard');
  // Homeowner-facing transactional pages (paying, approving a quote, an invoice)
  // stay on the minimal top bar — a big marketing rail there would be off-key.
  const isTransactional = pathname.startsWith('/pay') || pathname.startsWith('/client') || pathname.startsWith('/invoice') || pathname.startsWith('/track');
  // First run (/welcome) renders bare — see the early return below.
  const isFirstRun = pathname === '/welcome';
  // A signed-in contractor gets the FULL dashboard rail on every app/marketing
  // page (incl. the homepage) — same live counts, Website badge, New button and
  // Stripe pill as inside /dashboard — never the logged-out marketing teaser.
  const showAppRail = isLoggedIn && !isTransactional;
  const primaryAction = getPrimaryAction();
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
    setNewMenuOpen(false);
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
    const drawer = window.matchMedia('(max-width: 900px)');
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

  // The "+ New" menu closes on outside click or Escape. On open, focus moves to
  // the first item; on Escape it returns to the trigger.
  useEffect(() => {
    if (!newMenuOpen) return;
    newMenuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const onPointerDown = (event: MouseEvent) => {
      if (newMenuRef.current && !newMenuRef.current.contains(event.target as Node)) setNewMenuOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setNewMenuOpen(false);
        newMenuRef.current?.querySelector<HTMLElement>('.sidenav-new')?.focus();
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [newMenuOpen]);

  // Arrow keys move focus between "+ New" menu items (wrapping).
  function onNewMenuKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const items = Array.from(newMenuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
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
            setOpenLeadCount(Number(data.openLeadCount ?? 0));
            setActiveJobCount(Number(data.activeJobCount ?? 0));
            setNewestQuoteRequestId(data.newestQuoteRequestId ?? null);
            setNewestQuoteRequestCreatedAt(data.newestQuoteRequestCreatedAt ?? null);
            setNewestLeadHighValue(Boolean(data.newestQuoteRequestHighValue));
            setNewestJobCreatedAt(data.newestJobCreatedAt ?? null);
            setQuickStopState(navState(data.quickStopState));
            setBookingState(navState(data.bookingState));
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

  // A contractor's public booking page wears THEIR brand, not ours (see
  // book/[subdomain]/BookingChrome.tsx). This shell has no business around it:
  // a homeowner was being shown the whole locked app nav — eighteen padlocked
  // rows of a CRM they will never own — with "Create Free Account" as the
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
    };
    // Inventory beside attention. The filled circle has always meant "these
    // need you today" and stays that way; the hollow one is simply how much is
    // in the pipeline, so a quiet day reads as 0 needing you out of 12 open
    // rather than as an empty rail.
    const totalByHref: Record<string, { count: number; title: string }> = {
      '/dashboard/leads': { count: openLeadCount, title: `${openLeadCount} open lead${openLeadCount === 1 ? '' : 's'} (won and lost not counted)` },
      '/dashboard/jobs': { count: activeJobCount, title: `${activeJobCount} live job${activeJobCount === 1 ? '' : 's'} (completed and archived not counted)` },
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
          className={`sidenav-link${brand ? ' sidenav-link-brand' : ''}${extraClass ? ` ${extraClass}` : ''}${active ? ' active' : ''}`}
          // Also on the row, not just the pill inside it, so the row can carry
          // the state's colour without CSS having to reach into a child with
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
          {isNew ? <span className="sidenav-unseen" title={newLabelByHref[href]}>New</span> : null}
          {count > 0 ? <span className="sidenav-count">{count}</span> : null}
          {total && total.count > 0 ? (
            <span className="sidenav-total" title={total.title}>{total.count}</span>
          ) : null}
        </Link>
      );
    };

    return (
      <div className="chrome-shell chrome-shell-sidenav">
        <header className="sidenav-mobilebar">
          <Link href={brandHref} className="sidenav-brand" aria-label="Let&apos;s Get Quoted home">
            <span className="sidenav-wordmark">Let&apos;s Get <span>Quoted</span></span>
          </Link>
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
              <div className="sidenav-new-wrap" ref={newMenuRef}>
                <button
                  type="button"
                  className="sidenav-new"
                  aria-haspopup="menu"
                  aria-expanded={newMenuOpen}
                  aria-controls="sidenav-new-menu"
                  onClick={() => setNewMenuOpen((open) => !open)}
                >
                  <span className="sidenav-new-plus" aria-hidden="true">+</span> New
                  <span className={`sidenav-new-caret${newMenuOpen ? ' open' : ''}`} aria-hidden="true">▾</span>
                </button>
                {newMenuOpen ? (
                  <div className="sidenav-new-menu" id="sidenav-new-menu" role="menu" onKeyDown={onNewMenuKeyDown}>
                    <Link href="/dashboard/jobs?new=1#new-job" role="menuitem" className="sidenav-new-item" onClick={() => setNewMenuOpen(false)}>
                      <NavIcon href="/dashboard/jobs" />
                      New job
                    </Link>
                    <Link href="/dashboard/leads?add=1#add-lead" role="menuitem" className="sidenav-new-item" onClick={() => setNewMenuOpen(false)}>
                      <NavIcon href="/dashboard/leads" />
                      New lead
                    </Link>
                    {/* The two records you create without a job in front of you:
                        a customer you met, and somebody you hired. Both land on
                        their own page with the add form already open, the same
                        way the two above do. */}
                    <Link href="/dashboard/clients?add=1" role="menuitem" className="sidenav-new-item" onClick={() => setNewMenuOpen(false)}>
                      <NavIcon href="/dashboard/clients" />
                      New client
                    </Link>
                    <Link href="/dashboard/crew?add=1" role="menuitem" className="sidenav-new-item" onClick={() => setNewMenuOpen(false)}>
                      <NavIcon href="/dashboard/crew" />
                      New crew member
                    </Link>
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <Link
            href="/dashboard/sites"
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
              <div className="sidenav-group" key={group.label}>
                <p className="sidenav-glabel">{group.label}</p>
                {group.hrefs.map((href) => renderSideLink(href))}
              </div>
            ))}
            {/* Dashboard closes the rail rather than opening it. It is the
                summary of everything above, not a step before any of it, and at
                the top it took the first slot from Leads — which is where the
                day actually starts. */}
            {renderSideLink('/dashboard', 'sidenav-bottom')}
            {/* Under Dashboard, inside the scrolling list rather than pinned to
                the footer: it is a preference, not a destination, and the footer
                is for the account and its billing state. */}
            <ThemeToggle />
          </nav>

          <div className="sidenav-foot">
            <div className="sidenav-fcard">
              {renderSideLink('/dashboard/settings')}
              <Link
                href="/dashboard/settings#automations"
                className="sidenav-sublink"
                // Already on Settings: switch the tab directly rather than
                // relying on the URL changing. Next navigates with pushState,
                // which never fires hashchange — and if the hash is already
                // #automations (clicking the tab writes it there) there is no
                // change to observe at all. Both cases made this link do
                // nothing. See lib/nav-helpers.
                onClick={(event) => {
                  if (pathname !== '/dashboard/settings') return;
                  event.preventDefault();
                  history.replaceState(null, '', '/dashboard/settings#automations');
                  window.dispatchEvent(settingsTabEvent('automations'));
                }}
              >
                <span className="sidenav-subtick" aria-hidden="true" />
                Automations
              </Link>
            </div>
            <Link
              href={STRIPE_SETUP_HREF}
              className={`stripe-status-pill sidenav-stripe${stripeOnboarded === null ? ' checking' : stripeOnboarded ? ' connected' : ' warning'}`}
              title={stripeOnboarded ? 'Stripe payouts connected' : 'Stripe payouts not connected — click to finish setup'}
            >
              <span className="stripe-status-tile" aria-hidden="true">$</span>
              {stripeOnboarded === null ? 'Stripe: checking…' : stripeOnboarded ? 'Stripe connected' : 'Connect Stripe'}
            </Link>
          </div>
        </aside>

        {showQuoteRequestAlert ? (
          <aside className="quote-request-alert" role="status" aria-live="polite">
            <button type="button" className="quote-request-alert-close" onClick={dismissQuoteRequestAlert} aria-label="Dismiss lead alert">x</button>
            <p>New lead needs a response</p>
            <strong>{newQuoteRequestCount === 1 ? '1 website lead is waiting' : `${newQuoteRequestCount} website leads are waiting`}</strong>
            {newestQuoteRequestAge ? <span>Newest lead received {newestQuoteRequestAge}h ago.</span> : null}
            <Link href={`/dashboard/leads/${newestQuoteRequestId}`} className="btn primary">View lead</Link>
          </aside>
        ) : null}

        <div className={`app-main app-main-sidenav${showQuoteRequestAlert ? " app-main-alerted" : ""}`}>{children}</div>
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
        <Link href="/login" key={href} className={`${cls} preview`} title="Create a free account to unlock this">
          <NavIcon href={href} />
          <span>{item.label}</span>
          <svg className="sidenav-lock" viewBox="0 0 24 24" aria-hidden="true">
            <rect x="4.8" y="10.5" width="14.4" height="9" rx="2" />
            <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
          </svg>
        </Link>
      );
    };
    const brand = <span className="sidenav-wordmark">Let&apos;s Get <span>Quoted</span></span>;

    return (
      <div className="chrome-shell chrome-shell-sidenav">
        <header className="sidenav-mobilebar">
          <Link href={brandHref} className="sidenav-brand" aria-label="Let&apos;s Get Quoted home">{brand}</Link>
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

        <aside id="primary-nav" ref={railRef} className={`sidenav${isNavOpen ? ' open' : ''}${!isLoggedIn ? ' marketing-locked' : ''}`} aria-label="Primary">
          <Link href={brandHref} className="sidenav-brand" aria-label="Let&apos;s Get Quoted home">{brand}</Link>

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
              <p className="sidenav-glabel sidenav-lockhdr"><span aria-hidden="true">🔒</span> Locked — sign in to unlock</p>
            )}
            {NAV_GROUPS.map((group) => (
              <div className="sidenav-group" key={group.label}>
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
                    <Link href={primaryAction.href} className="btn primary sidenav-marketing-cta">
                      {primaryAction.label}
                    </Link>
                    <Link href="/login" className="sidenav-marketing-login">
                      Already have an account? <strong>Log in</strong>
                    </Link>
                  </>
                ) : null}
              </>
            ) : null}
          </div>
        </aside>

        <div className={`app-main app-main-sidenav${showQuoteRequestAlert ? " app-main-alerted" : ""}`}>{children}</div>
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
            <Image src="/SITE-LOGO-1.png" alt="Let's Get Quoted" width={160} height={33} className="brand-logo-img" priority />
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
              {/* A constant "$" mark — the state is carried by the tile colour AND
                  the label wording ("connected" / "Connect" / "checking"), so it
                  never depends on colour alone. */}
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
                    {item.href === '/dashboard/leads' && newQuoteRequestCount > 0 ? <span className="topnav-count">{newQuoteRequestCount}</span> : null}
                    {item.href === '/dashboard/jobs' && jobsNeedingAttentionCount > 0 ? <span className="topnav-count">{jobsNeedingAttentionCount}</span> : null}
                    {item.href === '/dashboard/schedule' && unscheduledJobCount > 0 ? <span className="topnav-count">{unscheduledJobCount}</span> : null}
                  </Link>
                );
              })}
            </nav>

            {!isDashboard && !pathname.startsWith('/login') && !isLoggedIn ? (
              <Link href={primaryAction.href} className="btn primary topbar-cta">
                {primaryAction.label}
              </Link>
            ) : null}
          </div>
        </div>
      </header>

      {showQuoteRequestAlert ? (
        <aside className={`quote-request-alert${newestLeadHighValue ? ' high-value' : ''}`} role="status" aria-live="polite">
          <button type="button" className="quote-request-alert-close" onClick={dismissQuoteRequestAlert} aria-label="Dismiss lead alert">x</button>
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