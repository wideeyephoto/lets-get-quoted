import { timingSafeEqual } from 'node:crypto';

import { NextResponse } from 'next/server';

import { createAdminClient } from '@/lib/auth';
import {
  ingestRegistryCallback,
  parseRegistryCallback,
} from '@/lib/messaging-registry-callback-ingress';
import { redactMessagingRegistrationFailureMessage } from '@/lib/messaging-registration-action-failure';
import { logWebhookFailure } from '@/lib/webhook-failures';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CALLBACK_TOKEN_ENV = 'LGQ_SIGNALWIRE_10DLC_CALLBACK_TOKEN';
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{32,128}$/;

/**
 * Where SignalWire's 10DLC Campaign Registry status callback arrives.
 *
 * WHY THIS ROUTE EXISTS: on 2026-08-21 the individual number assignment for the
 * LGQ shared number failed and the carrier reason was never captured, because
 * no callback had ever been registered. This route is the receiving half; the
 * outbound half is requireExactSignalWire10dlcStatusCallback in
 * messaging-number-provisioning, which refuses to register a callback URL until
 * this route and its token exist.
 *
 * A DIFFERENT AUTHENTICATION POSTURE FROM THE OTHER SMS WEBHOOKS, for two
 * reasons that are both structural rather than preference:
 *
 * 1. Nothing establishes that SignalWire signs Campaign Registry callbacks at
 *    all. SIGNALWIRE_SIGNING_KEY is documented for Messaging inbound/status and
 *    the compatibility voice routes, and the AI Agent surface measurably sends
 *    no signature whatsoever. Gating on a signature that is never sent would
 *    403 every delivery and lose the next reason exactly as the last one was
 *    lost -- which is the specific failure this route exists to prevent.
 * 2. The outbound URL validators reject credentials, query strings and
 *    fragments, so a `?token=` secret and HTTP Basic are both unavailable. A
 *    path segment is the only channel the provider will accept from us.
 *
 * So the token IS the authentication, it is used nowhere else, and it never
 * reaches the database: request_path is stored with the segment replaced.
 *
 * If a capture later proves the registry surface is signed, migrating to HMAC
 * additionally requires a STATIC path plus an entry in
 * SIGNED_PROVIDER_CALLBACK_PATHS (src/lib/sms-provider.ts) -- validateWebhookSignature
 * builds no candidate URL for a path outside that set and reports the failure
 * as `mismatch`, which is indistinguishable from a wrong key.
 */

function constantTimeEquals(leftValue: string, rightValue: string): boolean {
  const left = Buffer.from(leftValue, 'utf8');
  const right = Buffer.from(rightValue, 'utf8');
  if (left.length !== right.length) {
    // Do a real comparison even on a length mismatch so this branch does not
    // turn the secret length into an early-return timing oracle.
    timingSafeEqual(left, left);
    return false;
  }
  return timingSafeEqual(left, right);
}

/** Values worth keeping verbatim. An HMAC value discloses no key, and capturing
 *  it is what allows the signing scheme to be verified offline later. */
const HEADER_VALUE_ALLOWLIST = ['content-type', 'user-agent', 'content-length', 'accept'];
const HEADER_VALUE_PREFIXES = ['x-signalwire-', 'x-twilio-'];
/** Reusable authentication material: record presence only, never the value. */
const HEADER_PRESENCE_ONLY = ['authorization', 'cookie', 'proxy-authorization'];

function captureHeaders(request: Request): {
  headers: Record<string, unknown>;
  signatureHeaderName: string | null;
  signatureHeaderValue: string | null;
} {
  const headers: Record<string, unknown> = {};
  let signatureHeaderName: string | null = null;
  let signatureHeaderValue: string | null = null;

  request.headers.forEach((value, rawName) => {
    const name = rawName.toLowerCase();
    if (HEADER_PRESENCE_ONLY.includes(name)) {
      headers[name] = { present: true };
      return;
    }
    const keepValue = HEADER_VALUE_ALLOWLIST.includes(name)
      || HEADER_VALUE_PREFIXES.some((prefix) => name.startsWith(prefix));
    headers[name] = keepValue ? value.slice(0, 512) : { present: true };

    if (name === 'x-signalwire-signature' || name === 'x-twilio-signature') {
      signatureHeaderName = name;
      signatureHeaderValue = value.slice(0, 512);
    }
  });

  return { headers, signatureHeaderName, signatureHeaderValue };
}

