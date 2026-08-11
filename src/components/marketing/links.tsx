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

/**
 * The way back in for somebody who already has an account.
 *
 * Absolute for the same reason as above — a session cookie belongs to exactly
 * one host, so a bare `/login` from the marketing host is a redirect at best.
 * It is also where next/link's prefetch of `/login` was coming from: a route
 * that only ever redirects is one the router should not be warming up.
 */
export const APP_LOGIN_URL = 'https://app.letsgetquoted.com/login';
export const DEMO_URL = '/demo';
export const FEATURES_URL = '/features';

/**
 * THE SIGN-UP ACTION WHEN IT IS NOT THE POINT OF THE PAGE.
 *
 * Eight feature pages led with "Build my free site" — including the ones
 * selling payments, scheduling and crew management, where a free website is not
 * what the reader came for and answering them with one is a non sequitur. On a
 * capability page the contextual action wins the hero ("Open the live
 * calendar", "Try the quote builder") and signing up is the quieter second
 * option, which is what this label is for.
 *
 * "Build my free site" is not retired — it stays the primary on the homepage,
 * /features and the website-builder page, where the site IS the offer.
 */
export const SECONDARY_SIGNUP_LABEL = 'Start free';

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
