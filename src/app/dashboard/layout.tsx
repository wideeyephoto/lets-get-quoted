import Link from 'next/link';
import { headers } from 'next/headers';
import type { ReactNode } from 'react';
import { requireOwnerContext } from '@/lib/auth';

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
        <div className="stripe-alert-wrap">
          <div className="stripe-alert-banner">
            <span className="stripe-alert-icon" aria-hidden="true">⚠️</span>
            {/* Says which direction the money goes. Stripe here is for taking
                money FROM homeowners; it has nothing to do with paying crew,
                and the old wording ("payouts") was read as though it did. */}
            <div className="stripe-alert-copy">
              <strong>Customer payments are not connected</strong>
              <span>Connect Stripe to accept homeowner deposits and invoice payments.</span>
            </div>
            <Link href="/dashboard/settings" className="btn primary stripe-alert-cta">
              Connect Stripe
            </Link>
          </div>
        </div>
      ) : null}
      {children}
    </>
  );
}
