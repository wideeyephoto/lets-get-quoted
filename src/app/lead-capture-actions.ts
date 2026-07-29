'use server';

import { headers } from 'next/headers';
import { platformFeeForVolume, marginalTierForVolume } from '@/lib/pricing';
import { sendFeeEstimateEmails } from '@/lib/email';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Soft capture from the homepage fee calculator: email the prospect their own
// breakdown and drop the team a lead alert. Returns a plain result the client
// renders — never throws to the caller.
export async function emailFeeEstimateAction(input: {
  email: string;
  volume: number;
  company?: string; // honeypot — real users leave it blank
}): Promise<{ ok: boolean; error?: string }> {
  // Bots fill hidden fields; silently accept so they get no signal.
  if (input.company && input.company.trim() !== '') return { ok: true };

  const email = (input.email || '').trim();
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return { ok: false, error: 'Enter a valid email address.' };
  }

  const volume = Number(input.volume);
  if (!Number.isFinite(volume) || volume < 0 || volume > 100_000_000) {
    return { ok: false, error: 'Enter your yearly volume first.' };
  }

  const platformFee = platformFeeForVolume(volume);
  const tier = marginalTierForVolume(volume);
  const effectiveRatePct = volume > 0 ? (platformFee / volume) * 100 : 0;

  const h = headers();
  const origin = h.get('origin') || `https://${h.get('host') || 'letsgetquoted.com'}`;

  try {
    await sendFeeEstimateEmails({
      recipientEmail: email,
      volume,
      platformFee,
      effectiveRatePct,
      marginalRate: tier.rate,
      origin,
    });
    return { ok: true };
  } catch (err) {
    console.error('emailFeeEstimateAction failed:', err);
    return { ok: false, error: 'Couldn’t send just now — email us at hello@letsgetquoted.com.' };
  }
}
