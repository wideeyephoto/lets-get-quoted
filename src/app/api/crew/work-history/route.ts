import { NextResponse } from 'next/server';
import { createAdminClient, getCurrentMembership } from '@/lib/auth';
import { listCrewWorkHistory } from '@/lib/crew';
import { createSupabaseServerClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: 'Sign in to view crew history.' }, { status: 401 });

  const membership = await getCurrentMembership(user.id);
  if (!membership.accountId || membership.role !== 'owner') {
    return NextResponse.json({ error: 'Owner access required.' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const crewId = searchParams.get('crewId');
  if (!crewId) return NextResponse.json({ error: 'Missing crew member.' }, { status: 400 });

  try {
    const admin = createAdminClient();
    const history = await listCrewWorkHistory(admin, membership.accountId, crewId);
    const totalPaid = history.reduce((sum, item) => sum + item.amount, 0);

    return NextResponse.json({ history, totalPaid });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to load crew work history.' },
      { status: 400 }
    );
  }
}
