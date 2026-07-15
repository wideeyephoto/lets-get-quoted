'use server';

import { sendMagicLinkEmail as sendMagicLink } from '@/lib/magic-link';

export async function sendMagicLinkAction(email: string, redirectUrl: string): Promise<void> {
  return sendMagicLink(email, redirectUrl);
}
