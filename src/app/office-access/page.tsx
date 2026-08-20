import Link from 'next/link';
import { redirect } from 'next/navigation';

import { createAdminClient, getCurrentMembership } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { BUSINESS_NAME_FALLBACK, pickBusinessName } from '@/lib/business-name';

export const dynamic = 'force-dynamic';

/**
 * Where an office user lands.
 *
 * WHY THIS PAGE EXISTS AT ALL. Somebody accepted an invitation, so they have a
 * real membership on a real workspace — and no permissions whatsoever, because
 * `is_owner` still means owner and every policy in the product is built on it.
 * `requireOwnerContext` cannot admit them and must not send them to /login:
 * they are already signed in, so that is an infinite loop, and it would read as
 * a broken account rather than as access that has not been switched on.
 *
 * So it says the true thing plainly. They joined; there is nothing for them to
 * do yet; here is who to ask. A page that pretended otherwise — a stub
 * dashboard, an empty leads list — would be worse, because it would look like
 * the product failing rather than the product being unfinished.
 *
 * OUTSIDE /dashboard on purpose. Everything under that path runs the owner
 * guard, and a page whose entire job is to catch people the guard rejects
 * cannot live behind it.
 */
export default async function OfficeAccessPage() {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const membership = await getCurrentMembership(user.id);

  // An owner who wanders here has a dashboard to be in. Anyone else has no
  // business on this page either.
  if (membership.role === 'owner') redirect('/dashboard');
  if (membership.role !== 'office' || !membership.accountId) redirect('/login');

  // Service-role: the whole point is that this person's session can read
  // nothing about the workspace. The account id came from their own membership,
  // so the widened client never widens the scope — the same argument the
  // Settings page makes for its one admin read.
  const admin = createAdminClient();
  const [{ data: account }, { data: site }] = await Promise.all([
    admin.from('accounts').select('business_name').eq('id', membership.accountId).maybeSingle(),
    admin.from('sites').select('company_name').eq('account_id', membership.accountId).maybeSingle(),
  ]);
  const businessName = pickBusinessName(site, account);

  return (
    <main className="office-access">
      <div className="office-access-card">
        <p className="office-access-eyebrow">You&apos;re on the team</p>
        <h1>
          {/* The fallback is "Your contractor", which reads as nonsense in this
              sentence -- it is written for a homeowner being told who is coming,
              not for an employee being told where they work. */}
          You&apos;ve been added to{' '}
          {businessName === BUSINESS_NAME_FALLBACK ? 'this business' : businessName}.
        </h1>
        <p>
          Your account is set up and connected. Office access isn&apos;t switched on yet, so
          there&apos;s nothing here for you to open — the owner will let you know when it is.
        </p>
        <p className="office-access-note">
          If you were expecting to see jobs, quotes or invoices, ask the person who invited you.
          Nothing has gone wrong with your sign-in.
        </p>
        <div className="office-access-actions">
          <Link className="btn secondary" href="/">Back to the site</Link>
          <form action="/auth/signout" method="post">
            <button type="submit" className="office-access-signout">Sign out</button>
          </form>
        </div>
      </div>
    </main>
  );
}
