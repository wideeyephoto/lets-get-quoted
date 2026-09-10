import type { SupabaseClient } from '@supabase/supabase-js';

export type ClosureDomainTarget = {
  kind: 'website' | 'email';
  domain: string;
  bindingId: string;
  providerId?: string;
  subdomain?: string | null;
};

export type ClosureDomainRelease = (target: ClosureDomainTarget) => Promise<boolean>;

function parseTargets(value: unknown): ClosureDomainTarget[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error('Domain cleanup targets are missing');
  for (const target of value) {
    if (!target || !['website', 'email'].includes(target.kind) || typeof target.domain !== 'string'
      || typeof target.bindingId !== 'string' || !target.bindingId
      || target.domain.length > 253 || !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/.test(target.domain)
      || target.domain === 'letsgetquoted.com' || target.domain.endsWith('.letsgetquoted.com')
      || target.domain.endsWith('.vercel.app')
      || (target.kind === 'email' && (typeof target.providerId !== 'string' || !target.providerId))) {
      throw new Error('Invalid or incomplete domain cleanup target; operator review required');
    }
  }
  return value as ClosureDomainTarget[];
}

/** Re-check the durable lease and ownership before every bounded provider call. */
export async function releaseClosureDomains(
  admin: SupabaseClient,
  jobId: string,
  leaseToken: string,
  version: number,
  release?: ClosureDomainRelease,
): Promise<void> {
  if (!release) throw new Error('Domain cleanup adapter is not configured');
  const prepare = async () => {
    const { data, error } = await admin.rpc('prepare_closure_domain_cleanup', {
      p_job_id: jobId, p_lease_token: leaseToken, p_expected_version: version,
    });
    if (error) throw new Error(`Domain cleanup authorization failed: ${error.message}`);
    return parseTargets(data);
  };
  const targets = await prepare();
  for (let index = 0; index < targets.length; index++) {
    const target = targets[index];
    if (index > 0 && JSON.stringify(await prepare()) !== JSON.stringify(targets)) {
      throw new Error('Domain cleanup targets changed during processing');
    }
    if (!await release(target)) throw new Error(`Could not release ${target.kind} domain ${target.domain}`);
  }
}

export const releaseProductionClosureDomain: ClosureDomainRelease = async target => {
  if (target.kind === 'website') {
    const { revalidatePublicSiteCache } = await import('@/lib/cached-sites');
    const { removeDomainFromVercel } = await import('@/lib/vercel-domains');
    // The prepare RPC already removed the route, even if provider removal fails.
    revalidatePublicSiteCache({ customDomain: target.domain, subdomain: target.subdomain });
    return removeDomainFromVercel(target.domain);
  }
  const { getSendingDomain, deleteSendingDomain } = await import('@/lib/resend-domains');
  const provider = await getSendingDomain(target.providerId!);
  if (!provider) return true; // A confirmed 404 is an idempotent release.
  if (provider.name.trim().toLowerCase() !== target.domain) {
    throw new Error('Saved email provider ID belongs to a different domain');
  }
  return deleteSendingDomain(target.providerId!);
};
