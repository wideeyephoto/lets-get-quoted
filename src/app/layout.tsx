import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Sans, JetBrains_Mono, Space_Grotesk } from 'next/font/google';
import { GeistSans } from 'geist/font/sans';
import { cookies, headers } from 'next/headers';
import type { ReactNode } from 'react';
import { AppShell } from '@/components/app-shell';
import { AppShellProvider } from '@/components/app-shell-provider';
import SpeculationRules from '@/components/speculation-rules';
import GoogleTag from '@/components/google-tag';
import { ThemeProvider } from '@/components/use-theme';
import { cspNonce } from '@/lib/csp-nonce';
import {
  parseThemeChoice,
  resolveTheme,
  themeColor,
  THEME_COLORS,
  THEME_COOKIE,
  THEME_COOKIE_MAX_AGE,
  THEME_SYSTEM_COOKIE,
} from '@/lib/theme';
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
    default: "Let's Get Quoted — Contractor software starting with a free website",
    template: "%s · Let's Get Quoted",
  },
  /* 160 CHARACTERS, NOT 364.
     This was two and a quarter times what Google renders, so the sentence a
     searcher actually saw ended mid-clause at "…request an available arrival
     wind…" and every word after it — including the whole fee disclosure it was
     lengthened to carry — was written for nobody. The disclosure has not been
     dropped, it has been moved somewhere it is read: /pricing states the fee
     model in full, and the homepage's own pricing band carries it above the
     fold. A <meta description> is a snippet, not a disclosure surface. */
  description:
    'One connected system for contractors: build your website, qualify leads, send quotes, schedule work, manage crew, and collect payment without switching tools.',
  applicationName: "Let's Get Quoted",
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    url: SITE_URL,
    siteName: "Let's Get Quoted",
    title: 'Let’s Get Quoted · Contractor Business Software',
    description:
      'From first click to final payment. Build your website, qualify leads, send quotes, schedule work, manage crew, and collect payment in one connected system.',
    images: [{ url: '/product/website.webp', width: 1600, height: 1000, alt: 'A contractor website built with Let’s Get Quoted' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Let’s Get Quoted · Contractor Business Software',
    description:
      'From first click to final payment. Run your contracting business in one place—starting with a free website.',
    images: ['/product/website.webp'],
  },
};

const THEME_INIT_SCRIPT = `
  (function () {
    try {
      var root = document.documentElement;
      var prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;
      document.cookie = '${THEME_SYSTEM_COOKIE}=' + (prefersLight ? 'light' : 'dark') + '; path=/; max-age=${THEME_COOKIE_MAX_AGE}; samesite=lax';
      if (root.dataset.themeChoice !== 'system') return;
      var theme = prefersLight ? 'sunlight' : 'dark';
      root.dataset.theme = theme;
      var color = ${JSON.stringify(THEME_COLORS)}[theme];
      document.querySelectorAll('meta[name="theme-color"]').forEach(function (meta) {
        meta.setAttribute('content', color);
      });
    } catch (_) {}
  })();
`;

function readServerTheme() {
  const isStandaloneSite = headers().get('x-lgq-standalone-site') === '1';
  const jar = cookies();
  const choice = parseThemeChoice(jar.get(THEME_COOKIE)?.value) ?? 'system';
  const systemPrefersLight = jar.get(THEME_SYSTEM_COOKIE)?.value === 'light';
  const theme = isStandaloneSite ? 'dark' : resolveTheme(choice === 'system' ? null : choice, systemPrefersLight);
  return { choice, isStandaloneSite, theme } as const;
}

export function generateViewport(): Viewport {
  return { themeColor: themeColor(readServerTheme().theme) };
}

export default function RootLayout({ children }: { children: ReactNode }) {
  const { choice, isStandaloneSite, theme } = readServerTheme();
  const nonce = cspNonce();
  // Explicit choices and known system preferences are stamped during the
  // server render. On a first-ever visit there is no system mirror cookie yet,
  // so THEME_INIT_SCRIPT corrects that one unknowable guess synchronously,
  // before paint rather than in a post-hydration effect.
  //
  // A contractor's PUBLIC site renders through this same layout and must not
  // inherit the owner's preference: their homeowners get the palette the site
  // was designed with, not whatever the plumber likes at 6am.
  //
  // "Auto" is resolved here too, from the mirror cookie the browser writes (see
  // THEME_SYSTEM_COOKIE); the bootstrap covers the first page load and the
  // server has the answer for every navigation after it.
  return (
    // data-theme is the color being rendered; data-theme-choice is what the
    // person asked for. They differ exactly when the choice is 'system', and
    // the controls need the second one to show Auto as selected.
    <html
      lang="en"
      data-theme={theme}
      data-theme-choice={isStandaloneSite ? 'dark' : choice}
      suppressHydrationWarning
    >
      <body className={`${bodyFont.variable} ${displayFont.variable} ${monoFont.variable} ${GeistSans.variable}`}>
        {isStandaloneSite ? null : (
          <script
            id="lgq-theme-init"
            nonce={nonce}
            suppressHydrationWarning
            dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }}
          />
        )}
        <ThemeProvider
          enabled={!isStandaloneSite}
          initialChoice={isStandaloneSite ? 'dark' : choice}
          initialTheme={theme}
        >
          <SpeculationRules />
          <AppShellProvider>
            <AppShell forceStandaloneSite={isStandaloneSite}>{children}</AppShell>
          </AppShellProvider>
        </ThemeProvider>
        {isStandaloneSite ? null : <GoogleTag />}
      </body>
    </html>
  );
}
