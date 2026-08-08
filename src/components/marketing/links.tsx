import Link from 'next/link';
import type { ReactNode } from 'react';

/* Shared destinations for the marketing pages.
 *
 * Every primary call to action on the public marketing site points at the app's
 * sign-up host. It lives here as one constant so a change is one edit and not a
 * grep across nine pages.
 *
 * AND THE PATH IS THE POINT, not just the host. This constant was the app ROOT
 * for every acquisition button on /founder, /how-it-works and all five feature
 * detail pages — and the app root lands on a form headed "Sign in", with the
 * actual signup one more click away behind "New here?". So a page could promise
 * "Build my free site", spend a screen earning the click, and answer it with a
 * password field. `?intent=signup` is the same route asked for the right form;
 * site-chrome.tsx has used it since the header was fixed, and this is the rest
 * of the site catching up to it. */

export const APP_SIGNUP_URL = 'https://app.letsgetquoted.com/login?intent=signup';
export const DEMO_URL = '/demo';
export const FEATURES_URL = '/features';

/** A button or link on a marketing page. */
export type CtaLinkSpec = {
  label: ReactNode;
  /** Defaults to {@link APP_SIGNUP_URL} when omitted. */
  href?: string;
};

/** True for same-site paths and hash anchors — anything `next/link` should own. */
function isInternal(href: string): boolean {
  return href.startsWith('/');
}

/**
 * Renders a CTA with the right element for its destination: `next/link` for
 * in-app routes (so they prefetch and client-navigate), a plain anchor for the
 * external app host and for `#` anchors (Link would hijack same-page jumps).
 */
export function CtaLink({
  spec,
  className,
  arrow = false,
}: {
  spec: CtaLinkSpec;
  className?: string;
  /** Appends a decorative arrow. Hidden from assistive tech. */
  arrow?: boolean;
}) {
  const href = spec.href ?? APP_SIGNUP_URL;
  const content = (
    <>
      {spec.label}
      {arrow ? <span aria-hidden="true">&rarr;</span> : null}
    </>
  );

  if (isInternal(href)) {
    return (
      <Link href={href} className={className}>
        {content}
      </Link>
    );
  }

  return (
    <a href={href} className={className}>
      {content}
    </a>
  );
}
