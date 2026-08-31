import { NextResponse } from 'next/server';
import { getCurrentMembership } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { loadLeadDetail } from '@/lib/lead-detail';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// One lead's detail for the leads pipeline's Focus pane.
//
// This returns a homeowner's contact details and photos of their house, so it
// follows the same shape as /api/jobs/[id]/detail: explicit getUser -> 401,
// owner-only membership -> 403. Deliberately NOT requireOwnerContext() — that
// redirects to /login, which turns a fetch into a 307 with an HTML body the
// caller can't read as JSON.
//
// The session client is used for the queries so row-level security still
// applies; accountId is a second gate, not the only one.
export async function GET(_request: Request, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: 'Sign in to view this lead.' }, { status: 401 });

  const membership = await getCurrentMembership(user.id);
  if (!membership.accountId || membership.role !== 'owner') {
    return NextResponse.json({ error: 'Owner access required.' }, { status: 403 });
  }

  // lead id is a uuid column: a malformed id raises Postgres 22P02, which would
  // surface as a 500 carrying the raw driver message.
  if (!UUID.test(params.id)) {
    return NextResponse.json({ error: 'Not a valid lead id.' }, { status: 400 });
  }

  try {
    const detail = await loadLeadDetail(supabase, membership.accountId, params.id);
    if (!detail) return NextResponse.json({ error: 'Lead not found.' }, { status: 404 });
    return NextResponse.json({ detail });
  } catch {
    // Never echo the driver error — it can name columns and constraints.
    return NextResponse.json({ error: 'Could not load that lead.' }, { status: 500 });
  }
}
