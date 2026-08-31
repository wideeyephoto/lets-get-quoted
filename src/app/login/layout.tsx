import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: "Sign in · Let's Get Quoted",
  description: "Sign in to your Let's Get Quoted contractor workspace.",
  robots: {
    index: false,
    follow: false,
  },
  alternates: {
    canonical: 'https://app.letsgetquoted.com/login',
  },
};

export default function LoginLayout({ children }: { children: ReactNode }) {
  return children;
}
