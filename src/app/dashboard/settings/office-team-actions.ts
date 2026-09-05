'use server';

import { revalidatePath } from 'next/cache';

import { requireOfficeContext } from '@/lib/auth';
import { OFFICE_CAPABILITY_KEYS } from '@/lib/office-permissions';
import { recordAccountEvent } from '@/lib/account-events';
import { APP_ORIGIN } from '@/lib/app-origin';
import { pickBusinessName } from '@/lib/business-name';
import { sendOfficeInvitationEmail } from '@/lib/email';
import {
  hashInvitationToken,
  invitationExpiry,
  invitationLink,
  mintInvitationToken,
} from '@/lib/office-invitations';

/**
 * Inviting and un-inviting office users.
 *
 * THROUGH THE SESSION CLIENT, so the RPCs' own checks run against the
 * caller rather than against the service role. `create_office_invitation` and
 * `revoke_office_invitation` each verify permissions themselves; using the admin
 * client here would bypass that and leave `requireOfficeContext` as the only
 * thing between a public endpoint and somebody else's team.
 *
 * THE LINK IS RETURNED, NOT EMAILED. Sending it would mean a template, a
 * deliverability story and a bounce path, none of which exist yet — and an
 * invitation that silently fails to arrive is worse than one the owner copies
 * and sends themselves, because only the second kind is visibly the owner's
 * problem to chase. Email is the obvious follow-up; a half-built send is not.
 */

/**
 * Success or a reason, never a thrown Error.
 *
 * Next.js redacts anything thrown out of a Server Action in production and
 * replaces it with a digest, so a thrown message reaches the contractor as
 * "An error occurred in the Server Components render". Every sentence in
 * readable() was written for somebody who would never see it. A RETURN VALUE
 * crosses that boundary intact.
 */
export type InviteResult =
  | InviteIssued
  | Readonly<{ ok: false; message: string }>;

export type InviteIssued = Readonly<{
  ok: true;
  /** Shown once. The database holds only its hash and cannot reproduce it. */
  link: string;
  email: string;
  resent: boolean;
  /**
   * Whether the invitation email actually left.
   *
   * Reported rather than assumed. The invitation is real whichever way this
   * goes, so the screen has to say which — an owner who is told it was emailed
   * when it was not will wait for a reply that cannot come, and the link is
   * shown once.
   */
  emailed: boolean;
}>;

/**
 * Maps the database's codes onto something a contractor can act on.
 *
 * RETURNS THE MESSAGE, and callers put it in the RETURN VALUE. It used to
 * build an Error that the actions threw, which meant none of these sentences
 * ever reached anybody in production: Next.js redacts an error thrown out of a
 * Server Action and replaces it with "An error occurred in the Server
 * Components render... a digest property is included". Every message below
 * worked in dev and was invisible in the deployed product, which is the only
 * place a contractor sees it.
 *
 * A returned value crosses that boundary intact.
 */
function readable(error: { code?: string; message?: string; details?: unknown }): string {
  const raw = String(error?.message ?? '');

  if (raw.includes('office_seat_limit_reached')) {
    return (
      'Every office seat on your plan is in use. Remove someone\'s access, or add a seat, then invite again.'
    );
  }
  if (raw.includes('office_invitation_is_crew')) {
    // Its own message, because the answer is different: they are not on the
    // team already, they are on the CREW -- and moving them would take the
    // field app away, which is a decision nobody has made.
    return (
      'That email belongs to someone on your crew. Moving them to the office would '
      + 'take away their field app access, so it has to be done deliberately — '
      + 'get in touch and we will sort it out with you.'
    );
  }
  if (raw.includes('office_invitation_already_a_member')) {
    return 'That person is already on your team.';
  }
  if (raw.includes('office_invitation_resend_limit')) {
    return 'This invitation has been sent too many times. Cancel it and start a new one.';
  }
  if (raw.includes('office_removal_wrong_role')) {
    return (
      'That person owns this business, so their access cannot be removed here.'
    );
  }
  if (raw.includes('office_seat_forbidden')) {
    return 'Only the owner or an authorized office manager of this business can manage office users.';
  }
  if (raw.includes('office_seat_entitlement_unavailable')) {
    return ('Your plan\'s office-user limit could not be read, so nothing was sent. Try again shortly.');
  }
  if (raw.includes('office_invitation_expiry_invalid') || raw.includes('office_invitation_token_invalid')) {
    // Neither is reachable from this action — it mints both values itself — so
    // if one surfaces the bug is here, not in what the owner typed.
    return 'The invitation could not be created. This is a problem on our side.';
  }
  return (raw.trim() || 'The invitation could not be sent. Try again.');
}