export async function POST(
  request: Request,
  context: { params: { token: string } },
) {
  const expected = (process.env[CALLBACK_TOKEN_ENV] ?? '').trim();

  // NOT CONFIGURED IS NOT THE SAME AS NOT AUTHORIZED. Collapsing them makes
  // "the variable never reached the build" and "the token is wrong" the same
  // answer, and per the standing Vercel lesson the first is the likelier of the
  // two: environment is baked at build, so a freshly added token does nothing
  // until a redeploy.
  if (!TOKEN_SHAPE.test(expected)) {
    await logWebhookFailure({
      source: 'sms_registry',
      errorMessage: `Registry callback endpoint has no valid ${CALLBACK_TOKEN_ENV} configured`,
    });
    return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  }

  // Compare BEFORE reading the body: an unauthenticated caller must never make
  // the server parse input on their behalf.
  const supplied = context.params?.token ?? '';
  if (!constantTimeEquals(supplied, expected)) {
    // A fixed reason code only. The supplied value is a probe and a near-miss
    // would disclose how close an attacker is.
    await logWebhookFailure({
      source: 'sms_registry',
      errorMessage: 'Registry callback authentication failed: mismatch',
    });
    return new NextResponse(null, { status: 401 });
  }

  const url = new URL(request.url);
  // The token must never reach the database. Everything else about the request
  // line is evidence worth keeping.
  // Position-based, not a substring replace on the token: params arrive
  // URL-decoded while url.pathname does not, so a percent-encoded segment
  // authenticates correctly and then survives a `.replace(expected, ...)`
  // untouched. Matching the segment by position cannot miss.
  const requestPath = url.pathname.replace(
    /\/api\/sms\/registry-status\/[^/?#]+/,
    '/api/sms/registry-status/[redacted]',
  );
  const contentType = request.headers.get('content-type');
  const { headers, signatureHeaderName, signatureHeaderValue } = captureHeaders(request);

  let rawBody: string;
  try {
    rawBody = await request.clone().text();
  } catch {
    await logWebhookFailure({
      source: 'sms_registry',
      errorMessage: 'Registry callback body could not be read',
    });
    // Ask for a redelivery: nothing was stored, so there is something to regain.
    return NextResponse.json({ error: 'Receipt unavailable.' }, { status: 503 });
  }

  const parsed = parseRegistryCallback(rawBody, contentType);

  // Redact before storage. The carrier reason is free text from outside and may
  // quote a URL, an identifier, or a credential back at us.
  const failureDetail = parsed.failureDetail
    ? redactMessagingRegistrationFailureMessage(parsed.failureDetail)
    : parsed.parseError
      ? redactMessagingRegistrationFailureMessage(parsed.parseError)
      : null;

  try {
    const result = await ingestRegistryCallback(createAdminClient(), {
      parsed,
      rawBody: rawBody.slice(0, 65536),
      contentType: contentType ? contentType.slice(0, 255) : null,
      requestMethod: 'POST',
      requestPath: requestPath.slice(0, 2048),
      requestHeaders: headers,
      signatureHeaderName,
      signatureHeaderValue,
      failureDetail,
    });

    // A callback naming an order we cannot resolve is stored, not rejected, and
    // is still a 204: the provider did its job and a 4xx would only make it
    // discard the delivery. `unmatched` is visible in the row for an operator.
    if (result.disposition === 'unmatched') {
      await logWebhookFailure({
        source: 'sms_registry',
        eventType: parsed.normalizedState ?? undefined,
        referenceId: parsed.orderId ?? undefined,
        errorMessage: 'Registry callback did not correlate to a registration application',
      });
    }

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    // Nothing durable was written, so a retry is worth having. This is the one
    // case where 503 is honest rather than noise.
    await logWebhookFailure({
      source: 'sms_registry',
      referenceId: parsed.orderId ?? undefined,
      errorMessage: redactMessagingRegistrationFailureMessage(
        error instanceof Error ? error.message : 'Registry callback storage failed',
      ),
    });
    return NextResponse.json({ error: 'Receipt unavailable.' }, { status: 503 });
  }
}
