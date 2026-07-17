import type { Metadata } from 'next';
import {
  Anton, Baloo_2, Barlow, Bebas_Neue, Bitter, Chakra_Petch, Comfortaa, Cormorant_Garamond,
  Fraunces, IBM_Plex_Sans, Inter, JetBrains_Mono, Josefin_Sans, Karla, Libre_Baskerville,
  Manrope, Nunito, Oswald, Playfair_Display, Poppins, Rajdhani, Sora, Space_Grotesk, Work_Sans,
} from 'next/font/google';
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

// 17 more template webfont pairings (20 templates total). Several templates
// intentionally share a body/display font with a sibling in the same visual
// family — differentiated by color, radius, and layout, not typography alone.
const havenDisplayFont = Cormorant_Garamond({
  subsets: ['latin'],
  variable: '--font-haven-display',
  weight: ['400', '600'],
});

const havenBodyFont = Manrope({
  subsets: ['latin'],
  variable: '--font-haven-body',
  weight: ['400', '500', '600'],
});

const lumenDisplayFont = Poppins({
  subsets: ['latin'],
  variable: '--font-lumen-display',
  weight: ['400', '500', '600'],
});

const lumenBodyFont = Karla({
  subsets: ['latin'],
  variable: '--font-lumen-body',
  weight: ['400', '500', '700'],
});

const atlasDisplayFont = Sora({
  subsets: ['latin'],
  variable: '--font-atlas-display',
  weight: ['400', '600', '700'],
});

const circuitDisplayFont = Chakra_Petch({
  subsets: ['latin'],
  variable: '--font-circuit-display',
  weight: ['400', '600', '700'],
});

const anchorDisplayFont = Libre_Baskerville({
  subsets: ['latin'],
  variable: '--font-anchor-display',
  weight: ['400', '700'],
});

const foundryDisplayFont = Oswald({
  subsets: ['latin'],
  variable: '--font-foundry-display',
  weight: ['400', '500', '700'],
});

const ironcladDisplayFont = Bebas_Neue({
  subsets: ['latin'],
  variable: '--font-ironclad-display',
  weight: '400',
});

const beaconDisplayFont = Baloo_2({
  subsets: ['latin'],
  variable: '--font-beacon-display',
  weight: ['500', '700'],
});

const beaconBodyFont = Nunito({
  subsets: ['latin'],
  variable: '--font-beacon-body',
  weight: ['400', '600', '700'],
});

const timberDisplayFont = Bitter({
  subsets: ['latin'],
  variable: '--font-timber-display',
  weight: ['400', '600', '700'],
});

const heritageDisplayFont = Playfair_Display({
  subsets: ['latin'],
  variable: '--font-heritage-display',
  weight: ['400', '600', '700'],
});

const bloomDisplayFont = Comfortaa({
  subsets: ['latin'],
  variable: '--font-bloom-display',
  weight: ['400', '600', '700'],
});

const novaDisplayFont = Rajdhani({
  subsets: ['latin'],
  variable: '--font-nova-display',
  weight: ['500', '600', '700'],
});

const driftDisplayFont = Josefin_Sans({
  subsets: ['latin'],
  variable: '--font-drift-display',
  weight: ['400', '500', '600'],
});

const templateFontVariables = [
  havenDisplayFont.variable, havenBodyFont.variable,
  lumenDisplayFont.variable, lumenBodyFont.variable,
  atlasDisplayFont.variable, circuitDisplayFont.variable, anchorDisplayFont.variable,
  foundryDisplayFont.variable, ironcladDisplayFont.variable,
  beaconDisplayFont.variable, beaconBodyFont.variable,
  timberDisplayFont.variable, heritageDisplayFont.variable,
  bloomDisplayFont.variable, novaDisplayFont.variable, driftDisplayFont.variable,
].join(' ');

export const metadata: Metadata = {
  title: 'Let\'s Get Quoted',
  description: 'A contractor-first quote-to-paid experience with Supabase-backed workflows.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  const isStandaloneSite = headers().get('x-lgq-standalone-site') === '1';

  return (
    <html lang="en">
      <body className={`${bodyFont.variable} ${displayFont.variable} ${monoFont.variable} ${forgeDisplayFont.variable} ${forgeBodyFont.variable} ${guildDisplayFont.variable} ${guildBodyFont.variable} ${vistaBodyFont.variable} ${templateFontVariables}`}>
        <AppShellProvider>
          <AppShell forceStandaloneSite={isStandaloneSite}>{children}</AppShell>
        </AppShellProvider>
      </body>
    </html>
  );
}
