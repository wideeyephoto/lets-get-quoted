import Link from 'next/link';
import { redirect } from 'next/navigation';

import { createSupabaseServerClient } from '@/lib/supabase-server';
import { hashInvitationToken } from '@/lib/office-invitations';

export const dynamic = 'force-dynamic';

/**
 * Where an invitation link lands.
 *
 * SIGNED IN FIRST, always. The invitation is addressed to an email address, and
 * `accept_office_invitation` checks it against the signed-in user — so a
 * forwarded link admits nobody. That check cannot happen until there is a user,
 * which is why an anonymous visitor is sent to sign in and returned here rather
 * than being asked to accept and then identify themselves.
 *
 * THE TOKEN NEVER LEAVES THIS PAGE. It arrives in the path, is hashed here, and
 * only the hash reaches the database. It is not logged, not put in a query
 * string, and not passed to the client — a token in a URL a browser keeps is a
 * token in history, in a shared screen, and in whatever proxies the request.
 *
 * EVERY REFUSAL SAYS THE SAME THING. Missing, expired, already used, revoked and
 * addressed-to-someone-else are one message, because distinguishing them lets
 * anybody holding a guessed token learn which workspaces have live invitations.
 */
export default async function OfficeInvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    // Back here after signing in. The token stays in the path it already
    // occupies rather than being copied into a second place.
    redirect(`/login?next=${encodeURIComponent(`/office-invite/${encodeURIComponent(token)}`)}`);
  }

  const { error } = await supabase.rpc('accept_office_invitation', {
    p_token_sha256: hashInvitationToken(token),
  });

  if (!error) {
    // They are now an office user of that workspace. Where that leads is
    // /office-access, which explains what they can and cannot do yet.
    redirect('/office-access');
  }

  const raw = String(error.message ?? '');
  const alreadyIn = raw.includes('office_membership_role_conflict');
  const seatsFull = raw.includes('office_seat_limit_reached');

  return (
    <main className="office-access">
      <div className="office-access-card">
        <p className="office-access-eyebrow">Invitation</p>
        <h1>
          {alreadyIn
            ? 'You\'re already part of this business.'
            : seatsFull
              ? 'There\'s no seat free right now.'
              : 'This invitation can\'t be used.'}
        </h1>
        <p>
          {alreadyIn
            ? 'Your account is already connected to this workspace, so there was nothing to accept.'
            : seatsFull
              ? 'Every office seat on this business\'s plan is in use. Ask whoever invited you to free one up or add a seat, then open the link again.'
              : 'It may have expired, been cancelled, already been used, or been meant for a different email address. Ask whoever invited you to send a new one.'}
        </p>
        <p className="office-access-note">
          You&apos;re signed in as {user.email}. If that isn&apos;t the address the invitation was
          sent to, sign out and sign back in with the right one.
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
