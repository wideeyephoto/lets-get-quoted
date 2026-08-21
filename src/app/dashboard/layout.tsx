/**
 * The full stylesheet, on top of the lite one the root layout already
 * loaded. This tree renders the product's own UI, which is exactly the
 * ~590KB of rules the lite sheet drops.
 *
 * Loading both is deliberate. globals.css contains every rule in
 * globals-lite.css, in the same order, and comes after it — so the last
 * matching declaration for any element is always the one from this file,
 * and the cascade here is identical to what it was when the root layout
 * imported globals.css for everybody. Importing only the DIFFERENCE would
 * be smaller and wrong: it would put rules like .priority-panel after the
 * generic .workspace-section-card that is meant to override them.
 */
import '../globals.css';
import { headers } from 'next/headers';
import type { ReactNode } from 'react';
import { requireDashboardShellContext } from '@/lib/auth';
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

  // The SHELL's guard, not a page's. It admits any member of the workspace so
  // that an office user is not bounced off a page they are allowed to open --
  // every page still runs its own, and all but the deliberately converted ones
  // still run requireOwnerContext. See requireDashboardShellContext.
  const { supabase, accountId, role } = await requireDashboardShellContext();

  const { data: account } = await supabase
    .from('accounts')
    .select('connect_onboarded')
    .eq('id', accountId)
    .maybeSingle();

  // Owners only. An office user cannot connect the business's Stripe account,
  // so the banner would be an instruction they cannot follow about money that
  // is not theirs -- and its action is owner-gated anyway, so pressing it
  // would simply fail.
  const onboarded = role !== 'owner' || (account?.connect_onboarded ?? false);

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
