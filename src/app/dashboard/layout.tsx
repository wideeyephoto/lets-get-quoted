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
import { DASHBOARD_ORIENTATION_TOUR } from '@/lib/product-tour/catalog';
import { filterStepsForUser } from '@/lib/product-tour/access';
import type { TourProgressRecord } from '@/lib/product-tour/types';
import ProductTourRoot from '@/components/product-tour/ProductTourRoot';
import StripeAlertBanner from './StripeAlertBanner';
import { connectStripeFromBannerAction } from './stripe-actions';
import { AssistantProvider } from '@/components/ai-assistant/AssistantProvider';
import AssistantWidget from '@/components/ai-assistant/AssistantWidget';

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
  const { supabase, userId, accountId, role, capabilities, account } = await requireDashboardShellContext();

  // Owners only. An office user cannot connect the business's Stripe account,
  // so the banner would be an instruction they cannot follow about money that
  // is not theirs -- and its action is owner-gated anyway, so pressing it
  // would simply fail.
  const onboarded = role !== 'owner' || ((account as { connect_onboarded?: boolean | null } | null)?.connect_onboarded ?? false);

  // Resolve product tour enablement and progress
  // Server-controlled rollout flag (enabled by default unless explicitly disabled)
  const orientationFlag = process.env.LGQ_DASHBOARD_ORIENTATION_ENABLED;
  const tourEnabled = orientationFlag === undefined || orientationFlag === '1' || orientationFlag === 'true';

  let tourProgress: TourProgressRecord | null = null;
  const allowedStepIds = filterStepsForUser(DASHBOARD_ORIENTATION_TOUR, {
    userId,
    accountId,
    role,
    capabilities,
  }).map((s) => s.id);

  if (tourEnabled) {
    try {
      const { data } = await supabase
        .from('product_tour_progress')
        .select('*')
        .eq('account_id', accountId)
        .eq('user_id', userId)
        .eq('tour_key', DASHBOARD_ORIENTATION_TOUR.key)
        .eq('tour_version', DASHBOARD_ORIENTATION_TOUR.version)
        .maybeSingle();
      tourProgress = (data as TourProgressRecord | null) ?? null;
    } catch {
      // Defensive fallback if migration not yet applied in local/test sandbox
      tourProgress = null;
    }
  }

  return (
    <AssistantProvider>
      {!onboarded ? (
        // The whole bar starts the Stripe connect itself — landing on Settings
        // and hunting for the same button is a step that does nothing.
        <StripeAlertBanner connectAction={connectStripeFromBannerAction} />
      ) : null}
      <ProductTourRoot
        role={role}
        initialProgress={tourProgress}
        allowedStepIds={allowedStepIds}
        enabled={tourEnabled}
      />
      {children}
      <AssistantWidget />
    </AssistantProvider>
  );
}
