'use server';

import { sendContactMessageEmail } from '@/lib/email';

export type ContactState = { ok: boolean; error?: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Verify a Cloudflare Turnstile token. Only enforced when the secret is set, so
// the form keeps working before the keys are configured; once set, a missing or
// invalid token is rejected.
async function passesTurnstile(token: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true; // not configured yet — skip
  if (!token) return false;
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret, response: token }),
    });
    const data = (await res.json()) as { success?: boolean };
    return Boolean(data.success);
  } catch (err) {
    console.error('Turnstile verification error:', err);
    return false;
  }
}

export async function submitContactMessage(formData: FormData): Promise<ContactState> {
  // Honeypot: a hidden field real users never see. Bots fill it — silently
  // accept and drop so they don't learn it was rejected.
  if (((formData.get('company') as string | null) ?? '').trim()) {
    return { ok: true };
  }

  const name = ((formData.get('name') as string | null) ?? '').trim();
  const email = ((formData.get('email') as string | null) ?? '').trim();
  const subject = ((formData.get('subject') as string | null) ?? '').trim();
  const message = ((formData.get('message') as string | null) ?? '').trim();

  if (!name || !email || !message) {
    return { ok: false, error: 'Please fill in your name, email, and a message.' };
  }
  if (!EMAIL_RE.test(email)) {
    return { ok: false, error: 'That email address doesn’t look right — mind checking it?' };
  }
  if (message.length > 5000) {
    return { ok: false, error: 'That message is a bit long — please keep it under 5,000 characters.' };
  }

  const captchaToken = ((formData.get('cf-turnstile-response') as string | null) ?? '').trim();
  if (!(await passesTurnstile(captchaToken))) {
    return { ok: false, error: 'Please complete the “I’m human” check and try again.' };
  }

  try {
    await sendContactMessageEmail({ fromName: name, fromEmail: email, subject, message });
    return { ok: true };
  } catch (err) {
    console.error('Contact form send failed:', err);
    return { ok: false, error: 'Something went wrong sending your message. Please try again in a moment.' };
  }
}
