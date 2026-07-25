import { NextResponse } from 'next/server';
import { runStalledQuoteFollowups } from '@/lib/followups';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Daily sweep (scheduled in vercel.json) that nudges clients who were sent a
// quote but haven't approved it — up to twice, spaced out, texting when they
// have SMS consent and emailing otherwise. Opt-in per account.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get('authorization');
  // Fail closed: no secret configured, or a mismatched token, means no run.
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const summary = await runStalledQuoteFollowups();
    return NextResponse.json(summary);
  } catch (error) {
    console.error('Quote follow-up cron failed:', error);
    return NextResponse.json({ error: 'Follow-up run failed' }, { status: 500 });
  }
}
