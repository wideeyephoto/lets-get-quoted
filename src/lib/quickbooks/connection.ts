import { createAdminClient } from '@/lib/auth';
import {
  accessTokenExpired, expiryFromNow, refreshTokenExpired, refreshTokens,
  quickBooksEnvironment, type QuickBooksEnvironment,
} from './oauth';

// Reading, refreshing and storing a contractor's QuickBooks connection.
//
// Always through the ADMIN client. quickbooks_connections has RLS on and no
// policy at all, so a session-scoped client sees nothing — see the migration for
// why that is deliberate rather than an oversight.
//
// Nothing here returns a token to a caller that doesn't need one.

export type ConnectionStatus =
  | { state: 'unconfigured' }
  | { state: 'not_connected' }
  | {
      state: 'connected';
      companyName: string | null;
      realmId: string;
      connectedAt: string;
      environment: QuickBooksEnvironment;
      /** When the sweep last ran, and what it did — Settings shows both. */
      lastSyncAt: string | null;
      lastSyncSummary: string | null;
      /** Invoices dated before this are left alone. Null means send everything. */
      syncFrom: string | null;
      /** How many sent/paid invoices sit before the cutoff, so Settings can offer them. */
      backlog: number;
    }
  | { state: 'needs_reconnect'; companyName: string | null; reason: string };

type ConnectionRow = {
  account_id: string;
  realm_id: string;
  company_name: string | null;
  access_token: string;
  refresh_token: string;
  access_expires_at: string;
  refresh_expires_at: string;
  environment: QuickBooksEnvironment;
  connected_at: string;
  disconnected_at: string | null;
  last_error: string | null;
  last_sync_at?: string | null;
  last_sync_summary?: string | null;
  sync_from?: string | null;
};

/**
 * The row, or null. A missing TABLE is also null: the feature ships before the
 * migration is applied, and a page that throws because a table doesn't exist yet
 * is worse than one that says "not connected".
 */
async function loadRow(accountId: string): Promise<ConnectionRow | null> {
  try {
    const { data, error } = await createAdminClient()
      .from('quickbooks_connections')
      .select('*')
      .eq('account_id', accountId)
      .maybeSingle();
    if (error) return null;
    return (data as ConnectionRow) ?? null;
  } catch {
    return null;
  }
}

export async function saveConnection(input: {
  accountId: string;
  realmId: string;
  companyName?: string | null;
  accessToken: string;
  refreshToken: string;
  accessExpiresIn: number;
  refreshExpiresIn: number;
  connectedBy?: string | null;
}): Promise<void> {
  const now = Date.now();
  const { error } = await createAdminClient()
    .from('quickbooks_connections')
    .upsert({
      account_id: input.accountId,
      realm_id: input.realmId,
      company_name: input.companyName ?? null,
      access_token: input.accessToken,
      refresh_token: input.refreshToken,
      access_expires_at: expiryFromNow(input.accessExpiresIn, now),
      refresh_expires_at: expiryFromNow(input.refreshExpiresIn, now),
      environment: quickBooksEnvironment(),
      connected_at: new Date(now).toISOString(),
      connected_by: input.connectedBy ?? null,
      disconnected_at: null,
      last_error: null,
      updated_at: new Date(now).toISOString(),
    }, { onConflict: 'account_id' });
  if (error) throw new Error(error.message);

  // A new link starts syncing from NOW, so connecting can never push a
  // contractor's whole history into books they have been keeping by hand.
  // Backfilling is a separate, deliberate choice.
  //
  // Set in its own statement rather than in the upsert above, and only when
  // empty, so reconnecting after a token expiry doesn't reset a decision
  // somebody already made. A real disconnect deletes the row, which is the one
  // case where starting over is correct.
  await createAdminClient()
    .from('quickbooks_connections')
    .update({ sync_from: new Date(now).toISOString() })
    .eq('account_id', input.accountId)
    .is('sync_from', null);
}

export async function deleteConnection(accountId: string): Promise<void> {
  await createAdminClient().from('quickbooks_connections').delete().eq('account_id', accountId);
}

/** Record why a connection stopped working, so Settings can say something specific. */
async function markBroken(accountId: string, reason: string): Promise<void> {
  await createAdminClient()
    .from('quickbooks_connections')
    .update({ disconnected_at: new Date().toISOString(), last_error: reason.slice(0, 300), updated_at: new Date().toISOString() })
    .eq('account_id', accountId);
}

