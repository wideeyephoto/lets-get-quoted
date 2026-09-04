import type { SupabaseClient } from '@supabase/supabase-js';
import { getTrailingVolume } from '@/lib/payments';
import { getTierInfo, type TierInfo } from '@/lib/stripe';
import { getAccountOwnerEmail } from '@/lib/email';
import { getAccountCreditBalanceCents } from '@/lib/admin';
import { listLoginEvents, type LoginEvent } from '@/lib/login-events';
import { listAccountNotes, listAccountTags, type AccountNote, type AccountTag } from '@/lib/account-notes';
import { listAccountAttachments, type AccountAttachment } from '@/lib/account-attachments';
import { listPrivacyRequests, type PrivacyRequest } from '@/lib/privacy-requests';
import type { AccountFilter } from '@/lib/admin-account-filters';
import {
  normalizeAdminEntitlementSnapshot,
  normalizeAdminSubscriptionSnapshot,
  type AdminEntitlementSnapshot,
  type AdminSnapshotRead,
  type AdminSubscriptionSnapshot,
} from '@/lib/admin-plan-authority';

// Data layer for the admin console's account views. All reads use the passed-in
// service-role client (RLS is owner-scoped, so a session client can't cross
// tenants). Kept defensive: newer columns (suspension, quick-stop lock) degrade
// gracefully so the console works before the migration is applied everywhere.

type AdminAccountBaseRow = {
  id: string;
  account_number: number | null;
  business_name: string | null;
  // The public-facing name the owner set in their site settings. Preferred for
  // display — accounts.business_name defaults to the placeholder 'My Business'
  // and many owners only ever set company_name.
  company_name: string | null;
  connect_onboarded: boolean | null;
  // Selected so the list can say HOW FAR through payout setup an account got,
  // not merely that it is unfinished. See lib/admin-account-filters.ts.
  stripe_connect_id: string | null;
  connect_disabled_at: string | null;
  suspended_at: string | null;
  suspended_reason: string | null;
  suspended_by: string | null;
  created_at: string;
  test_marker: string | null;
};

export type AdminAccountRow = AdminAccountBaseRow & {
  /** Canonical plan authority; the legacy account column is not selected. */
  entitlement: AdminSnapshotRead<AdminEntitlementSnapshot>;
};

const ACCOUNT_LIST_COLUMNS =
  'id, account_number, business_name, connect_onboarded, stripe_connect_id, connect_disabled_at, suspended_at, suspended_reason, suspended_by, created_at, test_marker';

const ADMIN_ENTITLEMENT_COLUMNS =
  'account_id, plan_code, billing_interval, billing_status, entitlement_state, catalog_version, platform_fee_bps, period_start, period_end, version, effective_at, updated_at';

const ADMIN_SUBSCRIPTION_COLUMNS =
  'account_id, plan_code, billing_interval, status, catalog_version, platform_fee_bps, current_period_start, current_period_end, cancel_at_period_end, cancel_at, canceled_at, ended_at, updated_at';

/**
 * Narrow a query to one of the named slices the console counts.
 *
 * Every filter here is the exact predicate of a number rendered somewhere else
 * — `not_onboarded` matches getNotOnboardedCount, `payouts_paused` matches
 * getPausedPayouts — so a card's count and the list it links to cannot disagree.
 * Keeping them in one place is the point: two copies of "what counts as not
 * onboarded" drift, and the drift shows up as a number that opens the wrong
 * rows, which is worse than a number that opens nothing.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyAccountFilter(query: any, filter: AccountFilter | undefined, joinedSinceIso?: string) {
  // Composes with the named filter rather than replacing it, so "not onboarded
  // AND joined this month" is expressible. Applied first because it is the
  // cheaper predicate on an indexed column.
  if (joinedSinceIso) query = query.gte('created_at', joinedSinceIso);
  switch (filter) {
    case 'not_onboarded':
      return query.eq('connect_onboarded', false);
    case 'connect_incomplete':
      return query.eq('connect_onboarded', false).not('stripe_connect_id', 'is', null);
    case 'payouts_paused':
      return query.not('connect_disabled_at', 'is', null);
    case 'suspended':
      return query.not('suspended_at', 'is', null);
    default:
      return query;
  }
}

/**
 * The true size of a slice, independent of the page limit.
 *
 * Without this the list header can only report how many rows it fetched, and a
 * capped list that says "50" when the answer is 180 is a number that lies
 * quietly — the failure mode the drill-downs exist to remove.
 */
