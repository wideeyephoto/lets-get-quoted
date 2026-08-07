import type { SupabaseClient } from '@supabase/supabase-js';
import { listAccountsForAdmin, ownerEmailsForAccounts, accountDisplayName } from '@/lib/admin-accounts';
import { QUICK_STOP_STATUS_LABEL, type QuickStopStatus } from '@/lib/quick-stop';

// Universal Search backend. Staff today look accounts/customers/payments up by
// hand across the Stripe dashboard, the Supabase table editor, and grep-ing
// Slack — this fans one query out across every entity type instead. Same
// ILIKE technique as listAccountsForAdmin (no pg_trgm/full-text search is
// enabled, only pgcrypto). Each branch is independently try/caught so one
// slow or missing table degrades that section only, never blanks the rest of
// the results — same shape as daily-digest.ts's per-signal aggregation.

export type SearchResultKind = 'account' | 'client' | 'quick_stop' | 'payment';

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
};

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

async function searchAccounts(admin: SupabaseClient, term: string, limit: number): Promise<SearchResult[]> {
  try {
    // Matches on business name, site company name, account number, and — since
    // the owner-email RPC exists — the contractor's own login address. That last
    // one is the reason this page previously misled: it advertised "email" and
    // searched clients.email, which is the contractors' HOMEOWNERS, so a staff
    // member pasting a contractor's address got a confident "no results".
    const rows = await listAccountsForAdmin(admin, { query: term, limit });
    const emails = await ownerEmailsForAccounts(admin, rows.map((r) => r.id));
    return rows.map((r) => {
      const email = emails.get(r.id);
      // The owner email leads the subtitle when it is what matched, so the
      // reason a row is in the list is visible rather than guessed at.
      const matchedOnEmail = Boolean(email && email.toLowerCase().includes(term.toLowerCase()));
      const parts = [
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
    });
  } catch {
    return [];
  }
}

type ClientRow = { id: string; account_id: string; name: string; phone: string | null; email: string | null };
const CLIENT_COLUMNS = 'id, account_id, name, phone, email';

async function searchClients(admin: SupabaseClient, term: string, limit: number): Promise<SearchResult[]> {
  try {
    const [byName, byPhone, byEmail] = await Promise.all([
      admin.from('clients').select(CLIENT_COLUMNS).ilike('name', `%${term}%`).limit(limit),
      admin.from('clients').select(CLIENT_COLUMNS).ilike('phone', `%${term}%`).limit(limit),
      admin.from('clients').select(CLIENT_COLUMNS).ilike('email', `%${term}%`).limit(limit),
    ]);
    const rows = dedupeById<ClientRow>([
      (byName.data ?? []) as ClientRow[],
      (byPhone.data ?? []) as ClientRow[],
      (byEmail.data ?? []) as ClientRow[],
    ]).slice(0, limit);
    return rows.map((r) => ({
      kind: 'client',
      id: r.id,
      title: r.name,
      subtitle: [r.phone, r.email].filter(Boolean).join(' · ') || null,
      // Clients have no standalone admin page — surface them via their account.
      href: `/admin/accounts/${r.account_id}`,
    }));
  } catch {
    return [];
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

async function searchQuickStops(admin: SupabaseClient, term: string, limit: number): Promise<SearchResult[]> {
  try {
    let rows: QuickStopRow[];
    if (UUID_RE.test(term)) {
      const { data } = await admin.from('extra_stop_requests').select(QUICK_STOP_COLUMNS).eq('id', term).limit(1);
      rows = (data ?? []) as QuickStopRow[];
    } else {
      // Quick Stops carry their own customer fields (independent of `clients`),
      // so this is a second, separate fan-out rather than a join.
      const [byName, byPhone, byEmail] = await Promise.all([
        admin.from('extra_stop_requests').select(QUICK_STOP_COLUMNS).ilike('client_name', `%${term}%`).limit(limit),
        admin.from('extra_stop_requests').select(QUICK_STOP_COLUMNS).ilike('client_phone', `%${term}%`).limit(limit),
        admin.from('extra_stop_requests').select(QUICK_STOP_COLUMNS).ilike('client_email', `%${term}%`).limit(limit),
      ]);
      rows = dedupeById<QuickStopRow>([
        (byName.data ?? []) as QuickStopRow[],
        (byPhone.data ?? []) as QuickStopRow[],
        (byEmail.data ?? []) as QuickStopRow[],
      ]);
    }
    return rows.slice(0, limit).map((r) => ({
      kind: 'quick_stop',
      id: r.id,
      title: r.client_name || 'Quick Stop',
      subtitle: QUICK_STOP_STATUS_LABEL[r.status as QuickStopStatus] ?? r.status,
      href: `/admin/quick-stops/${r.id}`,
    }));
  } catch {
    return [];
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

async function searchPayments(admin: SupabaseClient, term: string, limit: number): Promise<SearchResult[]> {
  try {
    const isUuid = UUID_RE.test(term);
    const [byId, byCheckout, byIntent, byDispute] = await Promise.all([
      isUuid
        ? admin.from('payments').select(PAYMENT_COLUMNS).eq('id', term).limit(1)
        : Promise.resolve({ data: [] as PaymentRow[] }),
      admin.from('payments').select(PAYMENT_COLUMNS).eq('stripe_checkout_session', term).limit(limit),
      admin.from('payments').select(PAYMENT_COLUMNS).eq('stripe_payment_intent', term).limit(limit),
      admin.from('payments').select(PAYMENT_COLUMNS).eq('stripe_dispute_id', term).limit(limit),
    ]);
    const rows = dedupeById<PaymentRow>([
      (byId.data ?? []) as PaymentRow[],
      (byCheckout.data ?? []) as PaymentRow[],
      (byIntent.data ?? []) as PaymentRow[],
      (byDispute.data ?? []) as PaymentRow[],
    ]).slice(0, limit);
    return rows.map((r) => ({
      kind: 'payment',
      id: r.id,
      title: r.label || `Payment ${r.id.slice(0, 8)}`,
      subtitle: `${r.status} · ${usd(r.amount)}`,
      href: `/admin/payments/${r.id}`,
    }));
  } catch {
    return [];
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
    return { accounts: [], clients: [], quickStops: [], payments: [] };
  }

  const [accounts, clients, quickStops, payments] = await Promise.all([
    searchAccounts(admin, term, limit),
    searchClients(admin, term, limit),
    searchQuickStops(admin, term, limit),
    searchPayments(admin, term, limit),
  ]);

  return { accounts, clients, quickStops, payments };
}