/** What Settings shows. Never includes a token. */
export async function connectionStatus(accountId: string): Promise<ConnectionStatus> {
  if (!process.env.QUICKBOOKS_CLIENT_ID || !process.env.QUICKBOOKS_CLIENT_SECRET) {
    return { state: 'unconfigured' };
  }
  const row = await loadRow(accountId);
  if (!row) return { state: 'not_connected' };

  if (row.disconnected_at) {
    return { state: 'needs_reconnect', companyName: row.company_name, reason: row.last_error || 'The connection stopped working.' };
  }
  if (refreshTokenExpired(row.refresh_expires_at)) {
    return {
      state: 'needs_reconnect',
      companyName: row.company_name,
      // Named precisely because it is not the owner's fault and not a bug:
      // Intuit expires the credential after 100 days regardless of use.
      reason: 'QuickBooks expires a connection after 100 days. Reconnect to carry on.',
    };
  }
  // A sandbox row against production credentials (or the reverse) cannot work,
  // and the resulting 401s look like a broken integration rather than leftover
  // test data.
  if (row.environment !== quickBooksEnvironment()) {
    return {
      state: 'needs_reconnect',
      companyName: row.company_name,
      reason: `This connection was made against QuickBooks ${row.environment}. Reconnect to use ${quickBooksEnvironment()}.`,
    };
  }

  return {
    state: 'connected',
    companyName: row.company_name,
    realmId: row.realm_id,
    connectedAt: row.connected_at,
    environment: row.environment,
    // Nullable rather than required: these columns arrive with the sync
    // migration, and a deploy that lands before it must not break Settings.
    lastSyncAt: row.last_sync_at ?? null,
    lastSyncSummary: row.last_sync_summary ?? null,
    syncFrom: row.sync_from ?? null,
    backlog: row.sync_from ? await backlogBefore(accountId, row.sync_from) : 0,
  };
}

/**
 * Sent or paid invoices dated before the cutoff — the ones linking QuickBooks
 * deliberately did NOT send.
 *
 * Counted rather than listed: the number is the whole decision ("there are 214
 * older invoices, do you want them too"), and loading them to say so would cost
 * a page render for a question most people answer once.
 */
export async function backlogBefore(accountId: string, syncFrom: string): Promise<number> {
  const { count } = await createAdminClient()
    .from('invoices')
    .select('id', { count: 'exact', head: true })
    .eq('account_id', accountId)
    .is('qbo_id', null)
    .in('status', ['sent', 'signed', 'paid'])
    .lt('created_at', syncFrom);
  return count ?? 0;
}

export type ActiveConnection = { accessToken: string; realmId: string };

/**
 * A usable access token, refreshing first if needed.
 *
 * Returns null rather than throwing when the owner has to act — a sync job
 * hitting an expired connection is a normal state of the world, not an
 * exception, and the caller decides whether that's worth telling anyone about.
 */
export async function activeConnection(accountId: string): Promise<ActiveConnection | null> {
  const row = await loadRow(accountId);
  if (!row || row.disconnected_at) return null;
  if (row.environment !== quickBooksEnvironment()) return null;

  if (!accessTokenExpired(row.access_expires_at)) {
    return { accessToken: row.access_token, realmId: row.realm_id };
  }

  if (refreshTokenExpired(row.refresh_expires_at)) {
    await markBroken(accountId, 'QuickBooks expires a connection after 100 days. Reconnect to carry on.');
    return null;
  }

  try {
    const tokens = await refreshTokens(row.refresh_token);
    const now = Date.now();
    // Both tokens written back together. Intuit rotates the refresh token on
    // every refresh and invalidates the old one, so storing only the access
    // token would work for an hour and then lock the account out permanently.
    const { error } = await createAdminClient()
      .from('quickbooks_connections')
      .update({
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken,
        access_expires_at: expiryFromNow(tokens.accessExpiresIn, now),
        refresh_expires_at: expiryFromNow(tokens.refreshExpiresIn, now),
        last_error: null,
        updated_at: new Date(now).toISOString(),
      })
      .eq('account_id', accountId);
    if (error) throw new Error(error.message);
    return { accessToken: tokens.accessToken, realmId: row.realm_id };
  } catch (error) {
    await markBroken(accountId, error instanceof Error ? error.message : 'Refresh failed.');
    return null;
  }
}
