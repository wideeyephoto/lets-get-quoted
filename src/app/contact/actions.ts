'use server';

import { headers } from 'next/headers';
import { createAdminClient } from '@/lib/auth';
import { sendContactMessageEmail } from '@/lib/email';
import { addSupportCaseNote, createSupportCase } from '@/lib/support-cases';
import { checkRateLimitStrict, clientIpFrom } from '@/lib/rate-limit';

export type ContactState = { ok: boolean; error?: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// A ceiling that holds whether or not Turnstile is configured.
//
// passesTurnstile returns true when TURNSTILE_SECRET is unset, which is a
// reasonable "don't break the form before it's wired up" default — except the
// widget still RENDERS, because that's driven by the separate public site key.
// Set one and not the other and the page shows an "I'm human" check that
// verifies nothing, which reads as protected while being an open relay into a
// staff inbox. The limiter doesn't care how the captcha is configured.
const CONTACT_LIMIT = 5;
const CONTACT_WINDOW_SECONDS = 60 * 60;

// Canonical Cloudflare Turnstile siteverify. Only enforced when TURNSTILE_SECRET
// is set, so the form keeps working before the secret is configured; once set, a
// missing or invalid token is rejected. Fails closed on any network/parse error.
async function passesTurnstile(token: string, remoteip: string | undefined): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET || process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    // Say so out loud. Silently skipping meant the only signal that the check
    // was doing nothing was the absence of a signal.
    console.warn('[contact] TURNSTILE_SECRET is unset — captcha not verified, rate limit only.');
    return true;
  }
  if (!token) return false;
  try {
    const body = new URLSearchParams({ secret, response: token });
    if (remoteip) body.set('remoteip', remoteip);
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!r.ok) throw new Error(`siteverify ${r.status}`);
    const result = (await r.json()) as { success?: boolean };
    return result.success === true;
  } catch (err) {
    // Network error, non-2xx, or non-JSON body from siteverify — fail closed.
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

  const h = await headers();
  const ip = clientIpFrom(h);

  // Before the captcha, so a flood costs one cheap DB call rather than a
  // round-trip to Cloudflare per attempt.
  if (!(await checkRateLimitStrict(createAdminClient(), `contact:ip:${ip}`, CONTACT_LIMIT, CONTACT_WINDOW_SECONDS))) {
    return { ok: false, error: 'You’ve sent a few messages already — we’ll reply to those first. Try again a bit later.' };
  }

  const captchaToken = ((formData.get('cf-turnstile-response') as string | null) ?? '').trim();
  const clientIp = ip === 'unknown' ? undefined : ip;
  if (!(await passesTurnstile(captchaToken, clientIp))) {
    return { ok: false, error: 'Please complete the “I’m human” check and try again.' };
  }

  // Log it as a case BEFORE sending, and never let the log's failure fail the
  // form. Until now this endpoint only ever emailed hello@ — so every support
  // request that arrived through the public site lived in an inbox, and
  // /admin/cases only ever held what staff had typed in by hand. The SLA index
  // and the assignment queue were running on a table nothing fed.
  //
  // account_id stays null: whoever filled this in is not signed in, and
  // guessing an account from an email address would attach a stranger's message
  // to somebody's record. Staff can link it from the case page.
  const caseId = await logContactAsCase({ name, email, subject, message });

  try {
    await sendContactMessageEmail({ fromName: name, fromEmail: email, subject, message });
    return { ok: true };
  } catch (err) {
    console.error('Contact form send failed:', err);
    // The case exists, so the message is not lost even though the email failed.
    // Say so plainly rather than inviting a duplicate send.
    if (caseId) {
      return { ok: true };
    }
    return { ok: false, error: 'Something went wrong sending your message. Please try again in a moment.' };
  }
}

async function logContactAsCase(input: {
  name: string;
  email: string;
  subject: string;
  message: string;
}): Promise<string | null> {
  try {
    const admin = createAdminClient();
    // Not staff. The actor on a public contact submission is the person who
    // filled the form in, and they have no staff row, no permission and no
    // request id worth correlating — naming that explicitly is better than
    // reaching for systemActor(), which would claim the platform did this.
    const submitter = { adminEmail: input.email, ip: null, requestId: null, staff: null, permission: null };
    const created = await createSupportCase(admin, submitter, {
      accountId: null,
      subject: input.subject || `Message from ${input.name}`,
      source: 'customer',
      requesterEmail: input.email,
    });
    // The message is note #1, the same shape every later reply takes, and
    // shared so it reads as the customer's own words rather than a staff
    // summary of them.
    await addSupportCaseNote(admin, submitter, created.id, input.message, 'customer');
    return created.id;
  } catch (err) {
    console.error('Contact form case log failed:', err);
    return null;
  }
}
