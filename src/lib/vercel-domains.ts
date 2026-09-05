import 'server-only';

export type VercelDomainVerification = {
  type: string;
  domain: string;
  value: string;
  reason?: string;
};

// DNS/certificate eligibility is not proof that a certificate has been issued.
export type VercelDomainConfig = {
  configured: boolean;
  misconfigured: boolean;
  recommendedCname?: string;
  recommendedIp?: string;
};

export type VercelDomainResponse = {
  name: string;
  apexName: string;
  projectId: string;
  verified: boolean;
  verification?: VercelDomainVerification[];
  redirect?: string | null;
  gitBranch?: string | null;
  customEnvironmentId?: string | null;
};

function getVercelConfig() {
  return {
    token: process.env.VERCEL_AUTH_TOKEN || process.env.VERCEL_TOKEN,
    projectId: process.env.VERCEL_PROJECT_ID,
    teamId: process.env.VERCEL_TEAM_ID,
  };
}

export function isVercelDomainProvisioningConfigured(): boolean {
  const { token, projectId } = getVercelConfig();
  return Boolean(token && projectId);
}

async function domainRequest<T>(path: string, method = 'GET', body?: object): Promise<T | null> {
  const { token, projectId, teamId } = getVercelConfig();
  if (!token || !projectId) return null;
  const url = new URL(path, 'https://api.vercel.com');
  if (teamId) url.searchParams.set('teamId', teamId);
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
    cache: 'no-store',
    signal: AbortSignal.timeout(10000),
  });
  if (res.status === 404 && (method === 'GET' || method === 'DELETE')) return null;
  if (!res.ok) throw new Error(`Domain provider request failed (${res.status}).`);
  if (res.status === 204) return null;
  return await res.json() as T;
}

function projectDomainPath(domain?: string) {
  const { projectId } = getVercelConfig();
  return `/v9/projects/${encodeURIComponent(projectId || '')}/domains${domain ? `/${encodeURIComponent(domain)}` : ''}`;
}

function validateProjectDomain(result: VercelDomainResponse | null, domain: string) {
  const { projectId } = getVercelConfig();
  if (result && (result.name !== domain || result.projectId !== projectId || typeof result.verified !== 'boolean')) {
    throw new Error('Invalid project domain response.');
  }
  return result;
}

export async function getProjectDomain(domain: string): Promise<VercelDomainResponse | null> {
  return validateProjectDomain(await domainRequest<VercelDomainResponse>(projectDomainPath(domain)), domain);
}

/** Idempotent attachment: retries must inspect the existing project binding. */
export async function addDomainToVercel(domain: string): Promise<VercelDomainResponse | null> {
  const existing = await getProjectDomain(domain);
  if (existing) return existing;
  try {
    return validateProjectDomain(await domainRequest<VercelDomainResponse>(projectDomainPath().replace('/v9/', '/v10/'), 'POST', { name: domain }), domain);
  } catch (error) {
    // Another request can attach between GET and POST. Only an actual binding
    // on THIS project counts as success; a provider error alone never does.
    const attached = await getProjectDomain(domain);
    if (attached) return attached;
    throw error;
  }
}

export async function verifyVercelDomain(domain: string): Promise<VercelDomainResponse | null> {
  return validateProjectDomain(await domainRequest<VercelDomainResponse>(`${projectDomainPath(domain)}/verify`, 'POST'), domain);
}

export async function getVercelDomainConfig(domain: string): Promise<VercelDomainConfig | null> {
  const { projectId } = getVercelConfig();
  const result = await domainRequest<{
    misconfigured?: boolean;
    recommendedCNAME?: Array<{ rank: number; value: string }>;
    recommendedIPv4?: Array<{ rank: number; value: string[] }>;
  }>(`/v6/domains/${encodeURIComponent(domain)}/config?projectIdOrName=${encodeURIComponent(projectId || '')}`);
  if (!result) return null;
  return {
    configured: result.misconfigured === false,
    misconfigured: result.misconfigured !== false,
    recommendedCname: result.recommendedCNAME?.slice().sort((a, b) => a.rank - b.rank)[0]?.value.replace(/\.$/, ''),
    recommendedIp: result.recommendedIPv4?.slice().sort((a, b) => a.rank - b.rank)[0]?.value[0],
  };
}

export async function removeDomainFromVercel(domain: string): Promise<boolean> {
  if (!isVercelDomainProvisioningConfigured()) return false;
  try {
    await domainRequest(projectDomainPath(domain), 'DELETE');
    return true;
  } catch (error) {
    console.error('Failed to remove project domain:', error);
    return false;
  }
}
