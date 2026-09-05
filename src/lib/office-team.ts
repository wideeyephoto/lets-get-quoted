import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { invitationStatus, type OfficeInvitationRow, type OfficeInvitationStatus } from '@/lib/office-invitations';

/**
 * Who is on the office team, and who has been asked.
 *
 * SERVICE-ROLE, DELIBERATELY, for one read: email addresses live in `auth.users`
 * and no owner session can see that table. The account id comes from the
 * caller's own `requireOwnerContext`, is passed in explicitly, and every query
 * below is filtered by it — so the widened client never widens the scope. That
 * is the same argument the Settings page already makes for its one admin read,
 * and it is worth restating because "use the admin client" is otherwise how a
 * tenant boundary quietly stops existing.
 *
 * A TEAM LIST WITHOUT EMAIL ADDRESSES WOULD BE USELESS. An owner deciding
 * whether to revoke access needs to know whose access it is, and a row of UUIDs
 * cannot answer that.
 */

export type OfficeTeamMember = Readonly<{
  membershipId: string;
  userId: string;
  email: string | null;
  role: 'owner' | 'office';
  joinedAt: string;
  capabilities: readonly string[];
}>;

export type OfficeTeamInvitation = Readonly<{
  id: string;
  email: string;
  status: OfficeInvitationStatus;
  expiresAt: string;
  sendCount: number;
  lastSentAt: string;
}>;

