'use client';

import type { AnchorHTMLAttributes, MouseEvent } from 'react';

import { settingsTabEvent } from '@/lib/nav-helpers';

/**
 * A same-page settings link that still works when its hash is already in the
 * address bar. SettingsTabs listens for this explicit intent, opens a nested
 * disclosure when needed, and then scrolls it into view.
 */
export default function SettingsHashLink({
  href,
  onClick,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & { href: `#${string}` }) {
  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    onClick?.(event);
    if (event.defaultPrevented) return;
    window.dispatchEvent(settingsTabEvent(href));
  }

  return <a href={href} onClick={handleClick} {...props} />;
}
