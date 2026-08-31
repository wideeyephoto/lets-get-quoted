import { redirect } from 'next/navigation';
import { Resend } from 'resend';
import { APP_ORIGIN } from '@/lib/app-origin';
import { createAdminClient } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { listCrewForUser, type CrewMember } from '@/lib/crew';
import { pickBusinessName } from '@/lib/business-name';
import { readFieldAccount } from '@/lib/field-account';
import { INVITE_EXPIRY_MINUTES } from '@/lib/crew-invite';
import { normalizeTimeClockMode, type TimeClockMode } from '@/lib/time-clock';
import type { SupabaseClient } from '@supabase/supabase-js';
import { renderBrandedEmail, FONT_STACK } from '@/emails/brand';

const TOKEN_EXPIRY_MINUTES = INVITE_EXPIRY_MINUTES;

// Send a crew member a magic link into the mobile field app. Mirrors the owner
// magic-link flow, but routes to /auth/crew-callback (which links the auth user
// to their crew record instead of provisioning a brand-new owner account) and
// lands them on /field.
//
// The host comes from config, never from a caller. This took an `origin`
// argument that /field/login passed straight through from the browser — and a
// server action answers anyone, so that argument let a stranger aim a live
// sign-in token at their own server. See lib/app-origin.
//
// `accountId` makes the invitation SPECIFIC. Somebody on two rosters who is
// invited by one of them should land in that one, not in whichever the app
// happened to pick — so the account rides in the callback URL and becomes the
// remembered choice. Optional because a crew member signing themselves in from
// /field/login has no particular business in mind.
export async function sendCrewMagicLink(email: string, businessName: string, accountId?: string): Promise<void> {
  if (!process.env.RESEND_API_KEY) {
    throw new Error('Email provider is not configured.');
  }

  const admin = createAdminClient();

  if (accountId) {
    const { data: acct } = await admin.from('accounts').select('suspended_at').eq('id', accountId).maybeSingle();
    if (acct?.suspended_at) {
      throw new Error('Account is suspended.');
    }
  }

  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (linkError || !linkData.properties.hashed_token) {
    console.error('Crew magic link generation error:', linkError);
    throw new Error(linkError?.message || 'Failed to generate the sign-in link.');
  }

  const verifyUrl = new URL('/auth/crew-callback', APP_ORIGIN);
  verifyUrl.searchParams.set('token_hash', linkData.properties.hashed_token);
  if (accountId) verifyUrl.searchParams.set('account', accountId);

  const resend = new Resend(process.env.RESEND_API_KEY);
  const { error: emailError } = await resend.emails.send({
    from: `${businessName} via Let's Get Quoted <hello@letsgetquoted.com>`,
    to: email,
    subject: `Sign in to the ${businessName} field app`,
    html: renderBrandedEmail({
      brand: {
        businessName,
        accent: '#0284c7',
        theme: 'blueprint',
        logoUrl: null,
        phone: null,
        siteUrl: APP_ORIGIN,
        replyTo: null,
      },
      preheader: `Access your dispatched jobs and schedule for ${businessName}`,
      eyebrow: 'Field Crew App',
      heading: `Welcome to ${businessName}`,
      paragraphs: [
        'Tap the secure button below to open your assigned jobs, view site schedules, and update job status directly from your phone.',
      ],
      cta: {
        label: 'Open my assigned jobs',
        url: verifyUrl.toString(),
      },
      footerHtml: `<p style="margin:10px 0 0;font-family:${FONT_STACK};font-size:12px;line-height:1.6;color:#64748b">This secure link expires in ${TOKEN_EXPIRY_MINUTES} minutes. If you did not expect this invite, you can safely ignore this email.</p>`,
    }),
    tags: [{ name: 'kind', value: 'crew_magic_link' }],
  });
  if (emailError) {
    console.error('Crew magic link email error:', emailError);
    throw new Error(`Failed to send the sign-in email: ${emailError.message || 'unknown error'}`);
  }
}

/**
 * Record that an invitation went out.
 *
 * Best-effort on purpose. The invite has already been SENT by the time this
 * runs — failing the owner's action because the lifecycle stamp didn't write
 * would tell them the invitation failed when it is sitting in somebody's inbox.
 * A missing stamp shows as "Not invited", which is wrong but harmless and
 * self-correcting the next time they press the button.
 */
