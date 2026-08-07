/* eslint-disable @next/next/no-img-element */
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
