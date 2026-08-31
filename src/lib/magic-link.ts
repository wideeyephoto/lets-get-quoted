import { createAdminClient } from '@/lib/auth';
import { Resend } from 'resend';
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

  // Send email via Resend
  const resend = new Resend(RESEND_API_KEY);
  
  const { error: emailError } = await resend.emails.send({
    from: "Let's Get Quoted <hello@letsgetquoted.com>",
    to: email,
    subject: "Your magic link to Let's Get Quoted",
    html: renderBrandedEmail({
      brand: {
        businessName: "Let's Get Quoted",
        accent: '#0284c7',
        theme: 'spotlight',
        logoUrl: null,
        phone: null,
        siteUrl: APP_ORIGIN,
        replyTo: null,
      },
      preheader: 'Click to securely sign in to your contractor workspace',
      eyebrow: 'Contractor Login',
      heading: 'Sign in to your workspace',
      paragraphs: [
        'Tap the secure button below to sign in to your Let\'s Get Quoted account. No password needed.',
      ],
      cta: {
        label: 'Sign in to your dashboard',
        url: verifyUrl.toString(),
      },
      footerHtml: `<p style="margin:10px 0 0;font-family:${FONT_STACK};font-size:12px;line-height:1.6;color:#64748b">This link expires in ${TOKEN_EXPIRY_MINUTES} minutes. If you did not request this sign-in link, you can safely ignore this email.</p>`,
    }),
    tags: [{ name: 'kind', value: 'magic_link' }],
  });

  if (emailError) {
    console.error('Resend magic link error:', emailError);
    throw new Error(`Failed to send email: ${emailError.message || JSON.stringify(emailError)}`);
  }
}