export async function countAccountsForAdmin(
  admin: SupabaseClient,
  opts: { filter?: AccountFilter; joinedSince?: string; includeTestRecords?: boolean; onError?: (context: string, error: unknown) => void } = {},
): Promise<number> {
  let query = admin.from('accounts').select('id', { count: 'exact', head: true });
  if (!opts.includeTestRecords) query = query.is('test_marker', null);
  const { count, error } = await applyAccountFilter(
    query,
    opts.filter,
    opts.joinedSince,
  );
  if (error) {
    console.error('countAccountsForAdmin failed:', error);
    opts.onError?.('account count', error);
    return 0;
  }
  return count ?? 0;
}

export async function countSyntheticAccounts(admin: SupabaseClient, onError?: (context: string, error: unknown) => void): Promise<number> {
  const { count, error } = await admin.from('accounts').select('id', { count: 'exact', head: true }).not('test_marker', 'is', null);
  if (error) {
    console.error('countSyntheticAccounts failed:', error);
    onError?.('synthetic account count', error);
    return 0;
  }
  return count ?? 0;
}

// The name to show for an account: the site's company_name wins, then the
// account's business_name (unless it's the signup placeholder), then a fallback.
export function accountDisplayName(row: { company_name?: string | null; business_name?: string | null }): string {
  const company = row.company_name?.trim();
  if (company) return company;
  const biz = row.business_name?.trim();
  if (biz && biz.toLowerCase() !== 'my business') return biz;
  return biz || 'Untitled business';
}

/**
 * Which accounts have an owner whose login email matches.
 *
 * Through an RPC because the owner's address lives in auth.users, which
 * PostgREST does not expose — see migrations/2026-08-10-owner-email-lookup.sql
 * for why this is a security-definer function rather than a denormalised column.
 *
 * Returns an empty list rather than throwing on a missing function, so a
 * deployment that runs ahead of its migration degrades to the old
 * name-and-number search instead of breaking the accounts page outright.
 */
export async function accountIdsByOwnerEmail(admin: SupabaseClient, term: string, limit = 50, onError?: (context: string, error: unknown) => void): Promise<string[]> {
  const { data, error } = await admin.rpc('accounts_by_owner_email', { term, max_rows: limit });
  if (error) {
    console.error('accountIdsByOwnerEmail failed:', error);
    onError?.('owner email lookup', error);
    return [];
  }
  return [...new Set(((data ?? []) as { account_id: string }[]).map((r) => r.account_id))];
}

/** Owner emails for a page of accounts, in one round trip rather than one per row. */
export async function ownerEmailsForAccounts(admin: SupabaseClient, ids: string[], onError?: (context: string, error: unknown) => void): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!ids.length) return map;
  const { data, error } = await admin.rpc('owner_emails_for_accounts', { ids });
  if (error) {
    console.error('ownerEmailsForAccounts failed:', error);
    onError?.('owner email hydration', error);
    return map;
  }
  for (const row of (data ?? []) as { account_id: string; email: string | null }[]) {
    if (row.email) map.set(row.account_id, row.email);
  }
  return map;
}

/**
 * Searches phone numbers across accounts, sites, voice inventory, and messaging sender numbers.
 * Matches on the last 10 and last 7 digits so local and E.164 formats both resolve.
 */