export async function stampCrewInvite(admin: SupabaseClient, accountId: string, crewId: string): Promise<void> {
  const now = new Date();
  const { data: existing } = await admin
    .from('crew')
    .select('invite_count')
    .eq('account_id', accountId)
    .eq('id', crewId)
    .maybeSingle();

  const { error } = await admin
    .from('crew')
    .update({
      invited_at: now.toISOString(),
      invite_expires_at: new Date(now.getTime() + INVITE_EXPIRY_MINUTES * 60_000).toISOString(),
      invite_count: (Number(existing?.invite_count) || 0) + 1,
      // Re-inviting somebody is the owner restoring access, whatever the reason
      // it was taken away. Leaving the revocation stamped would send a link that
      // the session guard then refuses, which looks like the app being broken.
      access_revoked_at: null,
    })
    .eq('account_id', accountId)
    .eq('id', crewId);

  if (error) console.error('Crew invite stamp failed:', error.message);
}

/**
 * Take the field app away from somebody who stays on the roster.
 *
 * THREE things, and all three are needed. Clearing user_id alone would let the
 * next magic link re-link them silently. Dropping the membership alone would
 * leave a session whose RLS reads return nothing — a signed-in app full of
 * empty screens rather than an honest "your access was removed". The stamp is
 * what both the linker and the session guard read.
 */
export async function revokeCrewAccess(admin: SupabaseClient, accountId: string, crewId: string): Promise<void> {
  const { data: member } = await admin
    .from('crew')
    .select('user_id')
    .eq('account_id', accountId)
    .eq('id', crewId)
    .maybeSingle();

  const { error } = await admin
    .from('crew')
    .update({ access_revoked_at: new Date().toISOString(), user_id: null })
    .eq('account_id', accountId)
    .eq('id', crewId);
  if (error) throw new Error('Could not remove their field-app access. The field-app migration may not have been run yet.');

  const userId = (member?.user_id as string | null) ?? null;
  if (!userId) return;

  // Only drop the membership if this user has no OTHER live crew row on this
  // account — two rows for one person is a data mistake, but revoking one of
  // them must not lock them out via the other.
  const { data: others } = await admin
    .from('crew')
    .select('id')
    .eq('account_id', accountId)
    .eq('user_id', userId)
    .is('deleted_at', null);
  if ((others ?? []).length > 0) return;

  await admin.from('memberships').delete().eq('account_id', accountId).eq('user_id', userId).eq('role', 'crew');
}

// After a crew member verifies their magic link: link the auth user to every
// crew record that carries their email, and give them a 'crew' membership on
// each of those accounts (so RLS lets them read that account's jobs).
//
// Returns the account ids that were linked — the callback needs them to decide
// whether this person has a choice to make, and to honour a business-specific
// invitation. A revoked row is skipped entirely: it is the one thing standing
// between a removed crew member and a fresh sign-in link.
export async function linkCrewUserByEmail(userId: string, email: string): Promise<string[]> {
  const admin = createAdminClient();
  const normalized = email.trim().toLowerCase();
  const sanitized = normalized.replace(/[%_\\]/g, '\\$&');

  const { data: crewRows } = await admin
    .from('crew')
    .select('id, account_id, user_id, access_revoked_at')
    .ilike('email', sanitized)
    .is('deleted_at', null)
    .eq('active', true);

  // Filtered in code, not in the query: `.is('access_revoked_at', null)` would
  // 42703 on a database that hasn't taken the migration and lock every crew
  // member out of the field app rather than one.
  const rows = (crewRows ?? []).filter((row) => !row.access_revoked_at);
  if (rows.length === 0) return [];

  // Filter out suspended accounts so we never link or grant memberships for suspended workspaces
  const accountIds = Array.from(new Set(rows.map((r) => r.account_id as string)));
  const { data: accounts } = await admin
    .from('accounts')
    .select('id, suspended_at')
    .in('id', accountIds);

  const suspendedSet = new Set(
    (accounts ?? []).filter((a) => a.suspended_at).map((a) => a.id as string),
  );

  const eligibleRows = rows.filter((row) => !suspendedSet.has(row.account_id as string));
  if (eligibleRows.length === 0) return [];

  const signedInAt = new Date().toISOString();

  for (const row of eligibleRows) {
    const patch: Record<string, unknown> = { last_signed_in_at: signedInAt };
    if (!row.user_id) patch.user_id = userId;
    const { error } = await admin.from('crew').update(patch).eq('id', row.id);
    // Pre-migration the sign-in column doesn't exist. Losing the stamp is a
    // worse roster; losing the link is a crew member who cannot sign in.
    if (error && !row.user_id) await admin.from('crew').update({ user_id: userId }).eq('id', row.id);

    // is_member(account_id) drives RLS for the field views. Never clobber an
    // existing membership (e.g. an owner who's also on a crew): insert-if-absent.
    await admin
      .from('memberships')
      .upsert({ account_id: row.account_id, user_id: userId, role: 'crew' }, { onConflict: 'account_id,user_id', ignoreDuplicates: true });
  }
  return eligibleRows.map((row) => row.account_id as string);
}

