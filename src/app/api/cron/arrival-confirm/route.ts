import { NextResponse } from 'next/server';
import { runMorningConfirmationSweep } from '@/lib/arrival-sweep';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Morning sweep (scheduled in vercel.json): tells today's customers the window
// they can expect, before anybody sets off. Opt-in per account, skipped for any
// job whose crew has already said they're on the way.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get('authorization');
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    return NextResponse.json(await runMorningConfirmationSweep());
  } catch (error) {
    console.error('Morning arrival confirmation sweep failed:', error);
    return NextResponse.json({ error: 'Confirmation sweep failed' }, { status: 500 });
  }
}
