import { NextResponse } from 'next/server';
import { getCurrentMembership } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ count: 0 }, { status: 401 });

  const membership = await getCurrentMembership(user.id);
  if (!membership.accountId) {
    return NextResponse.json({ count: 0 }, { status: 403 });
  }

  const accountId = membership.accountId;

  try {
    const [{ count: leadCount }, { count: stopCount }] = await Promise.all([
      supabase
        .from('leads')
        .select('*', { count: 'exact', head: true })
        .eq('account_id', accountId)
        .is('deleted_at', null)
        .eq('status', 'won')
        .is('referral_settled_at', null)
        .not('triage->>referredBy', 'is', null),
      supabase
        .from('extra_stop_requests')
        .select('*', { count: 'exact', head: true })
        .eq('account_id', accountId)
        .in('status', ['confirmed', 'en_route', 'arrived', 'completed'])
        .is('referral_settled_at', null)
        .not('intake->>referredBy', 'is', null),
    ]);

    const total = (leadCount ?? 0) + (stopCount ?? 0);
    return NextResponse.json({ count: total });
  } catch {
    return NextResponse.json({ count: 0 });
  }
}