export type FieldBusiness = { accountId: string; crewId: string; name: string };

export type CrewContext = {
  supabase: ReturnType<typeof createSupabaseServerClient>;
  userId: string;
  accountId: string;
  crew: CrewMember;
  businessName: string;
  /**
   * The account's time clock setting, resolved ADMIN-SIDE.
   *
   * This is the whole reason it sits on the context. getTimeClockMode() reads
   * `accounts`, and crew hold no select policy on that table — so called with
   * the crew's own client it returned no row, no error, and therefore 'off'.
   * "Required" silently became "optional", and the manual hours form the owner
   * had switched off came back. It cannot be read from the session client at
   * all, so it is read once here where the admin client already is.
   */
  timeClockMode: TimeClockMode;
  /** Every business this person is on the roster for. One, almost always. */
  businesses: FieldBusiness[];
};

/**
 * The name each of these businesses trades under.
 *
 * Same precedence as the single-account path — the site's company name, then
 * the account's business name, and the "My Business" placeholder treated as
 * absent wherever it appears.
 */
async function loadBusinessNames(admin: SupabaseClient, accountIds: string[]): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  if (accountIds.length === 0) return names;

  const [{ data: sites }, { data: accounts }] = await Promise.all([
    admin.from('sites').select('account_id, company_name').in('account_id', accountIds),
    admin.from('accounts').select('id, business_name').in('id', accountIds),
  ]);

  const siteByAccount = new Map((sites ?? []).map((row) => [row.account_id as string, row]));
  const accountById = new Map((accounts ?? []).map((row) => [row.id as string, row]));
  for (const accountId of accountIds) {
    names.set(
      accountId,
      pickBusinessName(siteByAccount.get(accountId) ?? null, accountById.get(accountId) ?? null, 'My crew'),
    );
  }
  return names;
}

/**
 * The account row the field app needs, in one read.
 *
 * time_clock_mode arrives with the time-clock migration, so a database that
 * hasn't taken it answers 42703 for the whole select — which would take the
 * business name down with it and leave every field screen branded "My crew".
 * Hence the retry without the column, and 'off' as the answer, which is exactly
 * what the feature means before it exists.
 */
async function loadFieldAccountRow(
  admin: SupabaseClient,
  accountId: string,
): Promise<{ business_name?: string | null; time_clock_mode?: unknown; suspended_at?: string | null } | null> {
  const full = await admin.from('accounts').select('business_name, time_clock_mode, suspended_at').eq('id', accountId).maybeSingle();
  if (!full.error) return full.data as { business_name?: string | null; time_clock_mode?: unknown; suspended_at?: string | null } | null;
  const legacy = await admin.from('accounts').select('business_name, suspended_at').eq('id', accountId).maybeSingle();
  return (legacy.data as { business_name?: string | null; suspended_at?: string | null } | null) ?? null;
}

/** Why a crew session couldn't be resolved. Each maps to a different answer. */
export type CrewContextRefusal = 'no-session' | 'not-crew' | 'choose-business' | 'suspended';

export type CrewContextResult = { ok: true; context: CrewContext } | { ok: false; reason: CrewContextRefusal };

/**
 * The crew session, or the reason there isn't one.
 *
 * Split out from requireCrewContext because a REDIRECT is not a universal
 * answer. Pages want one; the offline queue endpoint wants a 401 with a body
 * the service worker can read, and a 302 to an HTML sign-in page arriving in
 * response to a background replay is how a queued clock-out gets silently
 * dropped as "delivered".
 */
