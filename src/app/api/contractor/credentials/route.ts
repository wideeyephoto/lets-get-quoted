import { NextResponse } from 'next/server';
import { getCurrentMembership, loadHeldCapabilities } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import {
  listContractorCredentials,
  saveContractorCredential,
} from '@/lib/permit-intel';

export const dynamic = 'force-dynamic';

/**
 * GET /api/contractor/credentials
 * Lists all trade licenses, municipal registration PINs, and insurance policies in the vault.
 */
export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
  }

  const membership = await getCurrentMembership(user.id);
  if (!membership.accountId) {
    return NextResponse.json({ error: 'No active workspace.' }, { status: 403 });
  }

  if (membership.role === 'crew') {
    return NextResponse.json({ error: 'Forbidden for crew role.' }, { status: 403 });
  }

  const held = await loadHeldCapabilities(
    membership.role as 'owner' | 'crew' | 'office' | null,
    membership.accountId,
    user.id,
  );

  if (membership.role !== 'owner' && !held.has('jobs.read')) {
    return NextResponse.json({ error: 'Permission jobs.read required.' }, { status: 403 });
  }

  try {
    const credentials = await listContractorCredentials(supabase, membership.accountId);
    return NextResponse.json({ credentials });
  } catch (error) {
    console.error('Error fetching contractor credentials:', error);
    return NextResponse.json({ error: 'Failed to fetch credentials.' }, { status: 500 });
  }
}

/**
 * POST /api/contractor/credentials
 * Saves or updates a credential in the vault.
 */
export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
  }

  const membership = await getCurrentMembership(user.id);
  if (!membership.accountId) {
    return NextResponse.json({ error: 'No active workspace.' }, { status: 403 });
  }

  if (membership.role === 'crew') {
    return NextResponse.json({ error: 'Forbidden for crew role.' }, { status: 403 });
  }

  const held = await loadHeldCapabilities(
    membership.role as 'owner' | 'crew' | 'office' | null,
    membership.accountId,
    user.id,
  );

  if (membership.role !== 'owner' && !held.has('jobs.write')) {
    return NextResponse.json({ error: 'Permission jobs.write required.' }, { status: 403 });
  }

  try {
    const payload = await request.json();
    if (!payload?.holderName || !payload?.issuingAuthority || !payload?.credentialType) {
      return NextResponse.json(
        { error: 'holderName, issuingAuthority, and credentialType are required.' },
        { status: 400 },
      );
    }

    const credential = await saveContractorCredential(supabase, membership.accountId, payload);
    return NextResponse.json({ success: true, credential });
  } catch (error) {
    console.error('Error saving contractor credential:', error);
    const message = error instanceof Error ? error.message : 'Failed to save credential.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
