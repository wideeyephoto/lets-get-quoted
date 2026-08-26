import type { Metadata } from 'next';
import VoiceCallsPage, { metadata as voiceCallsMetadata } from '../voice-calls/page';

export const metadata: Metadata = {
  ...voiceCallsMetadata,
  title: 'AI Voice Assistant',
};

export default VoiceCallsPage;
