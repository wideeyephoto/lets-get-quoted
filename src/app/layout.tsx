import type { Metadata, Viewport } from 'next';
import { Anton, Barlow, Bebas_Neue, DM_Sans, Fraunces, IBM_Plex_Sans, Instrument_Sans, Inter, JetBrains_Mono, Manrope, Montserrat, Oswald, Outfit, Plus_Jakarta_Sans, Poppins, Sora, Space_Grotesk, Urbanist, Work_Sans } from 'next/font/google';
import { GeistSans } from 'geist/font/sans';
import { headers } from 'next/headers';
import type { ReactNode } from 'react';
import { AppShell } from '@/components/app-shell';
import { AppShellProvider } from '@/components/app-shell-provider';
import './globals.css';

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

// Website-template webfonts — a real display + body pairing per template theme
// (Forge/Guild/Vista) so contractor-facing marketing sites never fall back to
// bare OS system fonts like Impact/Arial Black/Trebuchet MS.
const forgeDisplayFont = Anton({
  subsets: ['latin'],
  variable: '--font-forge-display',
  weight: '400',
});

const forgeBodyFont = Barlow({
  subsets: ['latin'],
  variable: '--font-forge-body',
  weight: ['400', '500', '600'],
});

const guildDisplayFont = Fraunces({
  subsets: ['latin'],
  variable: '--font-guild-display',
  weight: ['400', '600'],
});

const guildBodyFont = Work_Sans({
  subsets: ['latin'],
  variable: '--font-guild-body',
  weight: ['400', '500', '600'],
});

const vistaBodyFont = Inter({
  subsets: ['latin'],
  variable: '--font-vista-body',
  weight: ['400', '500', '600'],
});

const careFont = Poppins({
  subsets: ['latin'],
  variable: '--font-care',
  weight: ['400', '500', '600', '700', '800'],
});

// Curated heading-font picker set (see HEADING_FONT_OPTIONS). Variable fonts
// omit `weight` to ship the whole axis in one file; Bebas is single-weight.
const manropeFont = Manrope({ subsets: ['latin'], variable: '--font-manrope' });
const jakartaFont = Plus_Jakarta_Sans({ subsets: ['latin'], variable: '--font-jakarta' });
const dmSansFont = DM_Sans({ subsets: ['latin'], variable: '--font-dmsans' });
const instrumentFont = Instrument_Sans({ subsets: ['latin'], variable: '--font-instrument' });
const outfitFont = Outfit({ subsets: ['latin'], variable: '--font-outfit' });
const soraFont = Sora({ subsets: ['latin'], variable: '--font-sora' });
const urbanistFont = Urbanist({ subsets: ['latin'], variable: '--font-urbanist' });
const montserratFont = Montserrat({ subsets: ['latin'], variable: '--font-montserrat' });
const oswaldFont = Oswald({ subsets: ['latin'], variable: '--font-oswald' });
const bebasFont = Bebas_Neue({ subsets: ['latin'], variable: '--font-bebas', weight: '400' });

const SITE_URL = 'https://letsgetquoted.com';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Let's Get Quoted — Contractor websites that get you paid, straight to your bank",
    template: "%s · Let's Get Quoted",
  },
  description:
    'The all-in-one platform for contractors: a website with an AI estimator that qualifies leads 24/7, quotes and e-signatures, scheduling, and Stripe payments straight to your bank. No subscription — you only pay when you get paid.',
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

  return (
    <html lang="en">
      <body className={`${bodyFont.variable} ${displayFont.variable} ${monoFont.variable} ${forgeDisplayFont.variable} ${forgeBodyFont.variable} ${guildDisplayFont.variable} ${guildBodyFont.variable} ${vistaBodyFont.variable} ${careFont.variable} ${manropeFont.variable} ${jakartaFont.variable} ${dmSansFont.variable} ${GeistSans.variable} ${instrumentFont.variable} ${outfitFont.variable} ${soraFont.variable} ${urbanistFont.variable} ${montserratFont.variable} ${oswaldFont.variable} ${bebasFont.variable}`}>
        <AppShellProvider>
          <AppShell forceStandaloneSite={isStandaloneSite}>{children}</AppShell>
        </AppShellProvider>
      </body>
    </html>
  );
}
