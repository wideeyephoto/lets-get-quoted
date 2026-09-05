import type { Metadata } from 'next';
import AiCopilotWithAvatarsPage from '../sparky/AiCopilotWithAvatarsScreen';

export const metadata: Metadata = {
  title: 'AI Copilot with Avatars · 24/7 Field Sidekick & Trade Companions | Let’s Get Quoted',
  description:
    'You don’t even need to open an app. Run your contractor business by texting or calling your AI Copilot with customizable trade avatars.',
  alternates: { canonical: 'https://letsgetquoted.com/features/ai-copilot' },
  openGraph: {
    type: 'website',
    url: 'https://letsgetquoted.com/features/ai-copilot',
    siteName: "Let's Get Quoted",
    title: 'AI Copilot with Avatars · 24/7 Field Sidekick & Trade Companions',
    description:
      'You don’t even need to open an app. Run your contractor business by texting or calling your AI Copilot with customizable trade avatars.',
    images: [{ url: '/product/jobs.webp', width: 1600, height: 1000, alt: 'AI Copilot with Avatars' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AI Copilot with Avatars · 24/7 Field Sidekick',
    description:
      'You don’t even need to open an app. Run your contractor business by texting or calling your AI Copilot with customizable trade avatars.',
    images: ['/product/jobs.webp'],
  },
};

export default function AiCopilotPage() {
  return <AiCopilotWithAvatarsPage path="/features/ai-copilot" />;
}
