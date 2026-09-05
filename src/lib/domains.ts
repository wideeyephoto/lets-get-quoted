import 'server-only';
import { Resolver } from 'dns/promises';
import {
  addDomainToVercel,
  getProjectDomain,
  getVercelDomainConfig,
  isVercelDomainProvisioningConfigured,
  verifyVercelDomain,
  type VercelDomainVerification,
} from '@/lib/vercel-domains';
import { checkDomainTls } from '@/lib/domain-tls';
import { resolveTenantHost } from '@/lib/tenant-host';

export type DomainVerification = {
  verified: boolean;
  dnsVerified: boolean;
  records: string[];
  expectedCname: string;
  expectedIp: string | null;
  isApex: boolean;
  apexDomain: string;
  subdomain: string | null;
  sslStatus: 'issued' | 'pending' | 'error' | 'unconfigured';
  vercelConfigured: boolean;
  verification: VercelDomainVerification[];
  message: string;
};

export function normalizeDomain(value: string) {
  return value.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/\.$/, '');
}

export function validateCustomDomain(value: string) {
  const domain = normalizeDomain(value);
  if (!/^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain)) {
    throw new Error('Enter a valid domain such as www.yourbusiness.com or yourbusiness.com.');
  }
  const root = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'letsgetquoted.com';
  if (resolveTenantHost(domain, root).kind !== 'customDomain'
    || resolveTenantHost(domain, 'letsgetquoted.com').kind !== 'customDomain'
    || /\.(localhost|local|internal|test|invalid|example)$/.test(domain)) {
    throw new Error('Use a domain you own outside the platform domain.');
  }
  return domain;
}

export function parseDomainParts(domainValue: string) {
  const domain = normalizeDomain(domainValue);
  const parts = domain.split('.');
  const isApex = parts.length === 2;
  const apexDomain = isApex ? domain : parts.slice(-2).join('.');
  const subdomain = isApex ? null : parts.slice(0, -2).join('.');
  return { domain, isApex, apexDomain, subdomain };
}

/** Activation requires project ownership, eligible DNS, and a trusted TLS handshake. */
export async function verifyDomain(domainValue: string, { provision = true } = {}): Promise<DomainVerification> {
  const domain = validateCustomDomain(domainValue);
  const { isApex, apexDomain, subdomain } = parseDomainParts(domain);
  const expectedCname = (process.env.CUSTOM_DOMAIN_CNAME_TARGET || 'domains.letsgetquoted.com').toLowerCase().replace(/\.$/, '');
  const expectedIp = process.env.CUSTOM_DOMAIN_A_RECORD || '76.76.21.21';
  const resolver = new Resolver({ timeout: 2000, tries: 2 });
  const [cnames, ips] = await Promise.all([
    resolver.resolveCname(domain).catch(() => [] as string[]),
    resolver.resolve4(domain).catch(() => [] as string[]),
  ]);
  const records = [...cnames.map((record) => record.toLowerCase().replace(/\.$/, '')), ...ips];
  const result: DomainVerification = {
    verified: false,
    dnsVerified: records.includes(expectedCname) || records.includes(expectedIp),
    records, expectedCname, expectedIp, isApex, apexDomain, subdomain,
    sslStatus: 'unconfigured',
    vercelConfigured: isVercelDomainProvisioningConfigured(),
    verification: [],
    message: 'Custom domain hosting is not configured yet. Contact support; your free subdomain remains available.',
  };
  if (!result.vercelConfigured) return result;

  try {
    let binding = provision ? await addDomainToVercel(domain) : await getProjectDomain(domain);
    if (!binding || binding.name !== domain) throw new Error('Domain was not attached to the project.');
    if (binding.apexName && (domain === binding.apexName || domain.endsWith(`.${binding.apexName}`))) {
      result.apexDomain = binding.apexName;
      result.isApex = domain === binding.apexName;
      result.subdomain = result.isApex ? null : domain.slice(0, -(binding.apexName.length + 1));
    }
    result.verification = binding.verification || [];
    if (!binding.verified && provision) {
      binding = await verifyVercelDomain(domain);
      if (!binding || binding.name !== domain) throw new Error('Domain ownership could not be checked.');
      result.verification = binding.verification || [];
    }
    if (binding.redirect || binding.gitBranch || binding.customEnvironmentId) {
      throw new Error('Domain is not bound to the production website.');
    }

    const config = await getVercelDomainConfig(domain);
    if (!config) throw new Error('Domain DNS configuration could not be checked.');
    result.expectedCname = config.recommendedCname || expectedCname;
    result.expectedIp = config.recommendedIp || expectedIp;
    // Vercel also understands flattened CNAMEs and project-specific IPs. A
    // hard-coded legacy A record cannot decide whether this domain is ready.
    result.dnsVerified = config.configured && !config.misconfigured;
    result.sslStatus = 'pending';
    if (!binding.verified) {
      result.message = 'Domain ownership verification is pending. Add the verification records below, then check again.';
    } else if (!result.dnsVerified) {
      result.message = 'DNS is not ready for secure hosting. Use the records below, remove conflicting A/AAAA records, and keep any proxy set to DNS only, then check again.';
    } else if (!await checkDomainTls(domain)) {
      result.message = 'DNS is ready, but a secure connection is not available yet. Check again after the SSL certificate finishes provisioning. If this persists, contact support to check CAA records and SSL setup.';
    } else {
      result.verified = true;
      result.sslStatus = 'issued';
      result.message = 'Custom domain connected with active SSL.';
    }
  } catch (error) {
    console.error('Custom domain verification failed:', error);
    result.sslStatus = 'error';
    result.message = 'Custom domain setup could not be completed. Try checking again, or contact support if this persists. Your free subdomain remains available.';
  }
  return result;
}
