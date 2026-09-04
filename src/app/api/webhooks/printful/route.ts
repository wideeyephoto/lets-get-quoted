import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/auth';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const eventType = body?.type;
    const data = body?.data;

    if (!eventType || !data) {
      return NextResponse.json({ ok: false, message: 'Invalid webhook payload' }, { status: 400 });
    }

    const admin = createAdminClient();
    const externalId = data.order?.external_id;
    const printfulOrderId = data.order?.id;

    if (!externalId && !printfulOrderId) {
      return NextResponse.json({ ok: true, message: 'Ignored: No order identifier' });
    }

    // Handle package shipped
    if (eventType === 'package_shipped') {
      const shipment = data.shipment;
      const trackingNumber = shipment?.tracking_number;
      const carrier = shipment?.carrier;

      let query = admin.from('merchandise_orders').update({
        status: 'shipped',
        tracking_number: trackingNumber,
        tracking_carrier: carrier,
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
