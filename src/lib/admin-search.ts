import type { SupabaseClient } from '@supabase/supabase-js';
import { listAccountsForAdmin, ownerEmailsForAccounts, accountDisplayName, accountIdsByPhone } from '@/lib/admin-accounts';
import { QUICK_STOP_STATUS_LABEL, type QuickStopStatus } from '@/lib/quick-stop';

// Universal Search backend. Staff today look accounts/customers/payments up by
// hand across the Stripe dashboard, the Supabase table editor, and grep-ing
// Slack — this fans one query out across every entity type instead. Same
// ILIKE technique as listAccountsForAdmin (no pg_trgm/full-text search is
// enabled, only pgcrypto). Each branch is independently try/caught so one
// slow or missing table degrades that section only, never blanks the rest of
// the results — same shape as daily-digest.ts's per-signal aggregation.

export type SearchResultKind = 'account' | 'client' | 'quick_stop' | 'payment';
export type SearchSection = 'accounts' | 'clients' | 'quickStops' | 'payments';

export type SearchResult = {
  kind: SearchResultKind;
  id: string;
  title: string;
  subtitle: string | null;
  href: string;
};

export type SearchResults = {
  accounts: SearchResult[];
  clients: SearchResult[];
  quickStops: SearchResult[];
  payments: SearchResult[];
  /** Sections whose query failed; an empty array alone is not an all-clear. */
  unavailable: SearchSection[];
};

type SearchBranch = { rows: SearchResult[]; available: boolean };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function usd(amount: number | null | undefined): string {
  return `$${(Number(amount) || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

// Merge de-duplicating on `id`, preserving first-seen order (earlier arrays win).
function dedupeById<T extends { id: string }>(groups: T[][]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const group of groups) {
    for (const row of group) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      out.push(row);
    }
  }
  return out;
}

async function searchAccounts(admin: SupabaseClient, term: string, limit: number): Promise<SearchBranch> {
  try {
    let available = true;
    const onError = () => { available = false; };
    const digits = term.replace(/[^0-9]/g, '');
    const isPhoneNumber = digits.length >= 7;

    const [rows, phoneRes] = await Promise.all([
      listAccountsForAdmin(admin, { query: term, limit, onError }),
      isPhoneNumber
        ? accountIdsByPhone(admin, digits, limit, onError)
        : Promise.resolve({ accountIds: [], phoneMatchMap: new Map<string, string>() }),
    ]);

    const emails = await ownerEmailsForAccounts(admin, rows.map((r) => r.id), onError);
    return { available, rows: rows.map((r) => {
      const email = emails.get(r.id);
      const matchedPhone = phoneRes.phoneMatchMap.get(r.id);
      const matchedOnEmail = Boolean(email && email.toLowerCase().includes(term.toLowerCase()));
      const parts = [
        matchedPhone ? matchedPhone : null,
        matchedOnEmail ? email : null,
        r.account_number ? `Account #${r.account_number}` : null,
        !matchedOnEmail && email ? email : null,
      ].filter(Boolean);
      return {
        kind: 'account' as const,
        id: r.id,
        title: accountDisplayName(r),
        subtitle: parts.length ? parts.join(' · ') : null,
        href: `/admin/accounts/${r.id}`,
      };
    }) };
  } catch (error) {
    console.error('searchAccounts failed:', error);
    return { rows: [], available: false };
  }
}

type ClientRow = { id: string; account_id: string; name: string; phone: string | null; email: string | null };
const CLIENT_COLUMNS = 'id, account_id, name, phone, email';

async function searchClients(admin: SupabaseClient, term: string, limit: number): Promise<SearchBranch> {
  try {
    const digits = term.replace(/[^0-9]/g, '');
    const isPhone = digits.length >= 7;
    const last10 = digits.length >= 10 ? digits.slice(-10) : digits;
    const last7 = digits.length >= 7 ? digits.slice(-7) : digits;

    const queries = [
      admin.from('clients').select(CLIENT_COLUMNS).is('test_marker', null).ilike('name', `%${term}%`).limit(limit),
      admin.from('clients').select(CLIENT_COLUMNS).is('test_marker', null).ilike('phone', `%${term}%`).limit(limit),
      admin.from('clients').select(CLIENT_COLUMNS).is('test_marker', null).ilike('email', `%${term}%`).limit(limit),
    ];
    if (isPhone) {
      queries.push(
        admin.from('clients').select(CLIENT_COLUMNS).is('test_marker', null).ilike('phone', `%${last10}%`).limit(limit),
        admin.from('clients').select(CLIENT_COLUMNS).is('test_marker', null).ilike('phone', `%${last7}%`).limit(limit),
      );
    }

    const results = await Promise.all(queries);
    for (const res of results) {
      if (res.error) throw res.error;
    }

    const rows = dedupeById<ClientRow>(results.map((r) => (r.data ?? []) as ClientRow[])).slice(0, limit);
    return { available: true, rows: rows.map((r) => ({
      kind: 'client',
      id: r.id,
      title: r.name,
      subtitle: [r.phone, r.email].filter(Boolean).join(' · ') || null,
      href: `/admin/accounts/${r.account_id}`,
    })) };
  } catch (error) {
    console.error('searchClients failed:', error);
    return { rows: [], available: false };
  }
}

type QuickStopRow = {
  id: string;
  account_id: string;
  status: string;
  client_name: string;
  client_phone: string | null;
  client_email: string | null;
};
const QUICK_STOP_COLUMNS = 'id, account_id, status, client_name, client_phone, client_email';