export async function accountIdsByPhone(
  admin: SupabaseClient,
  digits: string,
  limit = 50,
  onError?: (context: string, error: unknown) => void,
): Promise<{ accountIds: string[]; phoneMatchMap: Map<string, string> }> {
  const last10 = digits.length >= 10 ? digits.slice(-10) : digits;
  const last7 = digits.length >= 7 ? digits.slice(-7) : digits;
  const phoneMatchMap = new Map<string, string>();
  const accountIds: string[] = [];

  const addMatch = (accId: string, phone: string, source: string) => {
    if (!accId) return;
    if (!accountIds.includes(accId)) accountIds.push(accId);
    if (!phoneMatchMap.has(accId)) phoneMatchMap.set(accId, `${source}: ${phone}`);
  };

  try {
    const [
      acctCallTracking,
      acctSmsNumber,
      acctAlertPhone,
      sitesPhone,
      voiceInventory,
      smsSenders,
    ] = await Promise.all([
      admin.from('accounts').select('id, call_tracking_number').or(`call_tracking_number.ilike.%${last10}%,call_tracking_number.ilike.%${last7}%`).limit(limit),
      admin.from('accounts').select('id, sms_number').or(`sms_number.ilike.%${last10}%,sms_number.ilike.%${last7}%`).limit(limit),
      admin.from('accounts').select('id, alert_phone').or(`alert_phone.ilike.%${last10}%,alert_phone.ilike.%${last7}%`).limit(limit),
      admin.from('sites').select('account_id, phone').or(`phone.ilike.%${last10}%,phone.ilike.%${last7}%`).limit(limit),
      admin.from('voice_number_inventory').select('account_id, e164_number').or(`e164_number.ilike.%${last10}%,e164_number.ilike.%${last7}%`).limit(limit),
      admin.from('sms_sender_numbers').select('account_id, e164_number').or(`e164_number.ilike.%${last10}%,e164_number.ilike.%${last7}%`).limit(limit),
    ]);

    for (const r of (acctCallTracking.data ?? []) as { id: string; call_tracking_number: string }[]) {
      if (r.call_tracking_number) addMatch(r.id, r.call_tracking_number, 'Call tracking');
    }
    for (const r of (acctSmsNumber.data ?? []) as { id: string; sms_number: string }[]) {
      if (r.sms_number) addMatch(r.id, r.sms_number, 'SMS number');
    }
    for (const r of (acctAlertPhone.data ?? []) as { id: string; alert_phone: string }[]) {
      if (r.alert_phone) addMatch(r.id, r.alert_phone, 'Alert phone');
    }
    for (const r of (sitesPhone.data ?? []) as { account_id: string; phone: string }[]) {
      if (r.phone) addMatch(r.account_id, r.phone, 'Site phone');
    }
    for (const r of (voiceInventory.data ?? []) as { account_id: string; e164_number: string }[]) {
      if (r.e164_number) addMatch(r.account_id, r.e164_number, 'Voice inventory');
    }
    for (const r of (smsSenders.data ?? []) as { account_id: string; e164_number: string }[]) {
      if (r.e164_number) addMatch(r.account_id, r.e164_number, 'Messaging sender');
    }

    try {
      const msgSenders = await admin.from('messaging_sender_numbers').select('account_id, phone_number').or(`phone_number.ilike.%${last10}%,phone_number.ilike.%${last7}%`).limit(limit);
      if (!msgSenders.error && msgSenders.data) {
        for (const r of msgSenders.data as { account_id: string; phone_number: string }[]) {
          if (r.phone_number) addMatch(r.account_id, r.phone_number, 'Messaging sender');
        }
      }
    } catch {
      // Table may not exist or may be aliased
    }
  } catch (err) {
    console.error('accountIdsByPhone failed:', err);
    onError?.('phone number lookup', err);
  }

  return { accountIds, phoneMatchMap };
}

