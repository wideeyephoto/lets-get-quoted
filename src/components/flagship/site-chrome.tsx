/* eslint-disable @next/next/no-img-element */
/* The flagship reproduction's own header, footer and closing CTA.
   Copied from the source site; only the nav hrefs move, to routes this app
   actually has. Shared by the homepage and every marketing page under it. */
"use client";

import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { FOOTER_LEGAL, FOOTER_PRIMARY } from '@/components/marketing/footer-nav';
import MarketingAiAssistant from '@/components/marketing/MarketingAiAssistant';
import styles from './flagship.module.css';

/**
 * THE APP HOST IS PART OF THE URL ON PURPOSE. A session cookie belongs to
 * exactly one host, and middleware bounces anything session-bearing to the
 * canonical one — so linking to a bare path from the marketing site would send
 * people through a redirect on every attempt.
 *
 * AND THE PATH MATTERS. Both of these used to point at the app ROOT, which
 * lands on the sign-in screen: "Create free account" took a brand-new visitor
 * to a form headed "Sign in", with the actual signup one more click away behind
 * "New here?". The signup screen is the same route with an intent.
 */
export const SIGNUP_URL = 'https://app.letsgetquoted.com/start?goal=build_site&source=nav';
const LOGIN_URL = 'https://app.letsgetquoted.com/login';

/**
 * ONE PROMISE, EVERYWHERE ON THIS SITE.
 *
 * A visitor working down /features met four different offers: the header said
 * "Create free account", the hero said "Build my free site", the closing band
 * said "Build my free site" again but pointed somewhere else, and the phone bar
 * said "Create free account". Two of those were the same thing under different
 * names and two of them were the same name pointing at different URLs — the
 * hero's and the closing band's went to the app ROOT, which is the sign-in
 * screen, while the header's went to signup.
 *
 * "Build my free site" wins over "Create free account" because it names what
 * happens next rather than what gets created, and because it is what the two
 * largest buttons on the page already said. Exported so no page has to retype
 * either half of the pair.
 */
export const SIGNUP_LABEL = 'Build my free site';

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
/* WEBSITE SITS NEXT TO FEATURES, not inside it. It is a subset of Features and
   is deliberately promoted out of it: the site is the thing most people arrive
   looking for, the homepage's own headline is about it, and until now the only
   way to reach that page from the chrome was to go to Features first and find
   it among five cards. Second rather than first, so the general list still
   reads before the specific offer. */
const NAV = [
  ['/features', 'Product'],
  /* "Website" and not "Website + video", which it was for one release. The
     video studio is real and worth selling, but a nav label names the
     destination, and the destination is a website builder — the page behind it
     sells video in a benefit and an answer, which is the right weight for a
     feature of the thing rather than the thing. */
  ['/features/website-builder', 'Website'],
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
  const toggleRef = useRef<HTMLButtonElement>(null);
  const wasOpenRef = useRef(false);

  /* The nav is display:none below 760px, replaced by this accessible drawer.
     Traps focus, closes on Escape, restores body scroll, and returns focus to
     the toggle button upon close. */
  useEffect(() => {
    const menuEl = document.getElementById('site-menu');
    if (open) {
      wasOpenRef.current = true;
      const previous = document.body.style.overflow;
      document.body.style.overflow = 'hidden';

      // Focus first interactive link or button inside the menu
      const firstInteractive = menuEl?.querySelector<HTMLElement>('a, button');
      firstInteractive?.focus();

      const onKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          setOpen(false);
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('lgq-menu-toggle', { detail: { open: false } }));
          }
          return;
        }

        // Focus trap inside the drawer
        if (e.key === 'Tab' && menuEl) {
          const focusables = Array.from(
            menuEl.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])')
          );
          if (focusables.length === 0) return;
          const first = focusables[0];
          const last = focusables[focusables.length - 1];

          if (e.shiftKey) {
            if (document.activeElement === first) {
              last.focus();
              e.preventDefault();
            }
          } else {
            if (document.activeElement === last) {
              first.focus();
              e.preventDefault();
            }
          }
        }
      };

      window.addEventListener('keydown', onKey);
      return () => {
        window.removeEventListener('keydown', onKey);
        document.body.style.overflow = previous;
      };
    } else if (wasOpenRef.current) {
      toggleRef.current?.focus();
    }
  }, [open]);

  const toggleMenu = () => {
    setOpen((v) => {
      const next = !v;
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('lgq-menu-toggle', { detail: { open: next } }));
      }
      return next;
    });
  };

  const closeMenu = () => {
    setOpen(false);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('lgq-menu-toggle', { detail: { open: false } }));
    }
  };

  const cta = signedIn
    ? { href: '/dashboard', label: 'Dashboard' }
    : { href: SIGNUP_URL, label: SIGNUP_LABEL };

  return (
    <header className="site-header" data-menu={open ? 'open' : 'closed'}>
      <a className="brand brand-logo" href="/" aria-label="Let’s Get Quoted home">
        <BrandMark />
      </a>
      <nav aria-label="Main navigation">
        {NAV.map(([href, label]) => <a key={href} href={href}>{label}</a>)}
      </nav>
      {/* SIGN IN, FOR PEOPLE WHO ALREADY PAID US THE COMPLIMENT.
          On mobile (<760px), this and the header CTA hide from the bar row
          and live cleanly inside the accessible menu drawer. */}
      {!signedIn ? <a className="header-signin" href={LOGIN_URL}>Sign in</a> : null}
      <a className="header-cta" href={cta.href}>{cta.label} <span>→</span></a>
      <button
        type="button"
        ref={toggleRef}
        className="nav-toggle"
        aria-expanded={open}
        aria-controls="site-menu"
        onClick={toggleMenu}
      >
        <span className="nav-toggle-bars" aria-hidden="true"><i /><i /><i /></span>
        <span className="sr-only">{open ? 'Close menu' : 'Open menu'}</span>
      </button>

      {/* `hidden` rather than a CSS-only hide: a closed menu must be out of the
          tab order and out of the accessibility tree, not merely invisible. */}
      <div className="site-menu" id="site-menu" hidden={!open}>
        <nav aria-label="Site">
          {NAV.map(([href, label]) => (
            <a key={href} href={href} onClick={closeMenu}>{label}</a>
          ))}
        </nav>
        <a className="site-menu-cta" href={cta.href} onClick={closeMenu}>{cta.label} <span>→</span></a>
        {!signedIn ? (
          <a className="site-menu-signin" href={LOGIN_URL} onClick={closeMenu}>
            Already have an account? <b>Sign in</b>
          </a>
        ) : null}
      </div>
    </header>
  );
}

