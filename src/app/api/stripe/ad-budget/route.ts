import { NextResponse } from 'next/server';
import { requireOfficeContext } from '@/lib/auth';
import { createAdBudgetCheckoutSession } from '@/lib/ad-billing';

export async function POST(request: Request) {
  try {
    const { accountId, supabase } = await requireOfficeContext('settings.write');
    const body = await request.json();

    const fundingModel = (body.fundingModel as 'weekly_drip' | 'auto_refill_wallet') || 'weekly_drip';
    const depositAmountDollars = Number(body.depositAmountDollars) || undefined;
    const refillThresholdDollars = Number(body.refillThresholdDollars) || undefined;
    const refillAmountDollars = Number(body.refillAmountDollars) || undefined;
    const maxMonthlySpendDollars = Number(body.maxMonthlySpendDollars) || undefined;

    const weeklyAmountDollars = Number(body.weeklyAmountDollars) || undefined;
    const weeklyAdSpendDollars = Number(body.weeklyAdSpendDollars) || undefined;
    const weeklyFeeDollars = Number(body.weeklyFeeDollars) || undefined;
    const monthlyBudgetDollars = Number(body.monthlyBudgetDollars) || undefined;
    const interval = body.interval === 'month' ? 'month' : 'week';
    const trade = String(body.trade || 'Home Services').trim();
    const city = String(body.city || 'Local Area').trim();
    const returnUrl = String(body.returnUrl || '/dashboard/marketing/ads').trim();

    if (body.action === 'portal') {
      const { createAdBudgetBillingPortalSession } = await import('@/lib/ad-billing');
      const portalUrl = await createAdBudgetBillingPortalSession({
        accountId,
        returnUrl,
      });
      return NextResponse.json({ url: portalUrl });
    }

    if (body.action === 'pause') {
      const { pauseAdCampaign } = await import('@/lib/ad-billing');
      const res = await pauseAdCampaign(supabase, accountId);
      return NextResponse.json(res);
    }

    if (body.action === 'resume') {
      const { resumeAdCampaign } = await import('@/lib/ad-billing');
      const res = await resumeAdCampaign(supabase, accountId);
      return NextResponse.json(res);
    }

    if (body.action === 'cancel') {
      const { cancelAdCampaign } = await import('@/lib/ad-billing');
      const cancelImmediately = Boolean(body.immediate);
      const res = await cancelAdCampaign(supabase, accountId, cancelImmediately);
      return NextResponse.json(res);
    }

    if (body.action === 'update_sms_alerts') {
      const smsAlertsEnabled = Boolean(body.smsAlertsEnabled);
      const smsAlertPhone = typeof body.smsAlertPhone === 'string' ? body.smsAlertPhone.trim() : null;
      const { updateAccountAdBudgetState } = await import('@/lib/ad-billing');
      await updateAccountAdBudgetState(supabase, accountId, {
        smsAlertsEnabled,
        smsAlertPhone,
      });
      return NextResponse.json({ success: true, smsAlertsEnabled, smsAlertPhone });
    }

    const { data: account } = await supabase
      .from('accounts')
      .select('business_name')
      .eq('id', accountId)
      .single();

    const businessName = (account?.business_name as string | null) || 'Contractor';

    const customFocus = typeof body.customFocus === 'string' && body.customFocus.trim() ? body.customFocus.trim() : undefined;
    const smsAlertsEnabled = body.smsAlertsEnabled !== undefined ? Boolean(body.smsAlertsEnabled) : true;
    const smsAlertPhone = typeof body.smsAlertPhone === 'string' && body.smsAlertPhone.trim() ? body.smsAlertPhone.trim() : undefined;

    const result = await createAdBudgetCheckoutSession({
      accountId,
      fundingModel,
      depositAmountDollars,
      refillThresholdDollars,
      refillAmountDollars,
      maxMonthlySpendDollars,
      weeklyAmountDollars,
      weeklyAdSpendDollars,
      weeklyFeeDollars,
      monthlyBudgetDollars,
      interval,
      businessName,
      trade,
      city,
      customFocus,
      smsAlertsEnabled,
      smsAlertPhone,
      returnUrl,
    });

    return NextResponse.json({ url: result.url, sessionId: result.sessionId });
  } catch (err) {
    console.error('Failed to create ad budget session:', err);
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
