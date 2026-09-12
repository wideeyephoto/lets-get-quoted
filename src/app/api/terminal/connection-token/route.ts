import { NextResponse } from 'next/server';
import { requireOfficeContext } from '@/lib/auth';
import { createTerminalConnectionToken } from '@/lib/stripe-terminal';
import { unstable_rethrow } from 'next/navigation';

export async function POST() {
  try {
    const { supabase, accountId } = await requireOfficeContext('payments.collect');
    const token = await createTerminalConnectionToken(supabase, accountId);

    return NextResponse.json({
      secret: token.secret,
      location: token.locationId,
    });
  } catch (error) {
    // A guard denies by calling redirect(), which throws. Without this the
    // denial is swallowed and reported as a 500 carrying NEXT_REDIRECT.
    unstable_rethrow(error);
    console.error('Terminal connection token error:', error);
    const message = error instanceof Error ? error.message : 'Unauthorized or failed to create connection token.';
    const status = message.includes('Unauthorized') || message.includes('Forbidden') ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
