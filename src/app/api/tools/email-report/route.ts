import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/auth';
import { checkRateLimit, clientIpFrom } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: NextRequest) {
  const ip = clientIpFrom(request.headers);
  const rateKey = `tool-email-report:${ip || 'anon'}`;
  const admin = createAdminClient();
  const allowed = await checkRateLimit(admin, rateKey, 10, 60);

  if (!allowed) {
    return NextResponse.json(
      { error: 'Too many report requests. Please wait a minute.' },
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
  if (!email || !EMAIL_REGEX.test(email)) {
    return NextResponse.json({ error: 'Valid email address is required' }, { status: 400 });
  }

  const toolName = body.toolName?.trim() || 'Contractor Diagnostic Tool';

  try {
    // Optionally trigger an email delivery via Resend if configured
    if (process.env.RESEND_API_KEY) {
      const { Resend } = await import('resend');
      const resend = new Resend(process.env.RESEND_API_KEY);
      await resend.emails.send({
        from: "Let's Get Quoted Tools <tools@letsgetquoted.com>",
        to: email,
        subject: `Your ${toolName} Summary • Let’s Get Quoted`,
        text: `Here is the summary of your calculations from Let’s Get Quoted:\n\n${body.summary || ''}\n\nExplore tools and send interactive quotes: https://letsgetquoted.com`,
      }).catch((err: unknown) => console.error('[email-report] Failed to send via Resend:', err));
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
