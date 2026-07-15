import type { Metadata } from 'next';
import { IBM_Plex_Sans, Space_Grotesk } from 'next/font/google';
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

export const metadata: Metadata = {
  title: 'Let\'s Get Quoted',
  description: 'A contractor-first quote-to-paid experience with Supabase-backed workflows.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className={`${bodyFont.variable} ${displayFont.variable}`}>
        <AppShellProvider>
          <AppShell>{children}</AppShell>
        </AppShellProvider>
      </body>
    </html>
  );
}
