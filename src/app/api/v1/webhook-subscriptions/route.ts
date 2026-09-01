import { NextResponse } from 'next/server';
import { publicApiRoute } from '@/lib/public-api/api-wrapper';
import { validateWebhookUrl } from '@/lib/public-api/ssrf-guard';
import {
  generateWebhookSecret,
  encryptWebhookSecret,
} from '@/lib/public-api/webhook-vault-crypto';

const ALLOWED_EVENT_TYPES = new Set(['lead.created', 'lead.updated', 'lead.status_changed']);

export const GET = publicApiRoute(
  async (_req, ctx) => {
    const { data, error } = await ctx.admin
      .from('webhook_subscriptions')
      .select('id, target_url, event_types, secret_preview, status, disabled_reason, consecutive_failures, created_at, updated_at')
      .eq('account_id', ctx.accountId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({
      data: (data ?? []).map((row) => ({
        id: row.id,
        target_url: row.target_url,
        event_types: row.event_types,
        secret_preview: row.secret_preview,
        status: row.status,
        disabled_reason: row.disabled_reason,
        consecutive_failures: row.consecutive_failures,
        created_at: new Date(row.created_at).toISOString(),
        updated_at: new Date(row.updated_at).toISOString(),
      })),
    });
  },
  { requiredScope: 'webhooks.manage' }
);

export const POST = publicApiRoute(
  async (req, ctx) => {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: { code: 'invalid_request', message: 'Request body must be valid JSON.' }, request_id: ctx.requestId },
        { status: 400 }
      );
    }

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json(
        { error: { code: 'invalid_request', message: 'Request body must be a JSON object.' }, request_id: ctx.requestId },
        { status: 400 }
      );
    }

    const raw = body as Record<string, unknown>;
    const targetUrl = typeof raw.target_url === 'string' ? raw.target_url.trim() : '';
    if (!targetUrl) {
      return NextResponse.json(
        { error: { code: 'invalid_request', message: 'Field "target_url" is required.' }, request_id: ctx.requestId },
        { status: 400 }
      );
    }

    // SSRF URL Validation
    const ssrf = await validateWebhookUrl(targetUrl);
    if (!ssrf.safe) {
      return NextResponse.json(
        {
          error: {
            code: 'invalid_request',
            message: `Target URL failed security verification: ${ssrf.reason}`,
          },
          request_id: ctx.requestId,
        },
        { status: 400 }
      );
    }

    if (!Array.isArray(raw.event_types) || raw.event_types.length === 0) {
      return NextResponse.json(
        {
          error: {
            code: 'invalid_request',
            message: 'Field "event_types" must be a non-empty array of event strings.',
          },
          request_id: ctx.requestId,
        },
        { status: 400 }
      );
    }

    const validEventTypes: string[] = [];
    for (const evt of raw.event_types) {
      if (typeof evt === 'string' && ALLOWED_EVENT_TYPES.has(evt.trim())) {
        validEventTypes.push(evt.trim());
      }
    }

    if (validEventTypes.length === 0) {
      return NextResponse.json(
        {
          error: {
            code: 'invalid_request',
            message: 'No valid event types specified. Supported types: lead.created, lead.updated, lead.status_changed.',
          },
          request_id: ctx.requestId,
        },
        { status: 400 }
      );
    }

    const rawSecret = generateWebhookSecret();
    const encryptedSecret = encryptWebhookSecret(rawSecret);
    const secretPreview = `${rawSecret.slice(0, 10)}...`;

    const { data: sub, error: subError } = await ctx.admin
      .from('webhook_subscriptions')
      .insert({
        account_id: ctx.accountId,
        credential_id: ctx.credentialId,
        target_url: targetUrl,
        event_types: Array.from(new Set(validEventTypes)),
        encrypted_secret: encryptedSecret,
        secret_preview: secretPreview,
        status: 'active',
      })
      .select('id, target_url, event_types, secret_preview, status, created_at, updated_at')
      .single();

    if (subError || !sub) {
      throw subError ?? new Error('Failed to create webhook subscription');
    }

    return NextResponse.json(
      {
        id: sub.id,
        target_url: sub.target_url,
        event_types: sub.event_types,
        secret: rawSecret, // RETURNED ONLY ONCE UPON CREATION
        secret_preview: sub.secret_preview,
        status: sub.status,
        created_at: new Date(sub.created_at).toISOString(),
        updated_at: new Date(sub.updated_at).toISOString(),
      },
      { status: 201 }
    );
  },
  {
    requiredScope: 'webhooks.manage',
    requireIdempotency: true,
  }
);