export async function inviteOfficeUserAction(input: { email: string }): Promise<InviteResult> {
  const { supabase, accountId } = await requireOfficeContext('team.manage');

  const email = String(input?.email ?? '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 320) {
    return { ok: false, message: 'Enter the email address this person will sign in with.' };
  }

  // Minted here, hashed here, and the plaintext leaves in the return value and
  // nowhere else. It is not logged and not written down.
  const token = mintInvitationToken();

  const { error } = await supabase.rpc('create_office_invitation', {
    p_account_id: accountId,
    p_email: email,
    p_token_sha256: hashInvitationToken(token),
    p_expires_at: invitationExpiry().toISOString(),
  });
  if (error) return { ok: false, message: readable(error) };

  const { data: { user } } = await supabase.auth.getUser();
  await recordAccountEvent({
    accountId,
    kind: 'office_invitation_sent',
    summary: `Office invitation sent to ${email}`,
    actorEmail: user?.email ?? null,
    // The email, never the token or its hash. An audit trail that recorded
    // either would reintroduce exactly what hashing it was meant to prevent.
    meta: { email },
  });

  const link = invitationLink(APP_ORIGIN, token);

  /**
   * BEST EFFORT, AND REPORTED. The invitation row already exists and the link is
   * already valid, so a failed send must not throw away a working invitation —
   * but it must not be dressed up as a success either. The screen shows the link
   * either way and says whether the email went, which is the honest version of
   * both outcomes.
   *
   * The business name is read here rather than assumed: brandFor falls back to a
   * name-only brand, and an email headed 'Your contractor' is worse than none.
   */
  let emailed = false;
  try {
    const [{ data: account }, { data: site }] = await Promise.all([
      supabase.from('accounts').select('business_name').eq('id', accountId).maybeSingle(),
      supabase.from('sites').select('company_name').eq('account_id', accountId).maybeSingle(),
    ]);
    await sendOfficeInvitationEmail({
      accountId,
      businessName: pickBusinessName(site, account),
      recipientEmail: email,
      inviteUrl: link,
    });
    emailed = true;
  } catch (error) {
    // The recipient (masked), never the link.
    const masked = email.replace(/^(.)(.*)(@.*)$/, (_, a, b, c) => `${a}***${c}`);
    console.error(`Office invitation email failed for ${masked}:`, error instanceof Error ? error.message : error);
  }

  revalidatePath('/dashboard/automations');
  return { ok: true, link, email, resent: false, emailed };
}

export async function revokeOfficeInvitationAction(
  input: { invitationId: string },
): Promise<{ ok: true; revoked: boolean } | { ok: false; message: string }> {
  const { supabase, accountId } = await requireOfficeContext('team.manage');

  const { data, error } = await supabase.rpc('revoke_office_invitation', {
    p_invitation_id: String(input?.invitationId ?? ''),
  });
  if (error) return { ok: false, message: readable(error) };

  const { data: { user } } = await supabase.auth.getUser();
  await recordAccountEvent({
    accountId,
    kind: 'office_invitation_revoked',
    summary: data === true ? 'Office invitation cancelled' : 'Office invitation was already closed',
    actorEmail: user?.email ?? null,
    meta: { invitation_id: String(input?.invitationId ?? ''), revoked: data === true },
  });

  revalidatePath('/dashboard/automations');
  // False is a real answer, not a failure: the invitation was already accepted,
  // already cancelled, or belongs to nobody. Revoking an ACCEPTED one does
  // nothing on purpose — removing a person is a different act.
  return { ok: true, revoked: data === true };
}

