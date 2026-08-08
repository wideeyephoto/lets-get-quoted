/* eslint-disable @next/next/no-img-element */
/* The flagship reproduction's own header, footer and closing CTA.
   Copied from the source site; only the nav hrefs move, to routes this app
   actually has. Shared by the homepage and every marketing page under it. */
"use client";

import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';

const SIGNUP_URL = 'https://app.letsgetquoted.com/';

/**
 * Is somebody already signed in?
 *
 * AppShell stands aside on every route that draws this header, so on those
 * pages this component IS the navigation — and it was offering a contractor
 * with an account a button reading "Build my free site", with no way back into
 * the product from the address they are most likely to type.
 *
 * Read the same way AppShell reads it (a client-side session check plus the
 * auth listener), because these are static marketing pages with no server-side
 * per-request auth to thread through. Starts false, so the logged-out render —
 * which is nearly all of the traffic — is what the server sends and what the
 * first paint shows; a signed-in owner sees the swap a moment later rather
 * than a flash of the wrong thing.
 */
function useSignedIn(): boolean {
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    let live = true;
    supabase.auth.getSession().then(({ data }) => {
      if (live) setSignedIn(!!data.session);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) =>
      setSignedIn(!!session),
    );
    return () => {
      live = false;
      listener.subscription.unsubscribe();
    };
  }, []);
  return signedIn;
}

/**
 * One list, used by the header, the mobile menu and the footer.
 *
 * The header used to say "Product" where the footer said "Features" and the
 * page it leads to is titled "Features" — three names for one destination.
 */
const NAV = [
  ['/features', 'Features'],
  ['/how-it-works', 'How it works'],
  ['/for', 'For your trade'],
  ['/pricing', 'Pricing'],
  ['/founder', 'Founder'],
] as const;

/**
 * The mark.
 *
 * The 2126x740 master is still in /public — it is what these are generated
 * from (scripts/generate-logo-assets.mjs) — but it is not what gets served.
 * At 805KB it was the heaviest asset on the marketing site by an order of
 * magnitude, downloaded on every page to paint a 227px-wide image. The WebP
 * is 13.4KB.
 *
 * width/height are the intrinsic dimensions of the 2x asset, so the browser
 * knows the aspect ratio before the bytes arrive and the header does not
 * reflow. .brand-logo's own rules still do the cropping.
 */
function BrandMark() {
  return (
    <picture>
      <source srcSet="/lets-get-quoted-logo.webp" type="image/webp" />
      <img src="/lets-get-quoted-logo.png" alt="Let’s Get Quoted" width={460} height={160} />
    </picture>
  );
}

export function SiteHeader() {
  const signedIn = useSignedIn();
  const [open, setOpen] = useState(false);

  /* The nav is display:none below 760px, and until now nothing replaced it.
     Pricing, How it works, For your trade and Founder existed on a phone only
     in the footer — 18,000px down the homepage. This is the drawer.

     Escape closes it, because a panel that covers the page and traps you in it
     is worse than no panel. The body scroll lock stops the page drifting
     underneath the open menu. */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open]);

  const cta = signedIn
    ? { href: '/dashboard', label: 'Dashboard' }
    : { href: SIGNUP_URL, label: 'Build my free site' };

  return (
    <header className="site-header" data-menu={open ? 'open' : 'closed'}>
      <a className="brand brand-logo" href="/" aria-label="Let’s Get Quoted home">
        <BrandMark />
      </a>
      <nav aria-label="Main navigation">
        {NAV.map(([href, label]) => <a key={href} href={href}>{label}</a>)}
      </nav>
      <a className="header-cta" href={cta.href}>{cta.label} <span>→</span></a>
      <button
        type="button"
        className="nav-toggle"
        aria-expanded={open}
        aria-controls="site-menu"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="nav-toggle-bars" aria-hidden="true"><i /><i /><i /></span>
        <span className="sr-only">{open ? 'Close menu' : 'Open menu'}</span>
      </button>

      {/* `hidden` rather than a CSS-only hide: a closed menu must be out of the
          tab order and out of the accessibility tree, not merely invisible. */}
      <div className="site-menu" id="site-menu" hidden={!open}>
        <nav aria-label="Site">
          {NAV.map(([href, label]) => (
            <a key={href} href={href} onClick={() => setOpen(false)}>{label}</a>
          ))}
        </nav>
        <a className="site-menu-cta" href={cta.href}>{cta.label} <span>→</span></a>
      </div>
    </header>
  );
}

