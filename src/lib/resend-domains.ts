import 'server-only';

export type SendingDomainRecord = {
  type: 'TXT' | 'MX' | 'CNAME';
  name: string;
  value: string;
  priority?: number;
  ttl?: string;
  status?: string;
};

export type SendingDomainStatus = 'not_started' | 'pending' | 'verified' | 'failed' | 'temporary_failure';

export type SendingDomainResponse = {
  id: string;
  name: string;
  status: SendingDomainStatus;
  records: SendingDomainRecord[];
};

interface ResendApiRecord {
  record?: string;
  name: string;
  type: string;
  value: string;
  ttl?: string;
  status?: string;
  priority?: number;
}

interface ResendApiDomain {
  id: string;
  name: string;
  status?: string;
  records?: ResendApiRecord[];
}

function getApiKey(): string | undefined {
  return process.env.RESEND_API_KEY;
}

export function isSendingDomainProvisioningConfigured(): boolean {
  return Boolean(getApiKey());
}

export function isEmailSendingDomainsFeatureEnabled(): boolean {
  if (process.env.LGQ_EMAIL_SENDING_DOMAINS_ENABLED === 'false') {
    return false;
  }
  if (process.env.NODE_ENV === 'production') {
    return process.env.LGQ_EMAIL_SENDING_DOMAINS_ENABLED === 'true';
  }
  return true;
}

function normalizeStatus(status?: string): SendingDomainStatus {
  if (status === 'verified') return 'verified';
  if (status === 'pending') return 'pending';
  if (status === 'not_started') return 'not_started';
  if (status === 'temporary_failure') return 'temporary_failure';
  return 'failed';
}

/**
 * The four states the DATABASE understands. Deliberately narrower than
 * SendingDomainStatus, which is the PROVIDER's vocabulary.
 */
export type StoredSendingDomainStatus = 'pending' | 'verified' | 'failed' | 'disabled';

/**
 * Translate the provider's vocabulary into the column's.
 *
 * These are two different vocabularies and they were being written to one
 * column. `email_sending_domains.status` is constrained to
 * pending|verified|failed|disabled, but Resend answers a freshly created domain
 * with `not_started` — so the very first write of every connection attempt was
 * a check-constraint violation (23514), and the UI has no badge for those two
 * states either.
 *
 * WHY MAP RATHER THAN WIDEN THE CHECK. `disabled` is ours and the provider
 * never returns it; `not_started` and `temporary_failure` are both "the DNS is
 * not in place yet, keep waiting", which is exactly what `pending` already
 * means to the reconciler and to the badge. Widening would push two extra
 * states into every consumer to say nothing new — and would need a second
 * migration against a table already applied in production.
 *
 * The distinction that IS worth keeping — transient provider failure vs. records
 * genuinely absent — is preserved in `failure_reason`, not in `status`.
 */
export function toStoredStatus(status: SendingDomainStatus): StoredSendingDomainStatus {
  if (status === 'verified') return 'verified';
  if (status === 'failed') return 'failed';
  return 'pending';
}

/** The reason line that accompanies a stored status, or null when healthy. */
export function failureReasonFor(status: SendingDomainStatus): string | null {
  if (status === 'failed') {
    return 'Required DNS records (DKIM / SPF) were not detected at your DNS provider.';
  }
  if (status === 'temporary_failure') {
    return 'The provider could not complete verification this time and will retry. No action needed yet.';
  }
  return null;
}

function mapDomainResponse(data: ResendApiDomain): SendingDomainResponse {
  const records: SendingDomainRecord[] = Array.isArray(data.records)
    ? data.records.map((r) => ({
        type: (r.type === 'MX' ? 'MX' : r.type === 'CNAME' ? 'CNAME' : 'TXT'),
        name: r.name,
        value: r.value,
        priority: typeof r.priority === 'number' ? r.priority : undefined,
        ttl: r.ttl,
        status: r.status,
      }))
    : [];

  return {
    id: data.id,
    name: data.name,
    status: normalizeStatus(data.status),
    records,
  };
}

async function resendRequest<T>(path: string, method = 'GET', body?: object): Promise<T | null> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('RESEND_API_KEY is not configured.');
  }

  const url = new URL(path, 'https://api.resend.com');
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    cache: 'no-store',
    signal: AbortSignal.timeout(10000),
  });

  if (res.status === 404 && (method === 'GET' || method === 'DELETE')) {
    return null;
  }
  if (!res.ok) {
    const errorBody = await res.text().catch(() => '');
    throw new Error(`Resend API error (${res.status}): ${errorBody || res.statusText}`);
  }
  if (res.status === 204) {
    return null;
  }
  return (await res.json()) as T;
}