/**
 * Take office access away.
 *
 * The seat is free the moment the row goes, because seat counting reads
 * memberships directly — there is no second ledger to keep in step.
 *
 * `false` is a real answer: the person was already removed, or was never on
 * this workspace. A second click on a row somebody else just removed is not
 * worth showing anybody an error for.
 */
export async function removeOfficeUserAction(
  input: { userId: string },
): Promise<{ ok: true; removed: boolean } | { ok: false; message: string }> {
  const { supabase, accountId } = await requireOfficeContext('team.manage');

  const { data, error } = await supabase.rpc('remove_office_user', {
    p_account_id: accountId,
    p_user_id: String(input?.userId ?? ''),
  });
  if (error) return { ok: false, message: readable(error) };

  const { data: { user } } = await supabase.auth.getUser();
  await recordAccountEvent({
    accountId,
    kind: 'office_access_removed',
    summary: data === true ? 'Office access removed' : 'Office access was already gone',
    actorEmail: user?.email ?? null,
    meta: { user_id: String(input?.userId ?? ''), removed: data === true },
  });

  revalidatePath('/dashboard/settings');
  return { ok: true, removed: data === true };
}

export type UpdateMemberCapabilitiesResult =
  | { ok: true; capabilities: string[] }
  | { ok: false; message: string };

/**
 * Assign custom granular capabilities to an office team member.
 *
 * Enforces team.manage authority (held by owner and authorized office managers).
 * Restricts updates strictly to members with role 'office' in the caller's account.
 * Owners cannot be restricted; strangers or crew members are refused.
 */
export async function updateOfficeMemberCapabilitiesAction(input: {
  targetUserId: string;
  capabilities: string[];
}): Promise<UpdateMemberCapabilitiesResult> {
  const { supabase, accountId, userId: callerUserId } = await requireOfficeContext('team.manage');

  const targetUserId = String(input?.targetUserId ?? '').trim();
  if (!targetUserId) {
    return { ok: false, message: 'Select a team member to update.' };
  }

  // Ensure target user belongs to this account
  const { data: member, error: memberError } = await supabase
    .from('memberships')
    .select('role')
    .eq('account_id', accountId)
    .eq('user_id', targetUserId)
    .maybeSingle();

  if (memberError || !member) {
    return { ok: false, message: 'That person is not a member of your workspace.' };
  }

  if (member.role === 'owner') {
    return { ok: false, message: 'Account owners hold all workspace permissions unconditionally.' };
  }

  if (member.role !== 'office') {
    return { ok: false, message: 'Permissions can only be customized for office team members.' };
  }

  // Filter requested capabilities against the valid catalog
  const requested = Array.isArray(input?.capabilities) ? input.capabilities : [];
  const validCaps = Array.from(
    new Set(
      requested
        .map((c) => String(c).trim())
        .filter((c) => OFFICE_CAPABILITY_KEYS.includes(c)),
    ),
  );

  // Clear existing grants for this member
  const { error: deleteError } = await supabase
    .from('office_member_capabilities')
    .delete()
    .eq('account_id', accountId)
    .eq('user_id', targetUserId);

  if (deleteError) {
    console.error('Failed to clear existing office capabilities:', deleteError);
    return { ok: false, message: 'Failed to update capabilities. Try again in a moment.' };
  }

  // Insert new grants if any
  if (validCaps.length > 0) {
    const rows = validCaps.map((capability) => ({
      account_id: accountId,
      user_id: targetUserId,
      capability,
      granted_by: callerUserId,
    }));

    const { error: insertError } = await supabase
      .from('office_member_capabilities')
      .insert(rows);

    if (insertError) {
      console.error('Failed to grant office capabilities:', insertError);
      return { ok: false, message: 'Failed to save updated capabilities. Try again.' };
    }
  }

  const { data: { user } } = await supabase.auth.getUser();
  await recordAccountEvent({
    accountId,
    kind: 'office_permissions_updated',
    summary: `Updated office permissions (${validCaps.length} granted)`,
    actorEmail: user?.email ?? null,
    meta: {
      target_user_id: targetUserId,
      capabilities: validCaps,
    },
  });

  revalidatePath('/dashboard/settings');
  return { ok: true, capabilities: validCaps };
}
