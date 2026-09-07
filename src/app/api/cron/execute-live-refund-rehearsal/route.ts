import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/auth';
import { refundPayment } from '@/lib/payments';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(request: Request): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get('authorization');
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  const paymentId = '97128a7f-02c7-41e9-8d86-bb8f249245b9';
  const accountId = 'c63293b4-138e-45c2-8e11-0f4e6d7e08e6';
  const targetAmount = 1.00;

  try {
    const result = await refundPayment(admin, accountId, paymentId, targetAmount);

    await admin.from('admin_actions').insert({
      admin_email: 'brett.arnold@live.com',
      action: 'payment_refund',
      account_id: accountId,
      target_type: 'payment',
      target_id: paymentId,
      reason: 'Pre-launch live programmatic refund rehearsal verification',
      meta: {
        amountDollars: targetAmount,
        refundedThisTime: result.amount,
        isFull: result.isFull,
        refundedTotal: result.refundedTotal,
      },
    });

    return NextResponse.json({
      ok: true,
      result,
    });
  } catch (error: any) {
    console.error('execute-live-refund-rehearsal failed:', error);
    return NextResponse.json(
      { ok: false, error: error?.message ?? String(error) },
      { status: 500 }
    );
  }
}
