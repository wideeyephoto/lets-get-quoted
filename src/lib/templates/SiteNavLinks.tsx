'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import type { Site } from '@/lib/sites';
import { getPublishedBlog, getPublishedFaqs, getPublishedShowcase, getPublishedTestimonials } from '@/lib/site-content';
import styles from './themes.module.css';

type SiteNavLink = {
  href: string;
  label: string;
};

type SiteNavLinksProps = {
  site: Site;
  links: SiteNavLink[];
  className: string;
};

// Desktop nav links + a shared mobile menu. The hamburger toggle renders
// IN-TREE inside each template's header (top-right via grid `order`, styled
// with currentColor so it adapts to every header's palette). The full-screen
// overlay is PORTALED to <body>: several headers use backdrop-filter, which
// makes the header a containing block that would trap position:fixed
// children. Because <body> is outside the template's themeStyle scope, the
// accent vars are measured off the in-tree nav and re-applied to the portal.
// No scroll lock while open — a lock would swallow the native anchor jump
// when a #section link is tapped.
export default function SiteNavLinks({ site, links, className }: SiteNavLinksProps) {
  const navRef = useRef<HTMLElement>(null);
  const [open, setOpen] = useState(false);
  const [portalStyle, setPortalStyle] = useState<CSSProperties | undefined>(undefined);
  const [mounted, setMounted] = useState(false);

  const dynamicLinks: SiteNavLink[] = [];
  if (getPublishedShowcase(site.content)) dynamicLinks.push({ href: '#showcase', label: 'Showcase' });
  if (getPublishedTestimonials(site.content)) dynamicLinks.push({ href: '#reviews', label: 'Reviews' });
  if (getPublishedFaqs(site.content)) dynamicLinks.push({ href: '#faqs', label: 'FAQs' });
  if (getPublishedBlog(site.content)) dynamicLinks.push({ href: '#blog', label: 'Blog' });
  const allLinks = [...links, ...dynamicLinks];

  useEffect(() => {
    setMounted(true);
    if (navRef.current) {
      const computed = getComputedStyle(navRef.current);
      const accent = computed.getPropertyValue('--theme-accent').trim();
      const onAccent = computed.getPropertyValue('--theme-on-accent').trim();
      const style: Record<string, string> = {};
      if (accent) style['--theme-accent'] = accent;
      if (onAccent) style['--theme-on-accent'] = onAccent;
      if (Object.keys(style).length) setPortalStyle(style as CSSProperties);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <nav ref={navRef} className={className} aria-label="Main navigation">
        {allLinks.map((link) => <a key={link.href} href={link.href}>{link.label}</a>)}
      </nav>

      <button
        type="button"
        className={styles.mobileNavToggle}
        aria-expanded={open}
        aria-label={open ? 'Close menu' : 'Open menu'}
        onClick={() => setOpen((value) => !value)}
      >
        <span aria-hidden="true" />
        <span aria-hidden="true" />
        <span aria-hidden="true" />
      </button>

      {mounted && createPortal(
        <div style={portalStyle}>
          {open && (
            <div className={styles.mobileNavOverlay} role="dialog" aria-modal="true" aria-label="Menu">
              <button type="button" className={styles.mobileNavClose} onClick={() => setOpen(false)} aria-label="Close menu">✕</button>
              <p className={styles.mobileNavBrand}>{site.company_name}</p>
              <nav className={styles.mobileNavLinks} aria-label="Menu links">
                {allLinks.map((link) => (
                  <a key={link.href} href={link.href} onClick={() => setOpen(false)}>{link.label}</a>
                ))}
              </nav>
              {site.phone && (
                <a className={styles.mobileNavCall} href={`tel:${site.phone}`} onClick={() => setOpen(false)}>
                  Call {site.phone}
                </a>
              )}
            </div>
          )}
        </div>,
        document.body,
      )}
    </>
  );
}