/**
 * When the fixed mobile bar should NOT be on screen.
 *
 * Two cases, and they are the same mistake at opposite ends of the page:
 * offering a button that is already there.
 *
 *   - The first screen on a phone carried three "Build my free site" buttons —
 *     the header's, the hero's, and this bar. The homepage already suppressed
 *     the bar while its own hero CTA was in view; /features did not, so it
 *     showed all three.
 *   - At the bottom, the closing CTA band IS the ask, full width, and the bar
 *     floated on top of it and then on top of the footer links.
 *
 * Watching the page's own elements rather than scroll offsets, so this keeps
 * working when a section is added, removed or reordered — which has happened
 * twice to the homepage this week.
 */
function useMobileBarVisibility() {
  const barRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    const bar = barRef.current;
    if (!bar || !('IntersectionObserver' in window)) return;

    // The whole hero, not just its button. On /how-it-works the hero CTA sits
    // under a 400px graphic, so on a phone it is below the fold — the bar
    // decided it was needed and covered the graphic instead. Every hero on this
    // site carries its own CTA, so while any part of one is on screen the bar
    // has nothing to add. Matched positionally rather than by class so a new
    // page does not have to remember to opt in.
    const zones = [
      document.querySelector('main > section'),
      ...document.querySelectorAll('.final-cta, .page-cta'),
      ...document.querySelectorAll('footer'),
    ].filter((el): el is Element => !!el && el !== bar);
    if (!zones.length) return;

    const showing = new Set<Element>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) showing.add(e.target);
          else showing.delete(e.target);
        }
        bar.setAttribute('data-redundant', showing.size ? 'true' : 'false');
      },
      { threshold: 0 },
    );
    zones.forEach((z) => io.observe(z));
    return () => io.disconnect();
  }, []);

  return barRef;
}

export function SiteFooter() {
  const signedIn = useSignedIn();
  const barRef = useMobileBarVisibility();
  return (
    <>
      {/* Same reasoning as the header's: on a phone this bar is the only
          persistent control on the page, and "Build my free site" is the wrong
          offer for somebody who has already built one. */}
      {signedIn ? (
        <a className="mobile-cta" ref={barRef} data-redundant="true" href="/dashboard">Go to my dashboard <span>→</span></a>
      ) : (
        <a className="mobile-cta" ref={barRef} data-redundant="true" href={SIGNUP_URL}>Build my free site <span>→</span></a>
      )}
      <footer>
        <a className="brand brand-logo footer-logo" href="/" aria-label="Let’s Get Quoted home">
          <BrandMark />
        </a>
        <p className="footer-links">
          {NAV.map(([href, label]) => <a key={href} href={href}>{label}</a>)}
        </p>
        <span>© 2026 Let’s Get Quoted</span>
      </footer>
    </>
  );
}

export function PageCTA({
  kicker = "THE FULL CONTRACTOR SUITE IS READY",
  title = "Build the front door. Connect everything behind it.",
  body = "Create your site, qualify better leads and run every job from one place.",
}: {
  kicker?: string;
  title?: string;
  body?: string;
}) {
  return (
    <section className="page-cta">
      <div className="cta-rays" />
      <p className="eyebrow"><span>✦</span> {kicker}</p>
      <h2>{title}</h2>
      <p>{body}</p>
      <a className="button primary light" href="https://app.letsgetquoted.com/">Build my free site <span>→</span></a>
      <small>No card required · No monthly subscription</small>
    </section>
  );
}
