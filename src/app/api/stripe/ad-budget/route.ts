import { NextResponse } from 'next/server';
import { requireOfficeContext } from '@/lib/auth';
import { createAdBudgetCheckoutSession } from '@/lib/ad-billing';

export async function POST(request: Request) {
  try {
    const { accountId, supabase } = await requireOfficeContext('settings.write');
    const body = await request.json();

    const monthlyBudgetDollars = Number(body.monthlyBudgetDollars) || 600;
    const trade = String(body.trade || 'Home Services').trim();
    const city = String(body.city || 'Local Area').trim();
    const returnUrl = String(body.returnUrl || '/dashboard/marketing/ads').trim();

    const { data: account } = await supabase
      .from('accounts')
      .select('business_name')
      .eq('id', accountId)
      .single();

    const businessName = (account?.business_name as string | null) || 'Contractor';

    const result = await createAdBudgetCheckoutSession({
      accountId,
      monthlyBudgetDollars,
      businessName,
      trade,
      city,
      returnUrl,
    });

    return NextResponse.json({ url: result.url, sessionId: result.sessionId });
  } catch (err) {
    console.error('Failed to create ad budget checkout session:', err);
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
