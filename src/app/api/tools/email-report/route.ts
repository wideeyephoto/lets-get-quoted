import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/auth';
import { checkRateLimit, clientIpFrom } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: NextRequest) {
  const ip = clientIpFrom(request.headers);
  const admin = createAdminClient();

  const ipAllowed = await checkRateLimit(admin, `tool-email-report:ip:${ip || 'anon'}`, 5, 300);
  if (!ipAllowed) {
    return NextResponse.json(
      { error: 'Too many report requests. Please wait a few minutes.' },
      { status: 429 },
    );
  }

  let body: {
    email?: string;
    toolName?: string;
    summary?: string;
    calculations?: Record<string, unknown>;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  if (!email || !EMAIL_REGEX.test(email) || email.length > 120) {
    return NextResponse.json({ error: 'Valid email address is required' }, { status: 400 });
  }

  // Rate limit per target email address to prevent email-bombing a single recipient
  const emailAllowed = await checkRateLimit(admin, `tool-email-report:to:${email}`, 3, 300);
  if (!emailAllowed) {
    return NextResponse.json(
      { error: 'Too many reports requested for this email address. Please wait a few minutes.' },
      { status: 429 },
    );
  }

  // Sanitize and bound tool name
  const rawToolName = (body.toolName || 'Contractor Diagnostic Tool').slice(0, 60);
  const toolName = rawToolName.replace(/[^\w\s\-–—&()]/gi, '').trim() || 'Contractor Diagnostic Tool';

  // Sanitize and bound summary (max 2000 chars, strip external links to prevent open phishing relay)
  const rawSummary = (typeof body.summary === 'string' ? body.summary : '').slice(0, 2000);
  const sanitizedSummary = rawSummary
    .replace(/https?:\/\/[^\s]+/gi, '[link removed]')
    .replace(/[<>]/g, '');

  try {
    if (process.env.RESEND_API_KEY) {
      const { Resend } = await import('resend');
      const resend = new Resend(process.env.RESEND_API_KEY);
      const { error } = await resend.emails.send({
        from: "Let's Get Quoted Tools <tools@letsgetquoted.com>",
        to: email,
        subject: `Your ${toolName} Summary • Let’s Get Quoted`,
        text: `Here is the summary of your calculations from Let’s Get Quoted:\n\n${sanitizedSummary}\n\nExplore tools and send interactive quotes: https://letsgetquoted.com`,
        tags: [
          { name: 'kind', value: 'tool_report' },
          { name: 'template_version', value: '2_0' },
        ],
      });

      if (error) {
        console.error('[email-report] Resend delivery error:', error);
        return NextResponse.json(
          { error: 'Failed to deliver diagnostic report email' },
          { status: 502 },
        );
      }
    }

    return NextResponse.json({
      success: true,
      message: `Diagnostic report dispatched to ${email}`,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Internal error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
