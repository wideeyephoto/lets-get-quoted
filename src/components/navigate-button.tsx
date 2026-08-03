'use client';

import { useEffect, useRef, useState } from 'react';
import { isApplePlatform, navigationLinks, type NavTarget } from '@/lib/navigation-links';

// "Navigate" with a choice of map app.
//
// The platform check has to happen in the browser (the server can't know an
// iPad is an iPad — iPadOS claims to be a Mac and only maxTouchPoints gives it
// away), so this renders a single Google Maps link on the server and upgrades
// itself to the full picker once mounted. A tech who taps before hydration
// still gets working directions, which is the only thing that matters.

export default function NavigateButton({ target, className }: { target: NavTarget; className?: string }) {
  const [platform, setPlatform] = useState<'ios' | 'other' | null>(null);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setPlatform(isApplePlatform(navigator.userAgent, navigator.maxTouchPoints));
  }, []);

  useEffect(() => {
    if (!open) return;
    const onAway = (event: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onAway);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onAway);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const links = navigationLinks(target, platform ?? 'other');
  if (links.length === 0) return null;

  // One option is not a menu.
  if (links.length === 1) {
    return (
      <a className={className} href={links[0].href} target="_blank" rel="noopener noreferrer">
        🧭 Navigate
      </a>
    );
  }

  return (
    <div className="nav-picker" ref={wrapRef}>
      <button type="button" className={className} aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        🧭 Navigate
      </button>
      {open ? (
        <div className="nav-picker-menu" role="menu">
          {links.map((link) => (
            <a
              key={link.app}
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              role="menuitem"
              onClick={() => setOpen(false)}
            >
              {link.label}
            </a>
          ))}
        </div>
      ) : null}
    </div>
  );
}
