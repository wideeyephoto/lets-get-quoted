import { createAdminClient } from '@/lib/auth';
import { Resend } from 'resend';
import { sendPlatformTransactionalEmail } from './platform-transactional-email';
import { APP_ORIGIN, safeNextPath } from '@/lib/app-origin';
import { renderBrandedEmail, FONT_STACK } from '@/emails/brand';

const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const TOKEN_EXPIRY_MINUTES = 60;

/**
 * Send magic link email via Resend.
 *
 * Takes only where to land the user AFTER sign-in, never which host to sign
 * them in on. This used to accept a full redirectUrl and read `origin` off it,
 * which meant the caller chose the host in a link carrying a live one-time
 * token — and the caller of a server action is anybody with curl. See
 * lib/app-origin. `next` is still caller-supplied, so it is sanitised to a
 * same-site path before it goes anywhere near the email.
 */
export async function sendMagicLinkEmail(email: string, next = '/dashboard'): Promise<void> {
  if (!RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY is not configured');
  }

  const admin = createAdminClient();
  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  });

  if (linkError || !linkData.properties.hashed_token) {
    console.error('Supabase magic link generation error:', linkError);
    throw new Error(linkError?.message || 'Failed to generate magic link');
  }

  const verifyUrl = new URL('/auth/magic-link-callback', APP_ORIGIN);
  verifyUrl.searchParams.set('token_hash', linkData.properties.hashed_token);
  verifyUrl.searchParams.set('next', safeNextPath(next));

  // Instead of sending inline, enqueue to platform event notices
  const payload = {
    to: email,
    subject: "Your sign-in link for Let's Get Quoted",
    verifyUrl: verifyUrl.toString(),
    tokenExpiryMinutes: TOKEN_EXPIRY_MINUTES
  };

  const { error: insertError } = await admin.from('platform_event_notices').insert({
    account_id: null,
    event_family: 'auth_link',
    source_id: 'magic-link-' + Date.now(),
    payload
  });

  if (insertError) {
    console.error('Failed to queue magic link email:', insertError);
    throw new Error(`Failed to queue magic link email: ${insertError.message}`);
  }
}