/**
 * THE SAME HEADER, ON A PAGE THAT IS NOT WRITTEN IN THIS LANGUAGE.
 */
export function SiteHeaderSlot({ skipTo = '#main-content' }: { skipTo?: string }) {
  return (
    <div className={styles.root} data-chrome="slot">
      <a className="skip-link" href={skipTo}>Skip to content</a>
      <SiteHeader />
    </div>
  );
}

/**
 * When the fixed mobile bar should NOT be on screen:
 * - When scrolling down
 * - When hero CTA, final CTA, or footer is visible
 * - When menu drawer is open
 * - When an input/textarea is focused (virtual keyboard)
 */
export function useMobileBarVisibility() {
  const barRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    const bar = barRef.current;
    if (!bar || !('IntersectionObserver' in window)) return;

    const zones = [
      document.querySelector('main > section'),
      ...document.querySelectorAll('.final-cta, .page-cta, .hiq-final'),
      ...document.querySelectorAll('footer'),
      ...document.querySelectorAll('.hiq-nav'),
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

  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    let last = window.scrollY;
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        const y = window.scrollY;
        const delta = y - last;
        if (Math.abs(delta) < 8) return;
        last = y;
        bar.setAttribute('data-scroll', delta > 0 && y > 240 ? 'down' : 'up');
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [barRef]);

  // Hide on virtual keyboard/input focus & menu toggle events
  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;

    const onFocusChange = () => {
      const isInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName || '');
      bar.setAttribute('data-input-focused', isInput ? 'true' : 'false');
    };

    const handleMenuState = (e: Event) => {
      const customEvent = e as CustomEvent<{ open: boolean }>;
      bar.setAttribute('data-menu-open', customEvent.detail?.open ? 'true' : 'false');
    };

    window.addEventListener('focusin', onFocusChange);
    window.addEventListener('focusout', onFocusChange);
    window.addEventListener('lgq-menu-toggle', handleMenuState);

    return () => {
      window.removeEventListener('focusin', onFocusChange);
      window.removeEventListener('focusout', onFocusChange);
      window.removeEventListener('lgq-menu-toggle', handleMenuState);
    };
  }, [barRef]);

  return barRef;
}

export function MobileActionDock({
  href = SIGNUP_URL,
  label = SIGNUP_LABEL,
  signedInHref = '/dashboard',
  signedInLabel = 'Go to my dashboard',
}: {
  href?: string;
  label?: string;
  signedInHref?: string;
  signedInLabel?: string;
}) {
  const signedIn = useSignedIn();
  const barRef = useMobileBarVisibility();
  return signedIn ? (
    <a className="mobile-cta" ref={barRef} data-redundant="true" href={signedInHref}>
      {signedInLabel} <span>→</span>
    </a>
  ) : (
    <a className="mobile-cta" ref={barRef} data-redundant="true" href={href}>
      {label} <span>→</span>
    </a>
  );
}

export function SiteFooter() {
  const signedIn = useSignedIn();
  return (
    <>
      <MobileActionDock />
      <footer>
        <a className="brand brand-logo footer-logo" href="/" aria-label="Let’s Get Quoted home">
          <BrandMark />
        </a>
        <p className="footer-links">
          {FOOTER_PRIMARY.map(([href, label]) => <a key={href} href={href}>{label}</a>)}
          {!signedIn ? <a href={LOGIN_URL}>Sign in</a> : null}
        </p>
        <p className="footer-legal">
          {FOOTER_LEGAL.map(([href, label]) => <a key={href} href={href}>{label}</a>)}
        </p>
        <p className="footer-slogan">Built thoughtfully, for thoughtful contractors</p>
        <span>© 2026 Let’s Get Quoted</span>
      </footer>
      {!signedIn && <MarketingAiAssistant />}
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
      <a className="button primary light" href={SIGNUP_URL}>{SIGNUP_LABEL} <span>→</span></a>
      <small>No card required · Flex starts at $0/month + 1.25%</small>
    </section>
  );
}
