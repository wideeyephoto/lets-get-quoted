import 'server-only';

/**
 * Vercel Edge Domains API client.
 *
 * Provides zero-touch SSL certificate provisioning and edge routing configuration
 * when contractors link custom domains.
 *
 * When VERCEL_AUTH_TOKEN and VERCEL_PROJECT_ID are configured, this client:
 * 1. Registers the domain on the Vercel project (`addDomainToVercel`).
 * 2. Triggers Vercel verification and SSL issuance (`verifyVercelDomain`).
 * 3. Retrieves SSL certificate status and DNS configuration requirements (`getVercelDomainConfig`).
 * 4. Cleans up project domain bindings when a contractor updates or disconnects (`removeDomainFromVercel`).
 *
 * If credentials are not set (e.g. local dev / test), functions return null/safe defaults without failing.
 */

export type VercelDomainConfig = {
  configured: boolean;
  misconfigured?: boolean;
  ssl?: {
    status: 'issued' | 'pending' | 'error' | 'none';
    details?: string;
  };
  verification?: Array<{
    type: string;
    domain: string;
    value: string;
    reason?: string;
  }>;
};

export type VercelDomainResponse = {
  name: string;
  apexName: string;
  projectId: string;
  verified: boolean;
  verification?: Array<{
    type: string;
    domain: string;
    value: string;
    reason?: string;
  }>;
  error?: {
    code: string;
    message: string;
  };
};

function getVercelConfig() {
  const token = process.env.VERCEL_AUTH_TOKEN || process.env.VERCEL_TOKEN || null;
  const projectId = process.env.VERCEL_PROJECT_ID || null;
  const teamId = process.env.VERCEL_TEAM_ID || null;
  return { token, projectId, teamId };
}

export function isVercelDomainProvisioningConfigured(): boolean {
  const { token, projectId } = getVercelConfig();
  return Boolean(token && projectId);
}

function buildUrl(path: string, teamId: string | null): string {
  const base = `https://api.vercel.com${path}`;
  if (!teamId) return base;
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}teamId=${encodeURIComponent(teamId)}`;
}

/**
 * Adds a domain to the Vercel project.
 */
export async function addDomainToVercel(domain: string): Promise<VercelDomainResponse | null> {
  const { token, projectId, teamId } = getVercelConfig();
  if (!token || !projectId) return null;

  try {
    const url = buildUrl(`/v10/projects/${encodeURIComponent(projectId)}/domains`, teamId);
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: domain }),
      cache: 'no-store',
    });

    const json = (await res.json()) as VercelDomainResponse;
    return json;
  } catch (err) {
    console.error('Failed to add domain to Vercel:', err);
    return null;
  }
}

/**
 * Triggers domain DNS verification on Vercel.
 */
export async function verifyVercelDomain(domain: string): Promise<VercelDomainResponse | null> {
  const { token, projectId, teamId } = getVercelConfig();
  if (!token || !projectId) return null;

  try {
    const url = buildUrl(`/v9/projects/${encodeURIComponent(projectId)}/domains/${encodeURIComponent(domain)}/verify`, teamId);
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    });

    const json = (await res.json()) as VercelDomainResponse;
    return json;
  } catch (err) {
    console.error('Failed to verify domain on Vercel:', err);
    return null;
  }
}

/**
 * Inspects domain configuration and SSL certificate status.
 */
export async function getVercelDomainConfig(domain: string): Promise<VercelDomainConfig | null> {
  const { token, teamId } = getVercelConfig();
  if (!token) return null;

  try {
    const url = buildUrl(`/v6/domains/${encodeURIComponent(domain)}/config`, teamId);
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });

    if (!res.ok) return null;
    const json = (await res.json()) as {
      misconfigured?: boolean;
      cnames?: string[];
      aValues?: string[];
      ssl?: { status?: string };
    };

    const sslStatus: 'issued' | 'pending' | 'error' =
      json.ssl?.status === 'issued' || json.ssl?.status === 'pending' || json.ssl?.status === 'error'
        ? json.ssl.status
        : 'pending';

    return {
      configured: !json.misconfigured,
      misconfigured: Boolean(json.misconfigured),
      ssl: {
        status: sslStatus,
      },
    };
  } catch (err) {
    console.error('Failed to get domain config from Vercel:', err);
    return null;
  }
}

/**
 * Retrieves project domain details from Vercel.
 */
export async function getProjectDomain(domain: string): Promise<VercelDomainResponse | null> {
  const { token, projectId, teamId } = getVercelConfig();
  if (!token || !projectId) return null;

  try {
    const url = buildUrl(`/v9/projects/${encodeURIComponent(projectId)}/domains/${encodeURIComponent(domain)}`, teamId);
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });

    if (!res.ok) return null;
    return (await res.json()) as VercelDomainResponse;
  } catch (err) {
    console.error('Failed to get project domain from Vercel:', err);
    return null;
  }
}

/**
 * Unbinds/removes domain from the Vercel project.
 */
export async function removeDomainFromVercel(domain: string): Promise<boolean> {
  const { token, projectId, teamId } = getVercelConfig();
  if (!token || !projectId) return true;

  try {
    const url = buildUrl(`/v9/projects/${encodeURIComponent(projectId)}/domains/${encodeURIComponent(domain)}`, teamId);
    const res = await fetch(url, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });

    return res.ok;
  } catch (err) {
    console.error('Failed to remove domain from Vercel:', err);
    return false;
  }
}

