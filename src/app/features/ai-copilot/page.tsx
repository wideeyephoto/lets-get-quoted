import type { Metadata } from 'next';
import AiCopilotWithAvatarsPage, { metadata as sparkyMetadata } from '../sparky/page';

export const metadata: Metadata = {
  ...sparkyMetadata,
  title: 'AI Copilot with Avatars · 24/7 Field Sidekick & Trade Companions | Let’s Get Quoted',
  description:
    'You don’t even need to open an app. Run your contractor business completely by texting or calling your AI Copilot with customizable trade avatars.',
  alternates: { canonical: 'https://letsgetquoted.com/features/ai-copilot' },
  openGraph: {
    ...sparkyMetadata.openGraph,
    url: 'https://letsgetquoted.com/features/ai-copilot',
  },
};

export default function AiCopilotPage() {
  return <AiCopilotWithAvatarsPage path="/features/ai-copilot" />;
}