async function findExistingDomain(domain: string): Promise<string | null> {
  const target = domain.trim().toLowerCase();
  try {
    const listRes = await resendRequest<{ data?: Array<{ id: string; name: string }> }>('/domains', 'GET');
    const existing = listRes?.data?.find((d) => d.name.trim().toLowerCase() === target);
    return existing?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Idempotently create a domain at Resend.
 * Inspects existing domains first, and on error checks again to avoid duplicates on retries.
 */
export async function createSendingDomain(domain: string): Promise<SendingDomainResponse> {
  const cleanDomain = domain.trim().toLowerCase();
  const existingId = await findExistingDomain(cleanDomain);
  if (existingId) {
    const existing = await getSendingDomain(existingId);
    if (existing) return existing;
  }

  try {
    const created = await resendRequest<ResendApiDomain>('/domains', 'POST', { name: cleanDomain });
    if (!created?.id) {
      throw new Error('Resend did not return a domain ID upon creation.');
    }
    return mapDomainResponse(created);
  } catch (error) {
    // Retry check for race condition
    const racedId = await findExistingDomain(cleanDomain);
    if (racedId) {
      const raced = await getSendingDomain(racedId);
      if (raced) return raced;
    }
    throw error;
  }
}

export async function getSendingDomain(id: string): Promise<SendingDomainResponse | null> {
  const result = await resendRequest<ResendApiDomain>(`/domains/${encodeURIComponent(id)}`, 'GET');
  if (!result) return null;
  return mapDomainResponse(result);
}

export async function triggerSendingDomainVerify(id: string): Promise<SendingDomainResponse | null> {
  await resendRequest(`/domains/${encodeURIComponent(id)}/verify`, 'POST');
  return await getSendingDomain(id);
}

export async function deleteSendingDomain(id: string): Promise<boolean> {
  try {
    await resendRequest(`/domains/${encodeURIComponent(id)}`, 'DELETE');
    return true;
  } catch (err) {
    return false;
  }
}

export { normalizeStatus };

const RFC_RESERVED_LOCAL_PARTS = new Set([
  'abuse',
  'postmaster',
  'admin',
  'webmaster',
  'hostmaster',
  'root',
  'security',
  'noc',
]);

/**
 * Validates the mailbox local-part for a contractor's custom from address.
 * Conforms to RFC 2142 reserved word boundaries and safe character constraints.
 */
export function validateFromLocalPart(localPart: string): { valid: boolean; error?: string } {
  const clean = String(localPart ?? '').trim().toLowerCase();
  if (!clean) {
    return { valid: false, error: 'Email prefix cannot be empty.' };
  }
  if (clean.length > 32) {
    return { valid: false, error: 'Email prefix must be 32 characters or fewer.' };
  }
  if (RFC_RESERVED_LOCAL_PARTS.has(clean)) {
    return { valid: false, error: `"${clean}" is a reserved system address and cannot be used.` };
  }
  if (!/^[a-z0-9]([a-z0-9._-]{0,30}[a-z0-9])?$/.test(clean)) {
    return {
      valid: false,
      error: 'Email prefix must start and end with a letter or number, and contain only letters, numbers, dots, dashes, or underscores.',
    };
  }
  return { valid: true };
}

/**
 * Filter DNS records to protect the contractor's existing mail infrastructure.
 *
 * Resend issues records for subdomains (send.theirdomain.com and resend._domainkey).
 * If the provider response ever suggests an apex MX record or replaces the apex SPF record,
 * we must drop it and warn rather than rendering it — instructing an owner to change
 * their apex MX breaks their existing Google Workspace or Microsoft 365 email.
 */
export function filterSafeSendingDnsRecords(
  records: SendingDomainRecord[],
  domain: string,
): {
  safeRecords: SendingDomainRecord[];
  droppedRecords: SendingDomainRecord[];
  warnings: string[];
} {
  const cleanDomain = domain.trim().toLowerCase();
  const safeRecords: SendingDomainRecord[] = [];
  const droppedRecords: SendingDomainRecord[] = [];
  const warnings: string[] = [];

  for (const record of records) {
    const rawName = (record.name || '').trim().toLowerCase();
    // In DNS convention, apex can be expressed as '@', empty string, or the domain itself
    const isApex = rawName === cleanDomain || rawName === '@' || rawName === '';

    if (record.type === 'MX' && isApex) {
      droppedRecords.push(record);
      warnings.push(
        `Refused apex MX record for ${cleanDomain}. Existing mailbox provider (Google Workspace, Office 365, etc.) must not be overwritten.`,
      );
      continue;
    }

    if (record.type === 'TXT' && isApex && String(record.value || '').toLowerCase().includes('v=spf1')) {
      droppedRecords.push(record);
      warnings.push(
        `Refused apex SPF record for ${cleanDomain}. Outbound SPF alignment must use the delegated send subdomain.`,
      );
      continue;
    }

    safeRecords.push(record);
  }

  return { safeRecords, droppedRecords, warnings };
}

