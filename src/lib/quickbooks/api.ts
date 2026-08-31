import { quickBooksApiHost } from './oauth';
import type { ActiveConnection } from './connection';
import { escapeQboString } from './map';

/**
 * The QuickBooks Online REST calls, and nothing else.
 *
 * Kept apart from sync.ts so the mapping and the orchestration can be read
 * without wading through fetch plumbing, and so a transport change (a minor
 * version bump, a new error shape) lands in one file.
 */

const MINOR_VERSION = 70;

export class QuickBooksApiError extends Error {
  readonly status: number;
  /** Intuit's own code, e.g. 6240 duplicate name. Worth branching on. */
  readonly code: string | null;
  constructor(message: string, status: number, code: string | null) {
    super(message);
    this.name = 'QuickBooksApiError';
    this.status = status;
    this.code = code;
  }
}

type Fault = {
  Fault?: { Error?: { Message?: string; Detail?: string; code?: string }[] };
};

/**
 * Intuit returns 200 with a Fault body about as often as it returns a 4xx, so
 * the body is parsed before the status is trusted.
 */
async function parseOrThrow(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  let body: Record<string, unknown> = {};
  try {
    body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    if (!response.ok) throw new QuickBooksApiError(text.slice(0, 300) || `HTTP ${response.status}`, response.status, null);
    return {};
  }
  const fault = (body as Fault).Fault?.Error?.[0];
  if (fault) {
    // Detail carries the useful half ("Duplicate Name Exists Error : ...") while
    // Message is usually a category.
    const message = [fault.Message, fault.Detail].filter(Boolean).join(' — ').slice(0, 300);
    throw new QuickBooksApiError(message || 'QuickBooks rejected the request.', response.status, fault.code ?? null);
  }
  if (!response.ok) {
    throw new QuickBooksApiError(`HTTP ${response.status}`, response.status, null);
  }
  return body;
}

function base(connection: ActiveConnection): string {
  return `${quickBooksApiHost()}/v3/company/${connection.realmId}`;
}

function headers(connection: ActiveConnection): HeadersInit {
  return {
    Authorization: `Bearer ${connection.accessToken}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
}

/**
 * Read via QuickBooks' query language.
 *
 * Callers must pass values through escapeQboString — a customer named O'Brien
 * otherwise closes the string early. There is no parameter binding to fall back
 * on; this endpoint takes one string.
 */
export async function qboQuery<T = Record<string, unknown>>(
  connection: ActiveConnection,
  statement: string,
): Promise<T[]> {
  const url = `${base(connection)}/query?minorversion=${MINOR_VERSION}&query=${encodeURIComponent(statement)}`;
  const response = await fetch(url, {
    headers: headers(connection),
    cache: 'no-store',
    signal: AbortSignal.timeout(12000),
  });
  const body = await parseOrThrow(response);

  const query = (body.QueryResponse ?? {}) as Record<string, unknown>;
  // The result key is the entity name — Customer, Item, Invoice — and is simply
  // absent when nothing matched, rather than an empty array.
  const first = Object.values(query).find((value) => Array.isArray(value));
  return (first as T[]) ?? [];
}

/**
 * Create an entity.
 *
 * `requestId` is Intuit's own idempotency key: replay the same one and they
 * return the original object instead of making a second. We pass the row's uuid,
 * which makes a retried sweep safe even if our own write of qbo_id was the thing
 * that failed — the single most dangerous moment in this whole feature.
 */
export async function qboCreate(
  connection: ActiveConnection,
  entity: 'Customer' | 'Invoice' | 'Payment' | 'Item',
  payload: Record<string, unknown>,
  requestId?: string,
): Promise<Record<string, unknown>> {
  const params = new URLSearchParams({ minorversion: String(MINOR_VERSION) });
  if (requestId) params.set('requestid', requestId.slice(0, 50));
  const response = await fetch(`${base(connection)}/${entity.toLowerCase()}?${params.toString()}`, {
    method: 'POST',
    headers: headers(connection),
    body: JSON.stringify(payload),
    cache: 'no-store',
    signal: AbortSignal.timeout(12000),
  });
  const body = await parseOrThrow(response);

  const created = body[entity] as Record<string, unknown> | undefined;
  if (!created?.Id) throw new QuickBooksApiError(`QuickBooks created no ${entity}.`, response.status, null);
  return created;
}

/** Does this company calculate its own sales tax? Decides whether we may send any. */
export async function qboAutomatedSalesTax(connection: ActiveConnection): Promise<boolean> {
  const rows = await qboQuery<Record<string, unknown>>(connection, 'select * from Preferences');
  const prefs = rows[0] ?? {};
  const tax = (prefs.TaxPrefs ?? {}) as Record<string, unknown>;
  // PartnerTaxEnabled is Intuit's name for Automated Sales Tax. Absent on
  // companies old enough to predate it, which are the ones we CAN send tax to.
  return Boolean(tax.PartnerTaxEnabled);
}

export async function qboFindCustomerByName(
  connection: ActiveConnection,
  name: string,
): Promise<string | null> {
  const rows = await qboQuery<{ Id?: string }>(
    connection,
    `select Id from Customer where DisplayName = '${escapeQboString(name.trim())}'`,
  );
  return rows[0]?.Id ?? null;
}

/**
 * A service item to hang invoice lines off.
 *
 * Every QuickBooks sales line needs an item. We reuse whatever service item the
 * company already has rather than adding ours to their price list — a
 * contractor's item list is something they curate, and a book full of
 * one-per-line entries created by us would be ours to apologise for.
 */
export async function qboResolveServiceItem(connection: ActiveConnection): Promise<string> {
  const existing = await qboQuery<{ Id?: string }>(
    connection,
    "select Id from Item where Type = 'Service' and Active = true maxresults 1",
  );
  if (existing[0]?.Id) return existing[0].Id;

  const income = await qboQuery<{ Id?: string }>(
    connection,
    "select Id from Account where AccountType = 'Income' and Active = true maxresults 1",
  );
  const incomeId = income[0]?.Id;
  if (!incomeId) {
    throw new QuickBooksApiError('This QuickBooks company has no income account to post work to.', 400, null);
  }
  const created = await qboCreate(connection, 'Item', {
    Name: 'Services',
    Type: 'Service',
    IncomeAccountRef: { value: incomeId },
  });
  return String(created.Id);
}
