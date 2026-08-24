import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { createAdminClient, getCurrentMembership } from '@/lib/auth';
import { searchWorkspaceEverything } from '@/lib/workspace-search';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const supabase = createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const membership = await getCurrentMembership(user.id);
    if (!membership.accountId) {
      return NextResponse.json({ error: 'No active workspace' }, { status: 403 });
    }

    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('q') ?? '';
    const limitPerSectionParam = searchParams.get('limit');
    const limitPerSection = limitPerSectionParam ? Math.min(20, Math.max(1, parseInt(limitPerSectionParam, 10))) : 6;

    const admin = createAdminClient();
    const results = await searchWorkspaceEverything(admin, membership.accountId, query, {
      limitPerSection,
    });

    return NextResponse.json(results, {
      headers: {
        'Cache-Control': 'private, no-cache, no-store, must-revalidate',
      },
    });
  } catch (error) {
    console.error('API /api/search error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
