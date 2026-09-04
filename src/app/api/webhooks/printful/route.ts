import { NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { createAdminClient } from '@/lib/auth';

function verifyPrintfulAuth(req: Request, rawBody: string): boolean {
  const secret = process.env.PRINTFUL_WEBHOOK_SECRET || process.env.PRINTFUL_API_KEY;

  // In test environment, if no secret configured, allow bypass for tests unless a secret is set
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

  // 2. Check HMAC signature (X-Printful-Signature)
  const signature = req.headers.get('x-printful-signature');
  if (signature) {
    try {
      const hmac = createHmac('sha256', secret);
      hmac.update(rawBody, 'utf8');
      const expected = hmac.digest('hex');

      const sigBuf = Buffer.from(signature.toLowerCase());
      const expBuf = Buffer.from(expected.toLowerCase());
      if (sigBuf.length === expBuf.length && timingSafeEqual(sigBuf, expBuf)) {
        return true;
      }
    } catch (err) {
      console.warn('Printful signature calculation error:', err);
    }
  }

  return false;
}

export async function POST(req: Request) {
  try {
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

    const admin = createAdminClient();

    // Handle package shipped
    if (eventType === 'package_shipped') {
      const shipment = data.shipment;
      const trackingNumber = shipment?.tracking_number;
      const carrier = shipment?.carrier;
      const estimatedDelivery = shipment?.estimated_delivery_date || null;

      let query = admin.from('merchandise_orders').update({
        status: 'shipped',
        tracking_number: trackingNumber,
        tracking_carrier: carrier,
        estimated_delivery_date: estimatedDelivery,
        updated_at: new Date().toISOString(),
      });

      if (externalId) {
        query = query.eq('order_number', externalId);
      } else {
        query = query.eq('printful_order_id', printfulOrderId);
      }

      const { error } = await query;
      if (error) {
        console.warn('Could not update merchandise order with shipment info:', error);
      }
    } else if (eventType === 'order_updated') {
      const status = data.order?.status === 'fulfilled' ? 'delivered' : 'in_production';
      let query = admin.from('merchandise_orders').update({
        status,
        updated_at: new Date().toISOString(),
      });

      if (externalId) {
        query = query.eq('order_number', externalId);
      } else {
        query = query.eq('printful_order_id', printfulOrderId);
      }

      await query;
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Printful webhook processing error:', err);
    return NextResponse.json({ ok: false, error: 'Internal error' }, { status: 500 });
  }
}
