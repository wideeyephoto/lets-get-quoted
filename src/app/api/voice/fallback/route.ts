// verifyVoice: Provider recovery fallback webhook
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export { handleVoiceProviderFallback as POST } from '@/lib/voice/fallback';
