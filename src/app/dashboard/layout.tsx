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
          {/* The whole bar is the target, not a button parked inside it — one
              lit block, one place to click. */}
          <Link href="/dashboard/settings" className="stripe-alert-banner">
            <span className="stripe-alert-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2.6" y="5" width="18.8" height="14" rx="2.6" />
                <path d="M2.6 9.8h18.8M6.4 14.6h4.2" />
              </svg>
            </span>
            {/* Says which direction the money goes. Stripe here is for taking
                money FROM homeowners; it has nothing to do with paying crew,
                and the old wording ("payouts") was read as though it did. */}
            <span className="stripe-alert-copy">
              <strong>Customer payments are not connected</strong>
              <span>Connect Stripe to accept homeowner deposits and invoice payments.</span>
            </span>
            <svg className="stripe-alert-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m9 5 7 7-7 7" />
            </svg>
          </Link>
        </div>
      ) : null}
      {children}
    </>
  );
}
