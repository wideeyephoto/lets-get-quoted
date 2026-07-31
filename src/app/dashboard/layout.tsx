import { headers } from 'next/headers';
import type { ReactNode } from 'react';
import { requireOwnerContext } from '@/lib/auth';
import StripeAlertBanner from './StripeAlertBanner';
import { connectStripeFromBannerAction } from './stripe-actions';

// Wraps every /dashboard/** page. Shows a hard-to-miss banner whenever Stripe
// payouts aren't connected yet, since that blocks the core business function
// (getting paid) — surfaced here so it's visible from any dashboard page, not
// just the dashboard home.
export default async function DashboardLayout({ children }: { children: ReactNode }) {
  // The site builder's bare preview route renders the raw public template
  // with no dashboard chrome (embedded in an iframe) — never inject the
  // banner there, it would corrupt the "what visitors actually see" preview.
  const isBarePreview = headers().get('x-lgq-bare-preview') === '1';

  if (isBarePreview) {
    return <>{children}</>;
  }

  const { supabase, accountId } = await requireOwnerContext();

  const { data: account } = await supabase
    .from('accounts')
    .select('connect_onboarded')
    .eq('id', accountId)
    .maybeSingle();

  const onboarded = account?.connect_onboarded ?? false;

  return (
    <>
      {!onboarded ? (
        // The whole bar starts the Stripe connect itself — landing on Settings
        // and hunting for the same button is a step that does nothing.
        <StripeAlertBanner connectAction={connectStripeFromBannerAction} />
      ) : null}
      {children}
    </>
  );
}
