/* eslint-disable @next/next/no-img-element */
/* The flagship reproduction's own header, footer and closing CTA.
   Copied from the source site; only the nav hrefs move, to routes this app
   actually has. Shared by every /..-flagship page. */
"use client";

export function SiteHeader() {
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
      <a className="header-cta" href="https://app.letsgetquoted.com/">Build my free site <span>→</span></a>
    </header>
  );
}

export function SiteFooter() {
  return (
    <>
      <a className="mobile-cta" href="https://app.letsgetquoted.com/">Build my free site <span>→</span></a>
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