// Search accounts by business name, site company name, account number, phone
// numbers (call tracking, sms number, alert phone, site phone, voice inventory,
// messaging sender), or the owner's login email.
export async function listAccountsForAdmin(
  admin: SupabaseClient,
  opts: { query?: string; limit?: number; filter?: AccountFilter; joinedSince?: string; includeTestRecords?: boolean; onError?: (context: string, error: unknown) => void } = {},
): Promise<AdminAccountRow[]> {
  const limit = opts.limit ?? 50;
  const term = opts.query?.trim();
  const filter = opts.filter;
  // Every branch below narrows through this, so a search and a filter compose
  // rather than one silently winning.
  const base = () => {
    let query = admin.from('accounts').select(ACCOUNT_LIST_COLUMNS);
    if (!opts.includeTestRecords) query = query.is('test_marker', null);
    return applyAccountFilter(query, filter, opts.joinedSince);
  };
  let rows: AdminAccountBaseRow[] = [];

  if (term) {
    const digits = term.replace(/[^0-9]/g, '');
    const isPureDigits = /^\d+$/.test(digits);
    const isShortAccountNumber = isPureDigits && digits.length <= 6 && Number(digits) > 0;
    const isPhoneNumber = digits.length >= 7;

    if (isShortAccountNumber) {
      const { data, error } = await base().eq('account_number', Number(digits)).limit(limit);
      if (error) opts.onError?.('account number search', error);
      rows = (data ?? []) as AdminAccountBaseRow[];
    } else {
      const [byBiz, bySite, byEmail, byPhone] = await Promise.all([
        base().ilike('business_name', `%${term}%`).limit(limit),
        admin.from('sites').select('account_id').ilike('company_name', `%${term}%`).limit(limit),
        term.includes('@') || term.includes('.') ? accountIdsByOwnerEmail(admin, term, limit, opts.onError) : Promise.resolve([]),
        isPhoneNumber ? accountIdsByPhone(admin, digits, limit, opts.onError) : Promise.resolve({ accountIds: [], phoneMatchMap: new Map() }),
      ]);
      if (byBiz.error) opts.onError?.('business name search', byBiz.error);
      if (bySite.error) opts.onError?.('site name search', bySite.error);
      const found = (byBiz.data ?? []) as AdminAccountBaseRow[];
      const haveIds = new Set(found.map((r) => r.id));
      const extraIds = [
        ...(bySite.data ?? []).map((s) => (s as { account_id: string }).account_id),
        ...byEmail,
        ...byPhone.accountIds,
      ].filter((id, i, all) => id && !haveIds.has(id) && all.indexOf(id) === i);
      if (extraIds.length) {
        // Re-filtered, not just re-fetched.
        const { data: extra, error } = await base().in('id', extraIds).limit(limit);
        if (error) opts.onError?.('account search hydration', error);
        rows = [...found, ...((extra ?? []) as AdminAccountBaseRow[])];
      } else {
        rows = found;
      }
    }
  } else {
    const { data, error } = await base().order('created_at', { ascending: false }).limit(limit);
    if (error) opts.onError?.('account list', error);
    rows = (data ?? []) as AdminAccountBaseRow[];
  }


  // Stitch each account's site company_name and canonical entitlement in, then
  // order newest-first. Never fill a missing entitlement from accounts.plan:
  // doing so would recreate the split-brain display this read is replacing.
  const ids = rows.map((r) => r.id);
  const nameMap = new Map<string, string | null>();
  const entitlementMap = new Map<string, AdminSnapshotRead<AdminEntitlementSnapshot>>();
  let entitlementReadFailed = false;
  if (ids.length) {
    const [siteResult, entitlementResult] = await Promise.all([
      admin.from('sites').select('account_id, company_name').in('account_id', ids),
      admin.from('workspace_entitlements').select(ADMIN_ENTITLEMENT_COLUMNS).in('account_id', ids),
    ]);
    if (siteResult.error) opts.onError?.('account name hydration', siteResult.error);
    for (const s of siteResult.data ?? []) {
      const row = s as { account_id: string; company_name: string | null };
      nameMap.set(row.account_id, row.company_name);
    }

    if (entitlementResult.error) {
      entitlementReadFailed = true;
      opts.onError?.('account entitlement hydration', entitlementResult.error);
    } else {
      for (const raw of entitlementResult.data ?? []) {
        const row = raw as { account_id?: unknown };
        if (typeof row.account_id !== 'string' || !ids.includes(row.account_id)) continue;
        const normalized = normalizeAdminEntitlementSnapshot(raw, row.account_id);
        entitlementMap.set(row.account_id, normalized);
        if (normalized.kind === 'unavailable') {
          opts.onError?.('account entitlement hydration', new Error('A canonical entitlement snapshot is malformed.'));
        }
      }
    }
  }
  return rows
    .map((r) => ({
      ...r,
      company_name: nameMap.get(r.id) ?? null,
      entitlement: entitlementReadFailed
        ? { kind: 'unavailable' as const }
        : entitlementMap.get(r.id) ?? { kind: 'missing' as const },
    }))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

export type AdminActivity = {
  leads30d: number;
  jobsActive: number;
  paidVolume30dCents: number;
  openDisputes: number;
};

export type AdminPaymentRow = {
  id: string;
  label: string | null;
  amount: number | null;
  status: string | null;
  kind: string | null;
  created_at: string | null;
  paid_at: string | null;
  refunded_amount: number | null;
};

export type AdminAccountDetail = {
  account: Record<string, unknown> | null;
  ownerEmail: string | null;
  site: { company_name: string | null; phone: string | null } | null;
  entitlement: AdminSnapshotRead<AdminEntitlementSnapshot>;
  subscription: AdminSnapshotRead<AdminSubscriptionSnapshot>;
  tier: TierInfo;
  trailingVolume: number;
  activity: AdminActivity;
  recentPayments: AdminPaymentRow[];
  creditBalanceCents: number;
  quickStop: { active: number; total: number; noShows: number };
  loginEvents: LoginEvent[];
  notes: AccountNote[];
  tags: AccountTag[];
  attachments: AccountAttachment[];
  privacyRequests: PrivacyRequest[];
};

const THIRTY_DAYS = 30 * 24 * 3600 * 1000;

export async function getAccountAdminDetail(admin: SupabaseClient, id: string): Promise<AdminAccountDetail | null> {
  const { data: account, error } = await admin.from('accounts').select('*').eq('id', id).maybeSingle();
  if (error || !account) return null;

  const since = new Date(Date.now() - THIRTY_DAYS).toISOString();
  const [
    ownerEmail,
    siteRes,
    entitlementRes,
    subscriptionRes,
    trailingVolume,
    leads30d,
    jobsActive,
    paidRows,
    disputes,
    recentPayments,
    creditBalanceCents,
    esActive,
    esTotal,
    esNoShows,
    loginEvents,
    notes,
    tags,
    attachments,
    privacyRequests,
  ] = await Promise.all([
    getAccountOwnerEmail(admin, id).catch(() => null),
    admin.from('sites').select('company_name, phone').eq('account_id', id).maybeSingle(),
    admin.from('workspace_entitlements').select(ADMIN_ENTITLEMENT_COLUMNS).eq('account_id', id).maybeSingle(),
    admin
      .from('billing_subscriptions')
      .select(ADMIN_SUBSCRIPTION_COLUMNS)
      .eq('account_id', id)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    getTrailingVolume(id).catch(() => 0),
    admin.from('leads').select('id', { count: 'exact', head: true }).is('test_marker', null).eq('account_id', id).gte('created_at', since),
    admin.from('jobs').select('id', { count: 'exact', head: true }).is('test_marker', null).eq('account_id', id).in('status', ['new_lead', 'in_progress']),
    admin.from('payments').select('amount').is('test_marker', null).eq('account_id', id).eq('status', 'paid').gte('paid_at', since),
    admin.from('payments').select('id', { count: 'exact', head: true }).is('test_marker', null).eq('account_id', id).eq('status', 'disputed'),
    admin
      .from('payments')
      .select('id, label, amount, status, kind, created_at, paid_at, refunded_amount')
      .is('test_marker', null)
      .eq('account_id', id)
      .order('created_at', { ascending: false })
      .limit(12),
    getAccountCreditBalanceCents(admin, id),
    admin.from('extra_stop_requests').select('id', { count: 'exact', head: true }).eq('account_id', id).in('status', ['awaiting_contractor', 'contractor_offer_sent', 'awaiting_customer_payment', 'confirmed', 'en_route', 'arrived']),
    admin.from('extra_stop_requests').select('id', { count: 'exact', head: true }).eq('account_id', id),
    admin.from('extra_stop_requests').select('id', { count: 'exact', head: true }).eq('account_id', id).eq('status', 'no_show_confirmed'),
    listLoginEvents(admin, id, 10),
    listAccountNotes(admin, id),
    listAccountTags(admin, id),
    listAccountAttachments(admin, id),
    listPrivacyRequests(admin, id),
  ]);

  const paidVolume30d = (paidRows.data ?? []).reduce((sum, r) => sum + (Number((r as { amount: number }).amount) || 0), 0);
  if (entitlementRes.error) console.error('getAccountAdminDetail entitlement read failed:', entitlementRes.error);
  if (subscriptionRes.error) console.error('getAccountAdminDetail subscription read failed:', subscriptionRes.error);

  return {
    account: account as Record<string, unknown>,
    ownerEmail,
    site: (siteRes.data as { company_name: string | null; phone: string | null } | null) ?? null,
    entitlement: entitlementRes.error
      ? { kind: 'unavailable' }
      : normalizeAdminEntitlementSnapshot(entitlementRes.data, id),
    subscription: subscriptionRes.error
      ? { kind: 'unavailable' }
      : normalizeAdminSubscriptionSnapshot(subscriptionRes.data, id),
    tier: getTierInfo(trailingVolume),
    trailingVolume,
    activity: {
      leads30d: leads30d.count ?? 0,
      jobsActive: jobsActive.count ?? 0,
      paidVolume30dCents: Math.round(paidVolume30d * 100),
      openDisputes: disputes.count ?? 0,
    },
    recentPayments: (recentPayments.data ?? []) as AdminPaymentRow[],
    creditBalanceCents,
    quickStop: { active: esActive.count ?? 0, total: esTotal.count ?? 0, noShows: esNoShows.count ?? 0 },
    loginEvents,
    notes,
    tags,
    attachments,
    privacyRequests,
  };
}
