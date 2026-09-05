import { NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { createAdminClient } from '@/lib/auth';
import { checkRateLimit, clientIpFrom } from '@/lib/rate-limit';
import type { MerchandiseOrderStatus } from '@/lib/merchandise/types';

export const dynamic = 'force-dynamic';

// In-memory processed event ID cache with 2-hour TTL to guard against webhook replays
const PROCESSED_EVENT_IDS = new Map<string, number>();
const EVENT_TTL_MS = 2 * 60 * 60 * 1000;

function isEventAlreadyProcessed(eventId?: string): boolean {
  if (!eventId) return false;
  const now = Date.now();
  // Prune expired entries
  for (const [id, ts] of PROCESSED_EVENT_IDS.entries()) {
    if (now - ts > EVENT_TTL_MS) {
      PROCESSED_EVENT_IDS.delete(id);
    }
  }
  if (PROCESSED_EVENT_IDS.has(eventId)) {
    return true;
  }
  PROCESSED_EVENT_IDS.set(eventId, now);
  return false;
}

function verifyPrintfulAuth(req: Request, rawBody: string): boolean {
  // Webhook secret strictly uses PRINTFUL_WEBHOOK_SECRET.
  // Never fall back to PRINTFUL_API_KEY as they represent two separate trust boundaries.
  const secret = process.env.PRINTFUL_WEBHOOK_SECRET;

  if (!secret) {
    if (process.env.NODE_ENV === 'test') return true;
    console.warn('Printful webhook secret not configured');
    return false;
  }

  // 1. Check direct key header (Printful X-PF-Webhook-Key / X-Printful-Webhook-Secret)
  const headerKey = req.headers.get('x-pf-webhook-key') || req.headers.get('x-printful-webhook-secret');
  if (headerKey && headerKey === secret) {
    return true;
  }

  // 2. Check HMAC signature (X-Printful-Signature or v2 X-PF-Webhook-Signature)
  const signature = req.headers.get('x-pf-webhook-signature') || req.headers.get('x-printful-signature');
  if (signature) {
    try {
      // Try UTF-8 secret first
      const hmac = createHmac('sha256', secret);
      hmac.update(rawBody, 'utf8');
      const expected = hmac.digest('hex');

      const sigBuf = Buffer.from(signature.toLowerCase());
      const expBuf = Buffer.from(expected.toLowerCase());
      if (sigBuf.length === expBuf.length && timingSafeEqual(sigBuf, expBuf)) {
        return true;
      }

      // If secret is 64-hex chars (Printful v2 secret hex format), try binary decoding
      if (/^[0-9a-fA-F]{64}$/.test(secret)) {
        const hmacHex = createHmac('sha256', Buffer.from(secret, 'hex'));
        hmacHex.update(rawBody, 'utf8');
        const expectedHex = hmacHex.digest('hex');
        const expHexBuf = Buffer.from(expectedHex.toLowerCase());
        if (sigBuf.length === expHexBuf.length && timingSafeEqual(sigBuf, expHexBuf)) {
          return true;
        }
      }
    } catch (err) {
      console.warn('Printful signature calculation error:', err);
    }
  }

  return false;
}

export async function POST(req: Request) {
  try {
    const admin = createAdminClient();
    const ip = clientIpFrom(req.headers);

    // Rate limit: maximum 60 webhook events per minute per IP
    if (!(await checkRateLimit(admin, `printful_webhook:ip:${ip}`, 60, 60))) {
      return NextResponse.json({ ok: false, error: 'Too many requests' }, { status: 429 });
    }

    const rawBody = await req.text();

    // Verify webhook authentication
    if (!verifyPrintfulAuth(req, rawBody)) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    let body: any;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ ok: false, message: 'Invalid JSON body' }, { status: 400 });
    }

    // Replay deduplication check
    const eventId = body?.event_id || (body?.created ? `${body.type}_${body.created}_${body.data?.order?.id}` : undefined);
    if (eventId && isEventAlreadyProcessed(eventId)) {
      return NextResponse.json({ ok: true, message: 'Event already processed' });
    }

    const eventType = body?.type;
    const data = body?.data;

    if (!eventType || !data) {
      return NextResponse.json({ ok: false, message: 'Invalid webhook payload' }, { status: 400 });
    }

    const externalId = data.order?.external_id;
    const printfulOrderId = data.order?.id;

    if (!externalId && !printfulOrderId) {
      return NextResponse.json({ ok: true, message: 'Ignored: No order identifier' });
    }

    // Build target update query helper
    function getOrderUpdateQuery(updates: Record<string, unknown>) {
      const query = admin.from('merchandise_orders').update({
        ...updates,
        updated_at: new Date().toISOString(),
      });
      if (externalId) {
        return query.eq('order_number', externalId);
      }
      return query.eq('printful_order_id', printfulOrderId);
    }

    if (eventType === 'package_shipped') {
      const shipment = data.shipment;
      const trackingNumber = shipment?.tracking_number;
      const carrier = shipment?.carrier;
      const estimatedDelivery = shipment?.estimated_delivery_date || null;

      const { error } = await getOrderUpdateQuery({
        status: 'shipped',
        fulfillment_status: 'shipped',
        tracking_number: trackingNumber,
        tracking_carrier: carrier,
        estimated_delivery_date: estimatedDelivery,
      });

      if (error) {
        console.warn('Could not update merchandise order with shipment info:', error);
      }
    } else if (eventType === 'order_updated') {
      const pfStatus = data.order?.status;
      let status: MerchandiseOrderStatus = 'in_production';
      let fulfillmentStatus = 'in_production';

      if (pfStatus === 'fulfilled') {
        status = 'shipped';
        fulfillmentStatus = 'shipped';
      } else if (pfStatus === 'canceled') {
        status = 'cancelled';
        fulfillmentStatus = 'cancelled';
      } else if (pfStatus === 'failed') {
        status = 'failed';
        fulfillmentStatus = 'failed';
      } else if (pfStatus === 'onhold') {
        status = 'on_hold';
        fulfillmentStatus = 'on_hold';
      } else if (pfStatus === 'inprocess') {
        status = 'in_production';
        fulfillmentStatus = 'in_production';
      }

      await getOrderUpdateQuery({ status, fulfillment_status: fulfillmentStatus });
    } else if (eventType === 'order_failed') {
      await getOrderUpdateQuery({ status: 'failed', fulfillment_status: 'failed' });
    } else if (eventType === 'order_canceled') {
      await getOrderUpdateQuery({ status: 'cancelled', fulfillment_status: 'cancelled' });
    } else if (eventType === 'order_put_hold') {
      await getOrderUpdateQuery({ status: 'on_hold', fulfillment_status: 'on_hold' });
    } else if (eventType === 'order_refunded') {
      await getOrderUpdateQuery({ status: 'refunded', payment_status: 'refunded', fulfillment_status: 'cancelled' });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Printful webhook processing error:', err);
    return NextResponse.json({ ok: false, error: 'Internal error' }, { status: 500 });
  }
}
