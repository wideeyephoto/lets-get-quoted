'use server';

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { createCheckoutSessionForPayment } from '@/lib/payments';

export async function startCheckoutAction(paymentId: string) {
  const h = headers();
  const proto = h.get('x-forwarded-proto') ?? 'http';
  const host = h.get('host');
  const origin = `${proto}://${host}`;

  const url = await createCheckoutSessionForPayment(paymentId, origin);
  redirect(url);
}