export async function loadCrewContext(): Promise<CrewContextResult> {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: 'no-session' };

  const admin = createAdminClient();
  const rosters = await listCrewForUser(admin, user.id);
  if (rosters.length === 0) return { ok: false, reason: 'not-crew' };

  // The remembered business, or the only one there is. Somebody on two rosters
  // with no choice recorded is sent to make one rather than being handed a
  // stranger's jobs — see /field/choose.
  const chosen = readFieldAccount();
  const crew =
    (chosen ? rosters.find((member) => member.account_id === chosen) : null) ??
    (rosters.length === 1 ? rosters[0] : null);
  if (!crew) return { ok: false, reason: 'choose-business' };

  // Resolve branding and the clock setting via the admin client: crew RLS
  // doesn't grant read on accounts or sites (they hold billing + website
  // config), so the field app gets both here rather than from the session
  // client, which would silently answer "no row".
  const [{ data: site }, accountRow] = await Promise.all([
    // limit(1): a stray duplicate sites row must not hard-fail every field page
    // (maybeSingle throws on >1) now that this read is on the crew-critical path.
    admin.from('sites').select('company_name').eq('account_id', crew.account_id).limit(1).maybeSingle(),
    loadFieldAccountRow(admin, crew.account_id),
  ]);

  if (accountRow?.suspended_at) {
    return { ok: false, reason: 'suspended' };
  }

  // pickBusinessName, not `site || account`: sites.company_name is itself
  // seeded to the "My Business" placeholder, so preferring the site is not
  // enough — the placeholder has to be treated as absent wherever it appears.
  const businessName = pickBusinessName(site, accountRow, 'My crew');

  // Only paid for when there is actually a choice to describe.
  const businesses: FieldBusiness[] =
    rosters.length === 1
      ? [{ accountId: crew.account_id, crewId: crew.id, name: businessName }]
      : await loadBusinessNames(admin, rosters.map((member) => member.account_id)).then((names) =>
          rosters.map((member) => ({
            accountId: member.account_id,
            crewId: member.id,
            name: names.get(member.account_id) ?? 'My crew',
          })),
        );

  return {
    ok: true,
    context: {
      supabase,
      userId: user.id,
      accountId: crew.account_id,
      crew,
      businessName,
      timeClockMode: normalizeTimeClockMode(accountRow?.time_clock_mode),
      businesses,
    },
  };
}

// Guard for field-app pages/actions: requires a logged-in user who is linked to
// an active, non-revoked crew record. Redirects to /field/login otherwise. Uses
// the session (RLS-respecting) client for data reads, resolving identity via
// admin.
export async function requireCrewContext(): Promise<CrewContext> {
  const resolved = await loadCrewContext();
  if (resolved.ok) return resolved.context;
  if (resolved.reason === 'no-session') redirect('/field/login');
  if (resolved.reason === 'not-crew') redirect('/field/login?error=not-crew');
  if (resolved.reason === 'suspended') redirect('/account-suspended');
  redirect('/field/choose');
}

/**
 * The businesses a signed-in user can pick between, without requiring one to
 * already be chosen. Used by /field/choose, which is the page you land on when
 * there IS no choice recorded yet — requireCrewContext would bounce back here.
 */
export async function listFieldBusinesses(): Promise<{ userId: string; businesses: FieldBusiness[] } | null> {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createAdminClient();
  const rosters = await listCrewForUser(admin, user.id);
  if (rosters.length === 0) return { userId: user.id, businesses: [] };

  const accountIds = Array.from(new Set(rosters.map((member) => member.account_id)));
  const { data: accounts } = await admin
    .from('accounts')
    .select('id, suspended_at')
    .in('id', accountIds);

  const suspendedSet = new Set(
    (accounts ?? []).filter((a) => a.suspended_at).map((a) => a.id as string),
  );

  const eligibleRosters = rosters.filter((member) => !suspendedSet.has(member.account_id));
  if (eligibleRosters.length === 0) return { userId: user.id, businesses: [] };

  const names = await loadBusinessNames(admin, eligibleRosters.map((member) => member.account_id));
  return {
    userId: user.id,
    businesses: eligibleRosters.map((member) => ({
      accountId: member.account_id,
      crewId: member.id,
      name: names.get(member.account_id) ?? 'My crew',
    })),
  };
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character] || character);
}
