import { createAdminClient } from '@/lib/auth';
import { Resend } from 'resend';

const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const TOKEN_EXPIRY_MINUTES = 60;

/**
 * Send magic link email via Resend
 */
export async function sendMagicLinkEmail(email: string, redirectUrl: string): Promise<void> {
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

  const redirect = new URL(redirectUrl);
  const next = redirect.searchParams.get('next') || '/dashboard';
  const verifyUrl = new URL('/auth/magic-link-callback', redirect.origin);
  verifyUrl.searchParams.set('token_hash', linkData.properties.hashed_token);
  verifyUrl.searchParams.set('next', next);

  // Send email via Resend
  const resend = new Resend(RESEND_API_KEY);
  
  const { error: emailError } = await resend.emails.send({
    from: 'hello@letsgetquoted.com',
    to: email,
    subject: 'Your magic link to Let\'s Get Quoted',
    html: `
      <div style="font-family: system-ui, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Welcome to Let's Get Quoted</h2>
        <p>Click the link below to sign in to your contractor workspace:</p>
        <p style="margin: 2rem 0;">
          <a href="${verifyUrl.toString()}" style="background-color: #1f2937; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; display: inline-block; font-weight: bold;">
            Sign In to Your Account
          </a>
        </p>
        <p style="color: #666; font-size: 14px;">
          Or copy and paste this link in your browser:<br/>
          <code style="background: #f3f4f6; padding: 8px; border-radius: 4px; display: inline-block;">${verifyUrl.toString()}</code>
        </p>
        <p style="color: #999; font-size: 12px; margin-top: 2rem;">
          This link expires in ${TOKEN_EXPIRY_MINUTES} minutes. If you didn't request this email, you can safely ignore it.
        </p>
      </div>
    `,
  });

  if (emailError) {
    console.error('Resend magic link error:', emailError);
    throw new Error(`Failed to send email: ${emailError.message || JSON.stringify(emailError)}`);
  }
}