export type OfficeTeam = Readonly<{
  members: readonly OfficeTeamMember[];
  /** Pending only. Accepted ones are members now; the rest are history. */
  invitations: readonly OfficeTeamInvitation[];
  seatLimit: number | null;
  /** Owners AND office users. The founder occupies a seat; see the seat RPC. */
  seatsUsed: number;
}>;

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export async function loadOfficeTeam(
  admin: SupabaseClient,
  accountId: string,
  now: Date = new Date(),
): Promise<OfficeTeam> {
  const empty: OfficeTeam = Object.freeze({
    members: [], invitations: [], seatLimit: null, seatsUsed: 0,
  });

  try {
    const [memberships, invitations, entitlement, memberCapsResult] = await Promise.all([
      admin.from('memberships')
        .select('id, user_id, role, created_at')
        .eq('account_id', accountId)
        .in('role', ['owner', 'office'])
        .order('created_at', { ascending: true }),
      admin.from('office_invitations')
        .select('id, email, expires_at, send_count, last_sent_at, accepted_at, revoked_at')
        .eq('account_id', accountId)
        .is('accepted_at', null)
        .is('revoked_at', null)
        .order('created_at', { ascending: false }),
      admin.from('workspace_entitlements')
        .select('feature_limits')
        .eq('account_id', accountId)
        .maybeSingle(),
      admin.from('office_member_capabilities')
        .select('user_id, capability')
        .eq('account_id', accountId),
    ]);

    if (memberships.error) {
      console.error('office team read failed:', memberships.error);
      return empty;
    }

    const rows = (memberships.data ?? []) as Array<Record<string, unknown>>;

    // One lookup for every member, rather than one per row. `listUsers` would
    // page through every user in the project; this asks for exactly the ones on
    // this workspace and nothing else.
    const emails = new Map<string, string | null>();
    await Promise.all(rows.map(async (row) => {
      const userId = String(row.user_id);
      try {
        const { data } = await admin.auth.admin.getUserById(userId);
        emails.set(userId, text(data?.user?.email));
      } catch {
        // A member whose auth record cannot be read still appears in the list.
        // Hiding them would make somebody with access invisible to the person
        // deciding who has access.
        emails.set(userId, null);
      }
    }));

    const userCapsMap = new Map<string, string[]>();
    if (!memberCapsResult.error && memberCapsResult.data) {
      for (const row of memberCapsResult.data as Array<{ user_id?: string; capability?: string }>) {
        const uid = String(row.user_id ?? '');
        const cap = String(row.capability ?? '');
        if (uid && cap) {
          const list = userCapsMap.get(uid) ?? [];
          list.push(cap);
          userCapsMap.set(uid, list);
        }
      }
    }

    const members = rows.map((row) => {
      const uId = String(row.user_id);
      return Object.freeze({
        membershipId: String(row.id),
        userId: uId,
        email: emails.get(uId) ?? null,
        role: (row.role === 'owner' ? 'owner' : 'office') as 'owner' | 'office',
        joinedAt: String(row.created_at),
        capabilities: Object.freeze(userCapsMap.get(uId) ?? []),
      });
    });

    const pending = ((invitations.error ? [] : invitations.data ?? []) as Array<Record<string, unknown>>)
      .map((row): OfficeInvitationRow => ({
        id: String(row.id),
        email: String(row.email),
        expiresAt: String(row.expires_at),
        sendCount: Number(row.send_count ?? 1),
        lastSentAt: String(row.last_sent_at),
        acceptedAt: null,
        revokedAt: null,
      }))
      // Expired ones are filtered by the query only in the sense that they are
      // still un-accepted and un-revoked. Expiry is derived, so it is applied
      // here rather than trusted to a column nothing maintains.
      .map((row) => Object.freeze({
        id: row.id,
        email: row.email,
        status: invitationStatus(row, now),
        expiresAt: row.expiresAt,
        sendCount: row.sendCount,
        lastSentAt: row.lastSentAt,
      }));

    /**
     * THE LIMIT IS PLAN PLUS ANYTHING BOUGHT, and only the database knows the sum.
     *
     * This read `feature_limits.office_users` alone. The RPC that actually
     * enforces the seat does
     * `plan + workspace_purchased_capacity_units(account, 'office_users')`, so a
     * PURCHASED seat was invisible here: the screen would keep saying every seat
     * was in use and keep the invite button disabled, on the one surface whose
     * job is to let somebody spend the seat they just paid for. Exactly the bug
     * already fixed on the Plan & usage card, one screen over -- and this is the
     * screen that gates the action rather than describing it.
     *
     * office_seat_usage() is that same arithmetic, already deployed and until now
     * called by nothing. Using it means the number shown and the number enforced
     * cannot drift apart.
     *
     * Falls back to the plan allowance if the RPC cannot be reached, because a
     * null seatLimit reads as 'no limit' and ENABLES the button. The database
     * would still refuse, so that is safe rather than permissive -- but showing
     * the plan number is a better answer than showing none.
     */
    const limits = (entitlement.error ? {} : entitlement.data?.feature_limits ?? {}) as Record<string, unknown>;
    const raw = limits.office_users;
    const planLimit = typeof raw === 'number' && Number.isSafeInteger(raw) && raw >= 0 ? raw : null;

    const usage = await admin.rpc('office_seat_usage', { p_account_id: accountId }).maybeSingle();
    const rpcLimit = usage.error ? null : Number((usage.data as { office_limit?: unknown } | null)?.office_limit);
    const seatLimit = Number.isSafeInteger(rpcLimit) && (rpcLimit as number) >= 0 ? (rpcLimit as number) : planLimit;

    return Object.freeze({
      members,
      invitations: pending,
      seatLimit,
      // Owners count. The founder occupies a seat, which is what the seat RPC
      // has always enforced, and a screen that showed otherwise would make the
      // limit look off by one every time it was reached.
      seatsUsed: members.length,
    });
  } catch (error) {
    console.error('office team read threw:', error);
    return empty;
  }
}

/** `2 of 5 seats used`, or the honest version when there is no limit to read. */
export function describeSeats(team: OfficeTeam): string {
  if (team.seatLimit === null) return `${team.seatsUsed} in the office`;
  return `${team.seatsUsed} of ${team.seatLimit} ${team.seatLimit === 1 ? 'seat' : 'seats'} used`;
}
