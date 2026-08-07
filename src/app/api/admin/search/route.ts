import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { searchEverything } from '@/lib/admin-search';

export const dynamic = 'force-dynamic';

// Backs SearchBox's live dropdown. The one deliberate exception to the
// server-actions-only convention in /admin: a client component debouncing
// keystrokes needs a GET endpoint to fetch against. Read-only, so no audit log.
export async function GET(request: Request) {
  const { admin } = await requireAdmin();
  const q = new URL(request.url).searchParams.get('q') ?? '';
  const results = await searchEverything(admin, q, { limit: 6 });
  return NextResponse.json(results);
}
