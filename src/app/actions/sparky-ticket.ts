'use server';

import { headers } from 'next/headers';
import { createAdminClient } from '@/lib/auth';
import { sendContactMessageEmail } from '@/lib/email';
import { addSupportCaseNote, createSupportCase } from '@/lib/support-cases';
import { checkRateLimitStrict, clientIpFrom } from '@/lib/rate-limit';

export type SparkyTicketInput = {
  name: string;
  email: string;
  phone?: string;
  message: string;
  pageUrl?: string;
  questionContext?: string;
  company?: string; // honeypot
};

export type SparkyTicketResult = {
  ok: boolean;
  caseId?: string;
  error?: string;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TICKET_LIMIT = 5;
const TICKET_WINDOW_SECONDS = 60 * 60; // 5 per hour per IP

export async function submitSparkySupportTicket(input: SparkyTicketInput): Promise<SparkyTicketResult> {
  // Honeypot: hidden field that bots fill in.
  if ((input.company ?? '').trim()) {
    return { ok: true, caseId: 'ignored' };
  }

  const name = (input.name ?? '').trim();
  const email = (input.email ?? '').trim();
  const phone = (input.phone ?? '').trim();
  const message = (input.message ?? '').trim();
  const pageUrl = (input.pageUrl ?? '').trim();
  const questionContext = (input.questionContext ?? '').trim();

  if (!name || !email || !message) {
    return { ok: false, error: 'Please provide your name, email, and a message.' };
  }

  if (!EMAIL_RE.test(email)) {
    return { ok: false, error: 'Please enter a valid email address.' };
  }

  if (message.length > 5000) {
    return { ok: false, error: 'Please keep your message under 5,000 characters.' };
  }

  const h = await headers();
  const ip = clientIpFrom(h);

  try {
    const admin = createAdminClient();
    const rateLimitPassed = await checkRateLimitStrict(
      admin,
      `sparky_ticket:ip:${ip}`,
      TICKET_LIMIT,
      TICKET_WINDOW_SECONDS
    );

    if (!rateLimitPassed) {
      return {
        ok: false,
        error: 'You’ve reached the submission limit for now. Our team will review your earlier messages first.',
      };
    }

    const submitter = { adminEmail: email, ip: null, requestId: null, staff: null, permission: null };
    const subject = `[Sparky Copilot] Help Request from ${name}`;

    const created = await createSupportCase(admin, submitter, {
      accountId: null,
      subject,
      source: 'customer',
      requesterEmail: email,
      priority: 'normal',
    });

    const contextParts = [
      message,
      phone ? `\n\nDirect Phone: ${phone}` : '',
      pageUrl ? `\nOriginating Page: ${pageUrl}` : '',
      questionContext ? `\nSparky Query Context: ${questionContext}` : '',
    ].filter(Boolean).join('');

    await addSupportCaseNote(admin, submitter, created.id, contextParts, 'customer');

    // Attempt staff email notification
    try {
      await sendContactMessageEmail({
        fromName: name,
        fromEmail: email,
        subject,
        message: contextParts,
      });
    } catch (emailErr) {
      console.warn('[sparky-ticket] Staff notification email failed, case still logged:', emailErr);
    }

    return { ok: true, caseId: created.id };
  } catch (err) {
    console.error('[sparky-ticket] Failed to log support case:', err);
    return {
      ok: false,
      error: 'Something went wrong submitting your ticket. Please try again or email hello@letsgetquoted.com directly.',
    };
  }
}
