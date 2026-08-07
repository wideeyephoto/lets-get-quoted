import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { createAdminClient } from '@/lib/auth';
import { logWebhookFailure } from '@/lib/webhook-failures';

export const dynamic = 'force-dynamic';

// Resend signs webhooks the Svix way (svix-id/svix-timestamp/svix-signature
// headers, HMAC-SHA256 over "id.timestamp.body"). There's no svix package
// installed and verifying three headers is ~20 lines, so this hand-rolls it
// rather than adding a dependency for one function.
function verifyResendSignature(rawBody: string, headers: Headers, secret: string): boolean {
  const svixId = headers.get('svix-id');
  const svixTimestamp = headers.get('svix-timestamp');
  const svixSignature = headers.get('svix-signature');
  if (!svixId || !svixTimestamp || !svixSignature) return false;

  // Bounds how long a captured payload stays replayable.
  const timestampSeconds = Number(svixTimestamp);
  if (!Number.isFinite(timestampSeconds) || Math.abs(Date.now() / 1000 - timestampSeconds) > 300) {
    return false;
  }

  const secretBytes = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const signedContent = `${svixId}.${svixTimestamp}.${rawBody}`;
  const expected = crypto.createHmac('sha256', secretBytes).update(signedContent).digest('base64');

  // svix-signature can carry multiple space-separated "v1,<base64>" values
  // (secret rotation) — a match against any one of them is valid.
  return svixSignature.split(' ').some((part) => {
    const [version, signature] = part.split(',');
    if (version !== 'v1' || !signature) return false;
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  });
}

type ResendTag = { name: string; value: string };
type ResendWebhookEvent = {
  type: string;
  created_at?: string;
  data: {
    email_id?: string;
    to?: string[] | string;
    tags?: ResendTag[];
    bounce?: { message?: string } | null;
    [key: string]: unknown;
  };
};

const STATUS_BY_EVENT: Record<string, string> = {
  'email.sent': 'sent',
  'email.delivered': 'delivered',
  'email.delivery_delayed': 'delayed',
  'email.bounced': 'bounced',
  'email.complained': 'complained',
};

export async function POST(request: Request) {
  const rawBody = await request.text();
  const secret = process.env.RESEND_WEBHOOK_SECRET;

  if (!secret) {
    console.error('RESEND_WEBHOOK_SECRET is not configured; rejecting Resend webhook');
    // Logged, not just console.error'd. This is the likeliest webhook failure
    // there is — it is the state between registering the endpoint at Resend and
    // the env var reaching a deployment — and it was the one state the Webhook
    // failures panel could not show. Every other branch here writes a row, so an
    // empty panel read as "no webhook problems" while every delivery was being
    // rejected with a 500.
    //
    // Resend retries, so a sustained misconfiguration writes repeat rows. That
    // is the right trade: identical rows read as one problem in the panel, and
    // the alternative is silence about a webhook that is dropping every event.
    await logWebhookFailure({
      source: 'resend',
      errorMessage: 'RESEND_WEBHOOK_SECRET is not set — every delivery is being rejected',
      payloadExcerpt: rawBody.slice(0, 500),
    });
    return NextResponse.json({ error: 'Webhook not configured.' }, { status: 500 });
  }

  if (!verifyResendSignature(rawBody, request.headers, secret)) {
    console.error('Resend webhook signature verification failed');
    await logWebhookFailure({
      source: 'resend',
      errorMessage: 'Signature verification failed',
      payloadExcerpt: rawBody.slice(0, 500),
    });
    return NextResponse.json({ error: 'Invalid signature.' }, { status: 400 });
  }

  let event: ResendWebhookEvent;
  try {
    event = JSON.parse(rawBody);
  } catch (err) {
    console.error('Resend webhook payload was not valid JSON:', err);
    await logWebhookFailure({
      source: 'resend',
      errorMessage: err instanceof Error ? err.message : 'Invalid JSON payload',
      payloadExcerpt: rawBody.slice(0, 500),
    });
    return NextResponse.json({ error: 'Invalid payload.' }, { status: 400 });
  }

  const status = STATUS_BY_EVENT[event.type];
  if (!status) {
    // Event types we don't track (email.clicked, email.opened, ...) — ack and
    // move on, nothing to record.
    return NextResponse.json({ received: true });
  }

  const admin = createAdminClient();
  try {
    const providerId = event.data.email_id;
    if (!providerId) throw new Error(`Resend ${event.type} event carried no email_id`);

    const tags = event.data.tags ?? [];
    const kind = tags.find((t) => t.name === 'kind')?.value ?? 'unknown';
    const accountId = tags.find((t) => t.name === 'account_id')?.value ?? null;
    const recipient = Array.isArray(event.data.to) ? event.data.to[0] : event.data.to;

    // Upsert keyed by provider_id: a send's status only moves forward over its
    // lifecycle (sent -> delivered, or sent -> bounced), so the latest event
    // is always the one worth keeping, never a history of every step.
    const { error } = await admin.from('email_events').upsert(
      {
        account_id: accountId,
        kind,
        recipient: recipient ?? 'unknown',
        provider_id: providerId,
        status,
        error_reason: status === 'bounced' ? event.data.bounce?.message ?? null : null,
        occurred_at: event.created_at ?? new Date().toISOString(),
      },
      { onConflict: 'provider_id' },
    );
    if (error) throw new Error(error.message);
  } catch (err) {
    console.error(`Resend webhook handler threw for event ${event.type}:`, err);
    await logWebhookFailure({
      source: 'resend',
      eventType: event.type,
      referenceId: event.data.email_id ?? null,
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: 'Webhook handler error.' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
