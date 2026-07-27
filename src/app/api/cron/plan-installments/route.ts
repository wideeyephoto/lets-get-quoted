import { NextResponse } from 'next/server';
import { runDuePlanInstallments } from '@/lib/payment-plans';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Daily sweep (scheduled in vercel.json) that charges every payment-plan
// installment due today or earlier off-session against the saved card, and
// retries due failures up to the attempt cap. Same CRON_SECRET auth as the
// other crons. "Paid" is still only ever set by the verified Stripe webhook —
// this just initiates the off-session charges.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get('authorization');
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const summary = await runDuePlanInstallments();
    return NextResponse.json(summary);
  } catch (error) {
    console.error('Payment plan installments cron failed:', error);
    return NextResponse.json({ error: 'Installment run failed' }, { status: 500 });
  }
}
