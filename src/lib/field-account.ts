import { cookies } from 'next/headers';

// WHICH BUSINESS this crew member is looking at.
//
// One person, one email, two contractors. It happens — a jobbing carpenter on
// two rosters, somebody moving between firms, a spouse helping with both. The
// magic-link callback links every crew row carrying that email, which is right,
// and the app then picked the first active row, which is not: they'd open the
// field app, see a stranger's jobs, and have no control anywhere on the screen
// that could say "not this one".
//
// So the choice is explicit and it is remembered here. A cookie rather than a
// column because it is a property of THIS PHONE, not of the person: the same
// crew member can legitimately have the app open on two devices pointed at two
// businesses, and writing the choice to their crew row would make each one
// fight the other.

export const FIELD_ACCOUNT_COOKIE = 'field_account';

// A year. The choice is sticky by design — somebody who works for two firms
// mostly works for one of them today, and being asked again every week is the
// behavior this exists to remove.
const MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

export async function readFieldAccount(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(FIELD_ACCOUNT_COOKIE)?.value?.trim() || null;
}

/**
 * Remember the business.
 *
 * httpOnly: nothing in the browser needs to read this, and it decides which
 * account's data a session is served. sameSite lax so a magic link landing from
 * an email client still arrives carrying it.
 *
 * Only callable from a Server Action or Route Handler — Next forbids setting a
 * cookie during a page render, which is why the picker is an action.
 */
export async function writeFieldAccount(accountId: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(FIELD_ACCOUNT_COOKIE, accountId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function clearFieldAccount(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(FIELD_ACCOUNT_COOKIE);
}
