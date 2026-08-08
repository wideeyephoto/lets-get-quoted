/* eslint-disable @next/next/no-img-element */
/* The flagship reproduction's own header, footer and closing CTA.
   Copied from the source site; only the nav hrefs move, to routes this app
   actually has. Shared by the homepage and every marketing page under it. */
"use client";

import { useEffect, useState } from 'react';
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

export function SiteHeader() {
  const signedIn = useSignedIn();
  return (
    <header className="site-header">
      <a className="brand brand-logo" href="/" aria-label="Let’s Get Quoted home">
        <img src="/lets-get-quoted-logo-exact.png" alt="Let’s Get Quoted" />
      </a>
      <nav aria-label="Main navigation">
        <a href="/features">Product</a>
        <a href="/how-it-works">How it works</a>
        <a href="/for">For your trade</a>
        <a href="/pricing">Pricing</a>
        <a href="/founder">Founder</a>
      </nav>
      {signedIn ? (
        <a className="header-cta" href="/dashboard">Dashboard <span>→</span></a>
      ) : (
        <a className="header-cta" href={SIGNUP_URL}>Build my free site <span>→</span></a>
      )}
    </header>
  );
}

export function SiteFooter() {
  const signedIn = useSignedIn();
  return (
    <>
      {/* Same reasoning as the header's: on a phone this bar is the only
          persistent control on the page, and "Build my free site" is the wrong
          offer for somebody who has already built one. */}
      {signedIn ? (
        <a className="mobile-cta" href="/dashboard">Go to my dashboard <span>→</span></a>
      ) : (
        <a className="mobile-cta" href={SIGNUP_URL}>Build my free site <span>→</span></a>
      )}
      <footer>
        <a className="brand brand-logo footer-logo" href="/" aria-label="Let’s Get Quoted home">
          <img src="/lets-get-quoted-logo-exact.png" alt="Let’s Get Quoted" />
        </a>
        <p className="footer-links"><a href="/features">Features</a><a href="/how-it-works">How it works</a><a href="/for">For your trade</a><a href="/pricing">Pricing</a><a href="/founder">Founder</a></p>
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
