import { NextResponse } from 'next/server';
import { getCurrentMembership } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { loadClientDetail } from '@/lib/client-detail';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// One customer's detail for the Clients pane's Focus view.
//
// Same shape as /api/leads/[id]/detail and /api/jobs/[id]/detail, for the same
// reasons: this returns a homeowner's address, phone and payment history, so it
// does an explicit getUser -> 401 and an owner-only membership -> 403.
// Deliberately NOT requireOwnerContext() — that redirects to /login, which turns
// a fetch into a 307 with an HTML body the caller cannot read as JSON.
//
// The session client runs the queries so row-level security still applies;
// accountId is a second gate, not the only one.
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: 'Sign in to view this customer.' }, { status: 401 });

  const membership = await getCurrentMembership(user.id);
  if (!membership.accountId || membership.role !== 'owner') {
    return NextResponse.json({ error: 'Owner access required.' }, { status: 403 });
  }

  // client id is a uuid column: a malformed id raises Postgres 22P02, which
  // would surface as a 500 carrying the raw driver message.
  if (!UUID.test(params.id)) {
    return NextResponse.json({ error: 'Not a valid customer id.' }, { status: 400 });
  }

  try {
    const detail = await loadClientDetail(supabase, membership.accountId, params.id);
    if (!detail) return NextResponse.json({ error: 'Customer not found.' }, { status: 404 });
    return NextResponse.json({ detail });
  } catch {
    // Never echo the driver error — it can name columns and constraints.
    return NextResponse.json({ error: 'Could not load that customer.' }, { status: 500 });
  }
}
