import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Sans, JetBrains_Mono, Space_Grotesk } from 'next/font/google';
import { GeistSans } from 'geist/font/sans';
import { cookies, headers } from 'next/headers';
import type { ReactNode } from 'react';
import { AppShell } from '@/components/app-shell';
import { AppShellProvider } from '@/components/app-shell-provider';
import { resolveTheme, THEME_COOKIE } from '@/lib/theme';
/**
 * THE BASE SHEET, NOT THE WHOLE ONE.
 *
 * globals.css builds to 714KB and this layout wraps every route in the product,
 * so importing it here downloaded and parsed all of it on the marketing site,
 * on every contractor's public website, on every booking page and on the admin
 * console. Measured against the production build, each of those used between
 * 2.8% and 4.7% of it.
 *
 * globals-lite.css is the same file with the ~590KB of rules that can only
 * match inside /dashboard, /admin and /demo deleted — 714KB becomes 334KB. It
 * is generated; see scripts/build-css-subset.mjs, which also explains why those
 * rules are deleted from a COPY rather than moved into a sheet of their own
 * (moving them changes which declaration wins in thousands of places).
 *
 * Those three trees import the full globals.css on top of this. That is a
 * deliberate duplication and it is what makes the change safe: globals.css
 * contains every rule in this file, in the same order, and loads after it, so
 * every cascade decision on a dashboard page resolves exactly as it did when
 * this layout imported globals.css directly. The cost is that they carry both.
 *
 * It is imported HERE rather than per-route because this layout renders the app
 * shell — the header, nav and footer on every page — and because Next does not
 * collect global CSS imported from special files like not-found.tsx. Wiring it
 * per-route left the 404 rendering the whole chrome in Times New Roman.
 */
import './globals-lite.css';

const bodyFont = IBM_Plex_Sans({
  subsets: ['latin'],
  variable: '--font-body',
  weight: ['400', '500', '600', '700'],
});

const displayFont = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-display',
  weight: ['500', '700'],
});

const monoFont = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  weight: ['400', '500', '700'],
});

/**
 * THE SIXTEEN THAT USED TO BE HERE.
 *
 * The template theme faces (Anton/Barlow/Fraunces/Work Sans/Inter/Poppins) and
 * the curated heading picker (Manrope, Jakarta, DM Sans, Instrument, Outfit,
 * Sora, Urbanist, Montserrat, Oswald, Bebas) are declared in
 * @/lib/templates/fonts and loaded by the surfaces that render a contractor's
 * own branding.
 *
 * Declared here, their @font-face rules were a 51KB stylesheet — 164 rules
 * across 40 families once next/font's metric-override fallbacks are counted —
 * on every route in the product, including the dashboard, the admin console and
 * the marketing site, none of which can render a contractor's chosen font.
 *
 * These four stay: three are the product's own type, and Geist is the marketing
 * site's body face (flagship.module.css reads --font-geist-sans throughout).
 * Several templates also fall back to --font-display for their headings, so
 * Space Grotesk has to be global regardless.
 */

const SITE_URL = 'https://letsgetquoted.com';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Let's Get Quoted — Contractor websites that get you paid, straight to your bank",
    template: "%s · Let's Get Quoted",
  },
  description:
    'The all-in-one platform for contractors: a website with an AI estimator that collects job details, shows an estimated range, and lets customers request an available arrival window 24/7 — plus quotes and e-signatures, scheduling, and Stripe payments straight to your bank. No monthly subscription; platform and Stripe processing fees apply when you collect payment.',
  applicationName: "Let's Get Quoted",
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    url: SITE_URL,
    siteName: "Let's Get Quoted",
    title: 'The website, CRM & payments platform built for contractors',
    description:
      'Win leads with an AI estimator, send quotes and e-signatures, schedule the work, and collect card or bank payments — one tool built for contractors. No subscription; you only pay when you get paid.',
    images: [{ url: '/template-previews/professional.jpg', width: 1900, height: 881, alt: 'A contractor website built with Let’s Get Quoted' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'The website, CRM & payments platform built for contractors',
    description:
      'Capture leads, quote, e-sign, schedule, and get paid — one tool built for contractors. No subscription; pay only when you get paid.',
    images: ['/template-previews/professional.jpg'],
  },
};

export const viewport: Viewport = {
  themeColor: '#06131f',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  const isStandaloneSite = headers().get('x-lgq-standalone-site') === '1';
  // Stamped during the render, not corrected afterwards by a script: the first
  // paint is already the right theme, so there is no dark flash on the way to
  // light. This layout already reads headers(), so the cookie costs nothing —
  // the route was dynamic either way.
  //
  // A contractor's PUBLIC site renders through this same layout and must not
  // inherit the owner's preference: their homeowners get the palette the site
  // was designed with, not whatever the plumber likes at 6am.
  const theme = isStandaloneSite ? 'dark' : resolveTheme(cookies().get(THEME_COOKIE)?.value);

  return (
    <html lang="en" data-theme={theme}>
      <body className={`${bodyFont.variable} ${displayFont.variable} ${monoFont.variable} ${GeistSans.variable}`}>
        <AppShellProvider>
          <AppShell forceStandaloneSite={isStandaloneSite}>{children}</AppShell>
        </AppShellProvider>
      </body>
    </html>
  );
}