async function searchQuickStops(admin: SupabaseClient, term: string, limit: number): Promise<SearchBranch> {
  try {
    let rows: QuickStopRow[];
    if (UUID_RE.test(term)) {
      const { data, error } = await admin.from('extra_stop_requests').select(QUICK_STOP_COLUMNS).is('test_marker', null).eq('id', term).limit(1);
      if (error) throw error;
      rows = (data ?? []) as QuickStopRow[];
    } else {
      const digits = term.replace(/[^0-9]/g, '');
      const isPhone = digits.length >= 7;
      const last10 = digits.length >= 10 ? digits.slice(-10) : digits;
      const last7 = digits.length >= 7 ? digits.slice(-7) : digits;

      const queries = [
        admin.from('extra_stop_requests').select(QUICK_STOP_COLUMNS).is('test_marker', null).ilike('client_name', `%${term}%`).limit(limit),
        admin.from('extra_stop_requests').select(QUICK_STOP_COLUMNS).is('test_marker', null).ilike('client_phone', `%${term}%`).limit(limit),
        admin.from('extra_stop_requests').select(QUICK_STOP_COLUMNS).is('test_marker', null).ilike('client_email', `%${term}%`).limit(limit),
      ];
      if (isPhone) {
        queries.push(
          admin.from('extra_stop_requests').select(QUICK_STOP_COLUMNS).is('test_marker', null).ilike('client_phone', `%${last10}%`).limit(limit),
          admin.from('extra_stop_requests').select(QUICK_STOP_COLUMNS).is('test_marker', null).ilike('client_phone', `%${last7}%`).limit(limit),
        );
      }

      const results = await Promise.all(queries);
      for (const res of results) {
        if (res.error) throw res.error;
      }
      rows = dedupeById<QuickStopRow>(results.map((r) => (r.data ?? []) as QuickStopRow[]));
    }
    return { available: true, rows: rows.slice(0, limit).map((r) => ({
      kind: 'quick_stop',
      id: r.id,
      title: r.client_name || 'Quick Stop',
      subtitle: QUICK_STOP_STATUS_LABEL[r.status as QuickStopStatus] ?? r.status,
      href: `/admin/quick-stops/${r.id}`,
    })) };
  } catch (error) {
    console.error('searchQuickStops failed:', error);
    return { rows: [], available: false };
  }
}

type PaymentRow = {
  id: string;
  account_id: string;
  label: string | null;
  amount: number | null;
  status: string;
};
const PAYMENT_COLUMNS = 'id, account_id, label, amount, status';

async function searchPayments(admin: SupabaseClient, term: string, limit: number): Promise<SearchBranch> {
  try {
    const isUuid = UUID_RE.test(term);
    const [byId, byCheckout, byIntent, byDispute] = await Promise.all([
      isUuid
        ? admin.from('payments').select(PAYMENT_COLUMNS).is('test_marker', null).eq('id', term).limit(1)
        : Promise.resolve({ data: [] as PaymentRow[] }),
      admin.from('payments').select(PAYMENT_COLUMNS).is('test_marker', null).eq('stripe_checkout_session', term).limit(limit),
      admin.from('payments').select(PAYMENT_COLUMNS).is('test_marker', null).eq('stripe_payment_intent', term).limit(limit),
      admin.from('payments').select(PAYMENT_COLUMNS).is('test_marker', null).eq('stripe_dispute_id', term).limit(limit),
    ]);
    if ('error' in byId && byId.error || byCheckout.error || byIntent.error || byDispute.error) {
      throw ('error' in byId ? byId.error : null) ?? byCheckout.error ?? byIntent.error ?? byDispute.error;
    }
    const rows = dedupeById<PaymentRow>([
      (byId.data ?? []) as PaymentRow[],
      (byCheckout.data ?? []) as PaymentRow[],
      (byIntent.data ?? []) as PaymentRow[],
      (byDispute.data ?? []) as PaymentRow[],
    ]).slice(0, limit);
    return { available: true, rows: rows.map((r) => ({
      kind: 'payment',
      id: r.id,
      title: r.label || `Payment ${r.id.slice(0, 8)}`,
      subtitle: `${r.status} · ${usd(r.amount)}`,
      href: `/admin/payments/${r.id}`,
    })) };
  } catch (error) {
    console.error('searchPayments failed:', error);
    return { rows: [], available: false };
  }
}

export async function searchEverything(
  admin: SupabaseClient,
  query: string,
  opts: { limit?: number } = {},
): Promise<SearchResults> {
  const term = query.trim();
  const limit = opts.limit ?? 8;
  if (!term) {
    return { accounts: [], clients: [], quickStops: [], payments: [], unavailable: [] };
  }

  const [accounts, clients, quickStops, payments] = await Promise.all([
    searchAccounts(admin, term, limit),
    searchClients(admin, term, limit),
    searchQuickStops(admin, term, limit),
    searchPayments(admin, term, limit),
  ]);

  const unavailable: SearchSection[] = [];
  if (!accounts.available) unavailable.push('accounts');
  if (!clients.available) unavailable.push('clients');
  if (!quickStops.available) unavailable.push('quickStops');
  if (!payments.available) unavailable.push('payments');
  return { accounts: accounts.rows, clients: clients.rows, quickStops: quickStops.rows, payments: payments.rows, unavailable };
}
