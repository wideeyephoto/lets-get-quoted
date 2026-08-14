import { redirect } from 'next/navigation';
import { listFieldBusinesses } from '@/lib/crew-auth';
import { readFieldAccount } from '@/lib/field-account';
import { chooseFieldBusinessAction } from './actions';

// Which business are you working for today?
//
// This screen only exists for the person who is on two rosters under one email.
// For everybody else it is unreachable: requireCrewContext resolves a single
// roster without asking, and the callback pins the account when an owner's
// invitation named one. Being asked a question with one possible answer is
// worse than not being asked.

export const dynamic = 'force-dynamic';

export default async function ChooseBusinessPage({ searchParams }: { searchParams: { error?: string } }) {
  const session = await listFieldBusinesses();
  if (!session) redirect('/field/login');
  if (session.businesses.length === 0) redirect('/field/login?error=not-crew');
  // Nothing to choose. Sending them on rather than showing a one-item list is
  // the same reason this page isn't in the navigation.
  if (session.businesses.length === 1) redirect('/field');

  const current = readFieldAccount();

  return (
    <main className="field-main field-choose">
      <h1 className="field-greeting">Which crew?</h1>
      <p className="field-choose-lead">
        You&apos;re on the roster for more than one business. Pick the one you&apos;re working for — you can switch
        whenever you need to.
      </p>

      {searchParams.error === 'not-yours' ? (
        <div className="field-flash is-error">You&apos;re not on that crew. Pick one of these.</div>
      ) : null}

      <div className="field-choose-list">
        {session.businesses.map((business) => (
          <form key={business.accountId} action={chooseFieldBusinessAction.bind(null, business.accountId)}>
            <button type="submit" className="field-choose-option" aria-current={business.accountId === current || undefined}>
              <span className="field-choose-name">{business.name}</span>
              <span aria-hidden="true">›</span>
            </button>
          </form>
        ))}
      </div>

      <form action="/auth/signout" method="post" className="field-choose-out">
        <button type="submit" className="field-signout">Sign out</button>
      </form>
    </main>
  );
}
